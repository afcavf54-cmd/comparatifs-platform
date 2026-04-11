'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function EditorialPage() {
  const { siteId } = useParams()
  const [editorial, setEditorial] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [sheetUrl, setSheetUrl] = useState('')

  const editorialPath = `platform/sites/${siteId}/editorial.json`

  useEffect(() => {
    // Load site config for sheet URL
    fetch(`/api/sites/${siteId}`).then(r => r.json()).then(d => {
      if (d.sheet_csv_url) setSheetUrl(d.sheet_csv_url)
    })
    // Load editorial
    fetch(`/api/github?path=${encodeURIComponent(editorialPath)}`).then(r => r.json()).then(d => {
      if (d.content) {
        try { setEditorial(JSON.parse(d.content)) } catch {}
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [siteId])

  const pairs = Object.keys(editorial).filter(k =>
    !search || k.toLowerCase().includes(search.toLowerCase())
  )

  const selectedData = selected ? editorial[selected] : null

  function updateField(field: string, value: string) {
    if (!selected) return
    setEditorial(prev => ({ ...prev, [selected]: { ...prev[selected], [field]: value } }))
  }

  async function saveEditorial() {
    setSaving(true)
    setMsg('')
    const r = await fetch('/api/github', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: editorialPath, content: JSON.stringify(editorial, null, 2), message: `HUB: Update editorial ${siteId}` })
    })
    const d = await r.json()
    setMsg(d.ok ? '✓ Sauvegardé' : '✗ Erreur')
    setSaving(false)
  }

  async function generateAll() {
    if (!sheetUrl) { setMsg('✗ Configurez d\'abord le Sheet CSV dans Données'); return }
    setGenerating(true)
    setMsg('')

    try {
      // Load products from sheet
      const r = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: sheetUrl }) })
      const sheetData = await r.json()
      if (sheetData.error) { setMsg('✗ ' + sheetData.error); setGenerating(false); return }

      const products = sheetData.rows
      const slugs = [...new Set(products.map((p: any) => p.slug))].sort() as string[]
      const allPairs: [string, string][] = []
      for (let i = 0; i < slugs.length; i++)
        for (let j = i + 1; j < slugs.length; j++)
          allPairs.push([slugs[i], slugs[j]])

      const CHUNK = 5
      const newEditorial: Record<string, any> = { ...editorial }

      for (let i = 0; i < allPairs.length; i += CHUNK) {
        const batch = allPairs.slice(i, i + CHUNK)
        const batchNum = Math.floor(i / CHUNK) + 1
        setMsg(`🤖 Batch ${batchNum}/${Math.ceil(allPairs.length / CHUNK)}...`)

        const pairsData = batch.map(([a, b]) => ({
          key: `${a}-vs-${b}`,
          a: products.find((p: any) => p.slug === a),
          b: products.find((p: any) => p.slug === b)
        }))

        const prompt = `Expert en investissement et rédacteur SEO. Génère des textes éditoriaux UNIQUES pour ${batch.length} pages comparatives.

Chaque texte doit être spécifique à la paire, contextualisé, avec du gras <strong> sur les éléments clés. 4 paragraphes par description. Aucun tiret long (—).

Paires :
${JSON.stringify(pairsData, null, 2)}

Réponds UNIQUEMENT en JSON valide sans backticks :
{"cle-paire": {"description_a": "4 paragraphes HTML sur produit A", "description_b": "4 paragraphes HTML sur produit B", "points_forts_a": ["p1","p2","p3","p4"], "points_faibles_a": ["p1","p2","p3"], "points_forts_b": ["p1","p2","p3","p4"], "points_faibles_b": ["p1","p2","p3"], "verdict_si_a": ["profil1","profil2","profil3"], "verdict_si_b": ["profil1","profil2","profil3"], "mix_text": "Texte HTML unique sur pourquoi investir dans les deux"}}`

        try {
          const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
          })
          const apiData = await apiRes.json()
          let text = apiData.content?.[0]?.text?.trim() || ''
          text = text.replace(/```json?/g, '').replace(/```/g, '').trim()
          const parsed = JSON.parse(text)
          Object.assign(newEditorial, parsed)
          setMsg(`✓ Batch ${batchNum} OK`)
        } catch (e) {
          setMsg(`⚠ Batch ${batchNum} échoué`)
        }
        setEditorial({ ...newEditorial })
      }

      // Save
      setMsg('📤 Sauvegarde...')
      const saveRes = await fetch('/api/github', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: editorialPath, content: JSON.stringify(newEditorial, null, 2), message: `HUB: Generate editorial ${siteId}` })
      })
      const saveData = await saveRes.json()
      setMsg(saveData.ok ? `✅ ${Object.keys(newEditorial).length} paires générées et sauvegardées` : '✗ Erreur sauvegarde')
    } catch (e: any) {
      setMsg('✗ ' + e.message)
    }
    setGenerating(false)
  }

  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 20, fontSize: 13, color: '#8B9CB0' }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Sites</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none' }}>{siteId}</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: '#fff' }}>Éditorial</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Éditorial</h1>
          <p style={{ color: '#8B9CB0', fontSize: 13, margin: '4px 0 0' }}>{pairs.length} paires • {Object.keys(editorial).length} total</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('✅') || msg.startsWith('✓') ? '#00D4AA' : msg.startsWith('✗') ? '#FC8181' : '#F6AD55', maxWidth: 300 }}>{msg}</span>}
          <button onClick={generateAll} disabled={generating} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: generating ? '#1E2D3D' : '#1E2D3D', color: generating ? '#4A5568' : '#F6AD55', cursor: generating ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13 }}>
            {generating ? '⏳ Génération...' : '🤖 Générer tout'}
          </button>
          <button onClick={saveEditorial} disabled={saving} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            {saving ? '...' : '💾 Sauvegarder'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden' }}>
        {/* Pairs list */}
        <div style={{ width: 260, display: 'flex', flexDirection: 'column', background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: 12 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une paire..."
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {loading ? <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 20 }}>Chargement...</div> : (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {pairs.map(key => (
                <div key={key} onClick={() => setSelected(key)} style={{
                  padding: '10px 14px', cursor: 'pointer', fontSize: 12,
                  background: selected === key ? 'rgba(0,212,170,0.1)' : 'transparent',
                  borderLeft: selected === key ? '2px solid #00D4AA' : '2px solid transparent',
                  color: selected === key ? '#fff' : '#8B9CB0',
                  borderBottom: '1px solid #1E2D3D'
                }}>
                  {key.replace(/-vs-/, ' vs ').replace(/-/g, ' ')}
                </div>
              ))}
              {pairs.length === 0 && <div style={{ color: '#4A5568', padding: 20, fontSize: 12, textAlign: 'center' }}>Aucune paire{search ? ' trouvée' : ' — Générez l\'éditorial'}</div>}
            </div>
          )}
        </div>

        {/* Editor */}
        <div style={{ flex: 1, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!selectedData ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A5568', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 40 }}>✍️</div>
              <div>Sélectionnez une paire pour éditer</div>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              <h3 style={{ color: '#00D4AA', margin: '0 0 16px', fontSize: 14, fontWeight: 600 }}>{selected}</h3>
              {[
                { field: 'description_a', label: 'Description A', rows: 8 },
                { field: 'description_b', label: 'Description B', rows: 8 },
                { field: 'mix_text', label: 'Et si les deux ?', rows: 4 },
              ].map(({ field, label, rows }) => (
                <div key={field} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
                  <textarea
                    value={selectedData[field] || ''} rows={rows}
                    onChange={e => updateField(field, e.target.value)}
                    style={{ width: '100%', padding: 12, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
              {['points_forts_a', 'points_faibles_a', 'points_forts_b', 'points_faibles_b', 'verdict_si_a', 'verdict_si_b'].map(field => (
                <div key={field} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{field.replace(/_/g, ' ')}</div>
                  <textarea
                    value={(selectedData[field] || []).join('\n')} rows={4}
                    onChange={e => updateField(field, e.target.value.split('\n') as any)}
                    style={{ width: '100%', padding: 12, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                  <div style={{ fontSize: 10, color: '#4A5568', marginTop: 4 }}>Un item par ligne</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
