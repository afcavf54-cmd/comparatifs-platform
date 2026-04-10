'use client'

import { useState } from 'react'

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTSv0469bN0_2nPikgVhe825g74RbMjaVZFvjJnDSydA-C98NcrCJJiHZdX8-V9xeMW-cklNBRou3vK/pub?gid=0&single=true&output=csv"
const GITHUB_PATH   = "platform/sites/scpi/editorial.json"

function parseCSV(text: string) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const cols: string[] = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
      else { cur += ch }
    }
    cols.push(cur.trim())
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (cols[i] || '').replace(/^"|"$/g, '').trim() })
    return obj
  }).filter(r => r.slug && r.disponible !== '0')
}

function makePairs(products: Record<string, string>[]) {
  const slugs = [...new Set(products.map(p => p.slug))].sort()
  const pairs: [string, string][] = []
  for (let i = 0; i < slugs.length; i++)
    for (let j = i + 1; j < slugs.length; j++)
      pairs.push([slugs[i], slugs[j]])
  return pairs
}

function fmt(p: Record<string, string>) {
  return {
    nom: p.nom, marque: p.marque, type: p.type,
    td: p.td, tri: p.tri, tri_horizon: p.tri_horizon,
    frais_souscription: p.frais_souscription, frais_gestion: p.frais_gestion,
    prix_achat: p.prix_achat, tof: p.tof, endettement: p.endettement,
    capitalisation: p.capitalisation, delai_jouissance: p.delai_jouissance,
    pays: p.pays, geo: p.geo, secteurs: p.secteurs,
  }
}

export default function EditorialPage() {
  const [log, setLog]       = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone]     = useState(false)

  function addLog(msg: string) {
    setLog(prev => [...prev, msg])
  }

  async function generateAll() {
    setRunning(true)
    setDone(false)
    setLog([])

    // 1. Charge le Sheet
    addLog('📥 Chargement Sheet CSV...')
    let products: Record<string, string>[]
    try {
      const res = await fetch(SHEET_CSV_URL + '&t=' + Date.now())
      const text = await res.text()
      products = parseCSV(text)
      addLog(`✓ ${products.length} SCPI chargées`)
    } catch (e) {
      addLog(`✗ Erreur Sheet : ${e}`)
      setRunning(false)
      return
    }

    const prodMap: Record<string, Record<string, string>> = {}
    products.forEach(p => { prodMap[p.slug] = p })
    const pairs = makePairs(products)
    addLog(`📊 ${pairs.length} paires à générer`)

    // 2. Génère par batch de 5
    const CHUNK = 5
    const result: Record<string, unknown> = {}

    for (let i = 0; i < pairs.length; i += CHUNK) {
      const batch = pairs.slice(i, i + CHUNK)
      const batchNum = Math.floor(i / CHUNK) + 1
      const totalBatches = Math.ceil(pairs.length / CHUNK)
      addLog(`🤖 Batch ${batchNum}/${totalBatches} : ${batch.length} paires...`)

      const pairsData = batch.map(([a, b]) => ({
        key: `${a}-vs-${b}`,
        a: fmt(prodMap[a]),
        b: fmt(prodMap[b])
      }))

      const prompt = `Expert SCPI et rédacteur SEO. Génère des textes éditoriaux UNIQUES pour ${batch.length} pages comparatifs SCPI.

Chaque texte doit être SPÉCIFIQUE à la paire — pas générique. Met en avant ce qui distingue ces deux SCPI l'une par rapport à l'autre dans CE contexte précis. Utilise tes connaissances du marché SCPI 2025-2026.

Paires :
${JSON.stringify(pairsData, null, 2)}

Réponds UNIQUEMENT en JSON valide :
{
  "cle-paire": {
    "description_a": "2 paragraphes contextuels sur SCPI A vs B spécifiquement",
    "description_b": "2 paragraphes contextuels sur SCPI B vs A spécifiquement",
    "points_forts_a": ["point 1", "point 2", "point 3", "point 4"],
    "points_faibles_a": ["point 1", "point 2", "point 3"],
    "points_forts_b": ["point 1", "point 2", "point 3", "point 4"],
    "points_faibles_b": ["point 1", "point 2", "point 3"],
    "verdict_si_a": ["profil 1", "profil 2", "profil 3"],
    "verdict_si_b": ["profil 1", "profil 2", "profil 3"]
  }
}

Textes contextuels à la paire, français expert et concis. Pas de répétition des chiffres du tableau.`

      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            messages: [{ role: 'user', content: prompt }]
          })
        })
        const data = await res.json()
        let text = data.content?.[0]?.text?.trim() || ''
        if (text.startsWith('```')) text = text.split('\n').slice(1).join('\n')
        if (text.endsWith('```')) text = text.split('\n').slice(0, -1).join('\n')
        const parsed = JSON.parse(text)
        Object.assign(result, parsed)
        addLog(`  ✓ Batch ${batchNum} OK (${Object.keys(parsed).length} paires)`)
      } catch (e) {
        addLog(`  ⚠ Batch ${batchNum} échoué : ${e}`)
      }
    }

    addLog(`\n✅ ${Object.keys(result).length}/${pairs.length} paires générées`)

    // 3. Push editorial.json dans GitHub
    addLog('📤 Push editorial.json dans GitHub...')
    try {
      const content = JSON.stringify(result, null, 2)
      const res = await fetch('/api/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: GITHUB_PATH,
          content,
          message: `Update editorial.json — ${Object.keys(result).length} paires`
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      addLog('✓ editorial.json publié dans GitHub')
      addLog('\n🚀 Lance maintenant le workflow GitHub Actions pour déployer!')
      setDone(true)
    } catch (e) {
      addLog(`✗ Erreur push GitHub : ${e}`)
    }

    setRunning(false)
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <a href="/" style={{ fontSize: 13, color: '#A09890', textDecoration: 'none' }}>← Dashboard</a>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: '4px 0 4px' }}>Éditorial SCPI</h1>
          <p style={{ fontSize: 13, color: '#6B6560', margin: 0 }}>
            Génère les 45 textes uniques puis lance le workflow pour déployer
          </p>
        </div>
        <button
          onClick={generateAll}
          disabled={running}
          style={{
            padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            background: running ? '#ccc' : '#E8410A', color: '#fff', border: 'none',
            cursor: running ? 'not-allowed' : 'pointer'
          }}
        >
          {running ? '⏳ Génération...' : '🤖 Générer les 45 textes'}
        </button>
      </div>

      {done && (
        <div style={{ padding: '12px 16px', background: '#EAF3DE', border: '1px solid #C0DD97', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#27500A' }}>
          ✅ Terminé — <a href="https://github.com/afcavf54-cmd/comparatifs-platform/actions" target="_blank" rel="noopener noreferrer" style={{ color: '#27500A', fontWeight: 600 }}>Lance le workflow GitHub Actions →</a>
        </div>
      )}

      {log.length > 0 && (
        <div style={{
          background: '#0F1A2E', borderRadius: 12, padding: '20px 24px',
          fontFamily: 'monospace', fontSize: 13, lineHeight: 1.8, color: '#E0DDD8',
          maxHeight: 500, overflowY: 'auto'
        }}>
          {log.map((line, i) => (
            <div key={i} style={{ color: line.startsWith('✗') ? '#FF6B6B' : line.startsWith('✓') ? '#90D090' : '#E0DDD8' }}>
              {line}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, padding: '16px 20px', background: '#F7F4EF', borderRadius: 10, fontSize: 12, color: '#6B6560', lineHeight: 1.8 }}>
        <strong>Comment ça marche</strong><br />
        1. Charge les 10 SCPI depuis le Sheet Google<br />
        2. Génère 45 textes uniques via l'API Claude (9 batches de 5)<br />
        3. Sauvegarde le résultat dans <code>editorial.json</code> dans GitHub<br />
        4. Le workflow GitHub Actions lit ce fichier pour générer les pages HTML
      </div>
    </div>
  )
}
