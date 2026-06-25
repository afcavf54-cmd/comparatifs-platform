'use client'
import React from 'react'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'



// ── HtmlEditor v2 (visuel + source) ─────────────────────────────────────
function HtmlEditor({ value, onChange, rows = 8, placeholder }: { value: string, onChange: (v: string) => void, rows?: number, placeholder?: string }) {
  const [mode, setMode] = React.useState<'visual'|'source'>('visual')
  const editorRef = React.useRef<HTMLDivElement>(null)
  const taRef = React.useRef<HTMLTextAreaElement>(null)

  function onVisualInput() {
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }

  function switchMode(m: 'visual'|'source') {
    if (m === 'visual' && editorRef.current) {
      editorRef.current.innerHTML = value
    }
    setMode(m)
  }

  function exec(cmd: string, val?: string) {
    editorRef.current?.focus()
    document.execCommand(cmd, false, val)
    setTimeout(() => { if (editorRef.current) onChange(editorRef.current.innerHTML) }, 0)
  }

  function wrapSource(before: string, after: string) {
    const ta = taRef.current; if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    onChange(value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e))
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + before.length, e + before.length) }, 0)
  }

  function blockSource(tag: string) {
    const ta = taRef.current; if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const sel = value.slice(s, e) || 'Titre'
    const open = '<' + tag + '>'; const close = '</' + tag + '>'
    onChange(value.slice(0, s) + open + sel + close + '\n' + value.slice(e))
  }

  const tabBtn = (m: 'visual'|'source', label: string) => ({
    padding: '4px 12px', borderRadius: '6px 6px 0 0', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
    background: mode === m ? '#0D1117' : '#0A0E1A',
    color: mode === m ? '#00D4AA' : '#4A5568',
    borderBottom: mode === m ? '2px solid #00D4AA' : '2px solid transparent'
  })
  const btn: React.CSSProperties = { padding: '3px 9px', borderRadius: 5, border: '1px solid #1E2D3D', background: '#0A0E1A', color: '#8B9CB0', cursor: 'pointer', fontSize: 12, fontWeight: 600 }

  return (
    <div style={{ border: '1px solid #1E2D3D', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', background: '#0A0E1A', borderBottom: '1px solid #1E2D3D', padding: '0 8px', gap: 4 }}>
        <button style={tabBtn('visual','Visuel')} onClick={() => switchMode('visual')}>✏️ Visuel</button>
        <button style={tabBtn('source','HTML')} onClick={() => switchMode('source')}>{'</>'} HTML</button>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '5px 8px', background: '#0A0E1A', borderBottom: '1px solid #1E2D3D', flexWrap: 'wrap' as const }}>
        {mode === 'visual' ? (<>
          <button style={btn} onClick={() => exec('bold')}><b>B</b></button>
          <button style={btn} onClick={() => exec('italic')}><i>I</i></button>
          <span style={{ width: 1, background: '#1E2D3D', margin: '0 2px' }} />
          <button style={btn} onClick={() => exec('formatBlock', 'h2')}>H2</button>
          <button style={btn} onClick={() => exec('formatBlock', 'h3')}>H3</button>
          <button style={btn} onClick={() => exec('formatBlock', 'p')}>¶</button>
          <span style={{ width: 1, background: '#1E2D3D', margin: '0 2px' }} />
          <button style={btn} onClick={() => exec('insertUnorderedList')}>ul</button>
          <button style={btn} onClick={() => exec('removeFormat')}>✕ Format</button>
        </>) : (<>
          <button style={btn} onClick={() => wrapSource('<strong>', '</strong>')}><b>B</b></button>
          <button style={btn} onClick={() => wrapSource('<em>', '</em>')}><i>I</i></button>
          <span style={{ width: 1, background: '#1E2D3D', margin: '0 2px' }} />
          <button style={btn} onClick={() => blockSource('h2')}>H2</button>
          <button style={btn} onClick={() => blockSource('h3')}>H3</button>
          <button style={btn} onClick={() => wrapSource('<p>', '</p>\n')}>¶</button>
          <button style={btn} onClick={() => wrapSource('<ul>\n', '\n</ul>\n')}>ul</button>
          <button style={btn} onClick={() => wrapSource('<li>', '</li>')}>li</button>
        </>)}
      </div>

      {mode === 'visual' && (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={onVisualInput}
          dangerouslySetInnerHTML={{ __html: value }}
          style={{
            minHeight: (rows * 22) + 'px', padding: 14, background: '#0D1117', color: '#E2E8F0',
            fontSize: 14, lineHeight: 1.7, outline: 'none', fontFamily: 'inherit'
          }}
        />
      )}

      {mode === 'source' && (
        <textarea ref={taRef} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ width: '100%', padding: 12, background: '#0D1117', border: 'none', color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, outline: 'none', fontFamily: 'monospace', resize: 'vertical', minHeight: (rows * 22) + 'px', boxSizing: 'border-box' as const, display: 'block' }} />
      )}
    </div>
  )
}
// ── fin HtmlEditor ────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
// Helper de parsing JSON défensif.
// Si une réponse n'est pas du JSON valide (HTML 500, body vide, etc.),
// on log précisément l'URL et le début du body pour pouvoir diagnostiquer
// (console F12). Évite le crash silencieux "JSON.parse: unexpected character
// at line 1 column 1" qui ne dit pas quel endpoint a échoué.
// ─────────────────────────────────────────────────────────────────────
async function safeJson(r: Response, urlHint: string): Promise<any | null> {
  const text = await r.text()
  if (!text) {
    console.error(`[safeJson] Réponse vide : ${urlHint} (status ${r.status})`)
    return null
  }
  try {
    return JSON.parse(text)
  } catch (e: any) {
    console.error(
      `[safeJson] JSON.parse fail sur ${urlHint} (status ${r.status}) :`,
      text.slice(0, 300),
      e?.message
    )
    return null
  }
}

// Compresse une string en gzip + base64 via CompressionStream (browser natif).
// Utilisé pour les payloads > 4 MB qui dépassent la limite Vercel POST.
// Sur du JSON répétitif, ratio ~7-10x : 18 MB → ~2 MB → ~2.7 MB base64.
async function gzipToBase64(str: string): Promise<string> {
  const blob = new Blob([str])
  const stream = blob.stream().pipeThrough(new CompressionStream('gzip'))
  const compressedBlob = await new Response(stream).blob()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // result = "data:application/octet-stream;base64,XXXXX" → on garde après la virgule
      resolve(result.split(',')[1] || '')
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(compressedBlob)
  })
}

export default function ClassementsPage() {
  const { siteId } = useParams()
  const [classements, setClassements] = useState<Record<string, any>>({})
  const [products, setProducts] = useState<any[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({})
  const [deploying, setDeploying] = useState(false)
  const [generatingMeta, setGeneratingMeta] = useState(false)
  const [expandedBrands, setExpandedBrands] = useState<Record<string, boolean>>({})
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({})
  const [keywordCategories, setKeywordCategories] = useState<Record<string, string>>({})
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ seo: true })
  function toggleSection(key: string) { setExpandedSections(p => ({ ...p, [key]: !p[key] })) }

  const [showAddBrand, setShowAddBrand] = useState(false)
  const [newBrand, setNewBrand] = useState({ nom: '', slug: '', description: '', points_forts: '', points_faibles: '' })
  const [generatingBrand, setGeneratingBrand] = useState(false)
  const [schemaPrompts, setSchemaPrompts] = useState<Record<string, string>>({})
  const [generatingSections, setGeneratingSections] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState('')

  const [allKeywords, setAllKeywords] = useState<Array<{name:string, slug:string, parent:string, count:number}>>([])
  const [enabledSlugs, setEnabledSlugs] = useState<Set<string>>(new Set())
  const [isLegacyMode, setIsLegacyMode] = useState<boolean>(true)
  const [enabledCollapsed, setEnabledCollapsed] = useState<boolean>(false)
  const [savingEnabled, setSavingEnabled] = useState<boolean>(false)
  const [enabledMsg, setEnabledMsg] = useState<string>('')

  const editorialPath = `platform/sites/${siteId}/editorial.json`
  const enabledPath = `platform/sites/${siteId}/enabled_classements.json`

  useEffect(() => {
    fetch(`/api/sites/${siteId}`).then(r => r.json()).then(async d => {
      if (d.sheet_csv_url) {
        const r = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: d.sheet_csv_url }) })
        const sd = await r.json()
        if (!sd.error) setProducts(sd.rows || [])
      }
    })
    fetch(`/api/github?path=${encodeURIComponent(`platform/sites/${siteId}/config.yaml`)}`).then(r => r.json()).then(async cfg => {
      if (!cfg.content) return
      const classementMatch = cfg.content.match(/classement:\s*(\S+)/)
      if (!classementMatch) return
      const schemaName = classementMatch[1]
      const sr = await fetch(`/api/github?path=${encodeURIComponent(`platform/schemas/${schemaName}.json`)}`)
      const sd = await sr.json()
      if (!sd.content) return
      try {
        const schema = JSON.parse(sd.content)
        const allProducts: any[] = []
        Object.entries(schema.keywords || {}).forEach(([kwName, kw]: [string, any]) => {
          if (Array.isArray(kw.__products)) {
            kw.__products.forEach((p: any) => allProducts.push({ ...p, __keyword: kwName }))
          }
        })
        if (allProducts.length > 0) setProducts(prev => prev.length > 0 ? prev : allProducts)
        const kwCats: Record<string, string> = {}
        const allKw: Array<{name:string, slug:string, parent:string, count:number}> = []
        Object.entries(schema.keywords || {}).forEach(([kwName, kwData]: [string, any]) => {
          const slug = kwName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            .replace(/[\u2019\u2018']/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
          kwCats[`classement-${slug}`] = kwData.__categorie || 'Autres'
          allKw.push({
            name: kwName,
            slug,
            parent: kwData.__categorie || 'Autres',
            count: Array.isArray(kwData.__products) ? kwData.__products.length : 0,
          })
        })
        setKeywordCategories(kwCats)
        allKw.sort((a, b) => a.parent === b.parent ? a.name.localeCompare(b.name) : a.parent.localeCompare(b.parent))
        setAllKeywords(allKw)

        try {
          const er = await fetch(`/api/github?path=${encodeURIComponent(enabledPath)}`)
          if (er.ok) {
            const ed = await er.json()
            if (ed.content) {
              try {
                const parsed = JSON.parse(ed.content)
                const list = Array.isArray(parsed.classements) ? parsed.classements : []
                setEnabledSlugs(new Set(list.map((s:any) => String(s).trim().toLowerCase()).filter(Boolean)))
                setIsLegacyMode(false)
              } catch {
                setIsLegacyMode(true)
                setEnabledSlugs(new Set(allKw.map(k => k.slug)))
              }
            } else {
              setIsLegacyMode(true)
              setEnabledSlugs(new Set(allKw.map(k => k.slug)))
            }
          } else {
            setIsLegacyMode(true)
            setEnabledSlugs(new Set(allKw.map(k => k.slug)))
          }
        } catch {
          setIsLegacyMode(true)
          setEnabledSlugs(new Set(allKw.map(k => k.slug)))
        }
      } catch {}
    }).catch(() => {})
    fetch(`/api/github?path=${encodeURIComponent(editorialPath)}`).then(r => r.json()).then(d => {
      if (d.content) {
        try {
          const all = JSON.parse(d.content)
          const cls: Record<string, any> = {}
          const prods: Record<string, any> = {}
          for (const [k, v] of Object.entries(all)) {
            if (k.startsWith('classement-prod-')) prods[k] = v
            else if (k.startsWith('classement-')) cls[k] = v
          }
          for (const [clsKey, clsVal] of Object.entries(cls)) {
            const cat_slug = clsKey.replace('classement-', '')
            for (const [prodKey, prodVal] of Object.entries(prods)) {
              const slug = prodKey.replace('classement-prod-', '')
              ;(cls[clsKey] as any)[`prod_${slug}`] = prodVal
            }
          }
          setClassements(cls)
          if (Object.keys(cls).length > 0) setSelected(Object.keys(cls)[0])
        } catch {}
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [siteId])

  const categories = [...new Set(products.map(p => p.categorie).filter(Boolean))] as string[]
  const categoriesWithoutContent = categories.filter(cat => {
    const slug = cat.toLowerCase().replace(/ /g, '-').replace(/_/g, '-')
    return !classements[`classement-${slug}`]
  })

  async function deploy() {
    setDeploying(true); setMsg('')
    const r = await fetch(`/api/sites/${siteId}/deploy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skip_enrich: true })
    })
    const d = await r.json()
    setMsg(d.success ? '✓ Déploiement lancé' : '✗ Erreur déploiement')
    setDeploying(false)
  }

  async function save() {
    // v6 : tous les fetch passent par safeJson() pour diagnostiquer
    // l'erreur "JSON.parse unexpected character" qui crashait silencieusement.
    setSaving(true); setMsg('')
    try {
      await saveEnabledClassements()

      const r = await fetch(`/api/github?path=${encodeURIComponent(editorialPath)}`)
      const d = await safeJson(r, `GET /api/github?path=${editorialPath}`)
      let allEditorial: Record<string, any> = {}
      if (d?.content) { try { allEditorial = JSON.parse(d.content) } catch {} }
      // ── FIX duplication : extraire les `prod_*` embeddés dans les classements ──
      // Au load, on injecte chaque produit dans chaque classement pour faciliter
      // l'UI (cls[clsKey]['prod_X'] = prodVal). Mais ces données sont déjà
      // stockées top-level en `classement-prod-X`. Sans extraction, on POUSSE
      // cette duplication dans GitHub → 19 MB au lieu de ~200 Ko sur startuponly.
      const cleanedClassements: Record<string, any> = {}
      const extractedProds: Record<string, any> = {}
      for (const [clsKey, clsVal] of Object.entries(classements)) {
        const cleaned: Record<string, any> = {}
        for (const [field, value] of Object.entries(clsVal as Record<string, any>)) {
          if (field.startsWith('prod_')) {
            const slug = field.replace('prod_', '')
            extractedProds[`classement-prod-${slug}`] = value
          } else {
            cleaned[field] = value
          }
        }
        cleanedClassements[clsKey] = cleaned
      }
      // Merge : existant top-level + classements nettoyés + produits extraits.
      // Les produits extraits écrasent ceux d'existant (dernière édition gagne).
      const merged = { ...allEditorial, ...cleanedClassements, ...extractedProds }
      const jsonStr = JSON.stringify(merged, null, 2)
      const payloadSizeMb = jsonStr.length / 1024 / 1024
      const totalKeys = Object.keys(merged).length
      console.log(`[save] editorial.json : ${payloadSizeMb.toFixed(2)} MB, ${totalKeys} clés (${Object.keys(cleanedClassements).length} classements + ${Object.keys(extractedProds).length} produits extraits)`)

      // ── Stratégie de sauvegarde selon la taille ────────────────────────
      // < 3 MB raw  → POST /api/github (1 commit, rapide)
      // 3-30 MB raw → POST /api/sites/<id>/editorial-bulk en chunks gzippés
      //   (le serveur merge progressivement, 1 commit par chunk)
      // > 30 MB raw → on rejette explicitement (architecture à refactorer)
      const SIMPLE_THRESHOLD = 3 * 1024 * 1024     // 3 MB raw : route classique
      const CHUNK_TARGET_RAW = 2 * 1024 * 1024     // 2 MB raw par chunk avant gzip
      const HARD_LIMIT = 30 * 1024 * 1024          // 30 MB raw : refuse

      if (jsonStr.length > HARD_LIMIT) {
        setMsg(`✗ editorial.json trop gros (${payloadSizeMb.toFixed(1)} MB > 30 MB). Architecture à refactorer (split en fichiers par classement).`)
        return
      }

      if (jsonStr.length < SIMPLE_THRESHOLD) {
        // ── Route simple ───────────────────────────────────────────────
        const wr = await fetch('/api/github', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: editorialPath, content: jsonStr, message: `HUB: Update classements ${siteId}` })
        })
        const wd = await safeJson(wr, `POST /api/github (editorial save)`)
        if (!wd) { setMsg(`✗ Réponse invalide (status ${wr.status}, voir console)`); return }
        setMsg(wd.ok ? `✓ Tout sauvegardé (${payloadSizeMb.toFixed(2)} MB)` : `✗ ${wd.error || 'Erreur editorial'}`)
      } else {
        // ── Chunking : split par clés, gzip chaque chunk, PUT séquentiel ─
        // Le serveur en mode 'merge' lit editorial.json, applique le chunk, PUT.
        // Chaque chunk fait UN commit GitHub : N chunks = N commits (acceptable).
        const keys = Object.keys(merged)
        const chunks: Array<Record<string, any>> = []
        let current: Record<string, any> = {}
        let currentSize = 0
        for (const k of keys) {
          const v = merged[k]
          const sizeKey = JSON.stringify({ [k]: v }).length
          // Si la clé seule dépasse le target, on la met quand même dans son
          // propre chunk (sinon boucle infinie). Limite hard = 4 MB gzippé ;
          // le serveur rejettera si vraiment trop gros.
          if (currentSize > 0 && currentSize + sizeKey > CHUNK_TARGET_RAW) {
            chunks.push(current)
            current = {}
            currentSize = 0
          }
          current[k] = v
          currentSize += sizeKey
        }
        if (currentSize > 0) chunks.push(current)

        console.log(`[save] Split en ${chunks.length} chunks de ~${(CHUNK_TARGET_RAW / 1024 / 1024).toFixed(1)} MB chacun`)

        for (let i = 0; i < chunks.length; i++) {
          setMsg(`💾 Sauvegarde chunk ${i + 1}/${chunks.length}…`)
          const chunkJson = JSON.stringify(chunks[i])
          const chunkRawMb = chunkJson.length / 1024 / 1024
          const t0 = performance.now()
          const chunkGzip = await gzipToBase64(chunkJson)
          const chunkCompressedMb = (chunkGzip.length * 0.75) / 1024 / 1024
          console.log(`[save] Chunk ${i + 1}/${chunks.length} : ${chunkRawMb.toFixed(2)} MB → ${chunkCompressedMb.toFixed(2)} MB gzip en ${(performance.now() - t0).toFixed(0)} ms (${Object.keys(chunks[i]).length} clés)`)

          if (chunkGzip.length > 4 * 1024 * 1024) {
            setMsg(`✗ Chunk ${i + 1} encore trop gros après gzip (${(chunkGzip.length / 1024 / 1024).toFixed(1)} MB). Une clé individuelle est probablement énorme.`)
            return
          }

          const wr = await fetch(`/api/sites/${siteId}/editorial-bulk`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content_gzip_base64: chunkGzip,
              mode: 'merge',
              chunk_idx: i,
              total_chunks: chunks.length,
              message: `HUB: Update classements ${siteId} [chunk ${i + 1}/${chunks.length}]`,
            })
          })
          const wd = await safeJson(wr, `POST /api/sites/${siteId}/editorial-bulk chunk ${i + 1}`)
          if (!wd?.ok) {
            setMsg(`✗ Chunk ${i + 1} échec : ${wd?.error || 'erreur inconnue'} (voir console)`)
            return
          }
        }
        setMsg(`✓ Tout sauvegardé (${payloadSizeMb.toFixed(2)} MB en ${chunks.length} chunks)`)
      }
    } catch (e: any) {
      console.error('[save] Exception non gérée :', e)
      setMsg('✗ ' + (e?.message || 'Erreur sauvegarde'))
    } finally {
      setSaving(false)
    }
  }

  async function regeneratePage(catKey: string) {
    setRegenerating(prev => ({ ...prev, [catKey]: true })); setMsg('')
    try {
      const r = await fetch(`/api/github?path=${encodeURIComponent(editorialPath)}`)
      const d = await r.json()
      let allEditorial: Record<string, any> = {}
      if (d.content) { try { allEditorial = JSON.parse(d.content) } catch {} }

      delete allEditorial[catKey]

      const wr = await fetch('/api/github', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: editorialPath, content: JSON.stringify(allEditorial, null, 2), message: `HUB: Reset classement ${catKey} for regeneration` })
      })
      const wd = await wr.json()
      if (!wd.ok) { setMsg('✗ Erreur sauvegarde'); return }

      setClassements(prev => {
        const next = { ...prev }
        delete next[catKey]
        return next
      })
      if (selected === catKey) setSelected(null)

      setDeploying(true)
      const dr = await fetch(`/api/sites/${siteId}/deploy`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skip_enrich: false, skipExisting: true })
      })
      const dd = await dr.json()
      setMsg(dd.success ? '✓ Régénération lancée (~3 min)' : '✗ Erreur déploiement')
    } catch (e: any) {
      setMsg('✗ ' + e.message)
    }
    setRegenerating(prev => ({ ...prev, [catKey]: false }))
    setDeploying(false)
  }

  function updateField(catKey: string, field: string, value: string) {
    setClassements(prev => ({ ...prev, [catKey]: { ...prev[catKey], [field]: value } }))
  }

  function addClassement(cat: string) {
    const slug = cat.toLowerCase().replace(/ /g, '-').replace(/_/g, '-')
    const key = `classement-${slug}`
    setClassements(prev => ({
      ...prev,
      [key]: {
        categorie: cat,
        h1: `Meilleur ${cat} 2026 : Top ${products.filter(p => p.categorie === cat).length}`,
        meta_title: `Meilleur ${cat} 2026 : comparatif et avis`,
        meta_description: `Comparez les meilleurs ${cat} en 2026 : prix, fonctionnalités, avis.`,
      }
    }))
    setSelected(key)
  }

  const selectedData = selected ? classements[selected] : null
  function slugifyCat(s: string) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[\u2019\u2018']/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  }
  const catProducts = selectedData
    ? products.filter(p => {
        const slugByCat = slugifyCat(p.categorie || '')
        const slugByKeyword = slugifyCat(selected.replace('classement-', ''))
        const catName = (p.categorie || '').toLowerCase()
        const keyName = selected.replace('classement-', '').toLowerCase()
        return `classement-${slugByCat}` === selected ||
               slugByCat === slugByKeyword ||
               catName.includes(keyName) ||
               keyName.includes(catName) ||
               (p.__keyword && slugifyCat(p.__keyword) === slugByKeyword)
      })
    : []

  async function saveEnabledClassements() {
    setSavingEnabled(true)
    setEnabledMsg('')
    try {
      const slugList = Array.from(enabledSlugs).sort()

      const newEntries: Record<string, any> = {}
      for (const slug of slugList) {
        const key = `classement-${slug}`
        if (classements[key]) continue
        const kw = allKeywords.find(k => k.slug === slug)
        if (!kw) continue
        const productCount = kw.count || products.filter(p => slugifyCat(p.categorie || '') === slug || slugifyCat(p.__keyword || '') === slug).length
        newEntries[key] = {
          categorie: kw.name,
          h1: `Meilleur ${kw.name} {year} : Top ${productCount || ''}`.trim(),
          meta_title: `Meilleur ${kw.name} {year} : comparatif et avis`,
          meta_description: `Comparez les meilleurs ${kw.name} en {year} : prix, fonctionnalités, avis.`,
        }
      }
      const hasNew = Object.keys(newEntries).length > 0

      const payload = {
        classements: slugList,
        updated: new Date().toISOString(),
      }
      const r = await fetch('/api/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: enabledPath,
          content: JSON.stringify(payload, null, 2),
          message: `HUB: Sélection classements site ${siteId} (${slugList.length} activé(s))`,
        }),
      })
      const d = await safeJson(r, 'POST /api/github (enabled_classements save)')
      if (!d) {
        setEnabledMsg(`✗ Réponse invalide /api/github (status ${r.status}, voir console F12)`)
        return
      }
      if (!(d.ok || d.success)) {
        setEnabledMsg(`✗ Erreur : ${d.error || 'inconnue'}`)
        return
      }
      setIsLegacyMode(false)

      if (hasNew) {
        setClassements(prev => ({ ...prev, ...newEntries }))

        try {
          const er = await fetch(`/api/github?path=${encodeURIComponent(editorialPath)}`)
          const ed = await safeJson(er, `GET /api/github?path=${editorialPath} (bootstrap)`)
          let editorial: Record<string, any> = {}
          if (ed?.content) {
            try { editorial = JSON.parse(ed.content) } catch { editorial = {} }
          }
          for (const [k, v] of Object.entries(newEntries)) {
            if (!editorial[k]) editorial[k] = v
          }
          await fetch('/api/github', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: editorialPath,
              content: JSON.stringify(editorial, null, 2),
              message: `HUB: Bootstrap editorial pour ${Object.keys(newEntries).length} nouveau(x) classement(s)`,
            }),
          })
          setSelected(Object.keys(newEntries)[0])
        } catch (e) {
          console.error('Bootstrap editorial failed', e)
        }
        setEnabledMsg(`✓ ${slugList.length} activé(s) — ${Object.keys(newEntries).length} nouveau(x) initialisé(s). Génère le contenu IA depuis la sidebar.`)
        setTimeout(() => setEnabledMsg(''), 6000)
      } else {
        setEnabledMsg(`✓ Sélection sauvegardée (${slugList.length} activé(s))`)
        setTimeout(() => setEnabledMsg(''), 3500)
      }
    } catch (e: any) {
      setEnabledMsg(`✗ ${e?.message || 'Erreur réseau'}`)
    } finally {
      setSavingEnabled(false)
    }
  }

  function toggleSlug(slug: string) {
    setEnabledSlugs(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug); else next.add(slug)
      return next
    })
  }
  function selectAllOfCategory(parent: string, checked: boolean) {
    const slugsOfCat = allKeywords.filter(k => k.parent === parent).map(k => k.slug)
    setEnabledSlugs(prev => {
      const next = new Set(prev)
      slugsOfCat.forEach(s => checked ? next.add(s) : next.delete(s))
      return next
    })
  }
  function selectAll(checked: boolean) {
    setEnabledSlugs(checked ? new Set(allKeywords.map(k => k.slug)) : new Set())
  }

  function renderClassementItem(key: string, indented = false) {
    return (
      <div key={key} onClick={() => setSelected(key)} style={{
        padding: indented ? '9px 14px 9px 20px' : '10px 14px',
        cursor: 'pointer', fontSize: 12,
        background: selected === key ? 'rgba(0,212,170,0.1)' : 'transparent',
        borderLeft: selected === key ? '2px solid #00D4AA' : '2px solid transparent',
        color: selected === key ? '#fff' : '#8B9CB0',
        borderBottom: '1px solid #1E2D3D'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>{classements[key]?.categorie || key.replace('classement-', '')}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={e => { e.stopPropagation(); regeneratePage(key) }} disabled={regenerating[key] || deploying}
              title="Régénérer" style={{ padding: '2px 5px', borderRadius: 4, border: 'none', background: 'transparent', color: regenerating[key] ? '#4A5568' : '#F6AD55', cursor: 'pointer', fontSize: 12 }}>
              {regenerating[key] ? '⏳' : '🔄'}
            </button>
            <button onClick={async e => {
              e.stopPropagation()
              if (!window.confirm('Supprimer cette page ?')) return
              const r = await fetch('/api/github?path=' + encodeURIComponent(editorialPath))
              const d = await r.json()
              let all: Record<string, any> = {}
              if (d.content) { try { all = JSON.parse(d.content) } catch {} }
              delete all[key]
              await fetch('/api/github', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: editorialPath, content: JSON.stringify(all, null, 2), message: 'HUB: Delete classement ' + key }) })
              setClassements(prev => { const n = { ...prev }; delete n[key]; return n })
              if (selected === key) setSelected(null)
              setMsg('✓ Page supprimée')
            }} title="Supprimer" style={{ padding: '2px 5px', borderRadius: 4, border: 'none', background: 'transparent', color: '#FC8181', cursor: 'pointer', fontSize: 12 }}>×</button>
          </div>
        </div>
        <div style={{ fontSize: 10, color: '#4A5568', marginTop: 2 }}>
          {classements[key]?.intro || classements[key]?.contenu_custom ? '✓ Contenu généré' : '⚠ Sans contenu'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 16, fontSize: 13, color: '#8B9CB0' }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Sites</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none' }}>{siteId}</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: '#fff' }}>Classements</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>📊 Classements</h1>
          <p style={{ color: '#8B9CB0', fontSize: 13, margin: '4px 0 0' }}>{Object.keys(classements).length} page{Object.keys(classements).length > 1 ? 's' : ''} · {categories.length} catégorie{categories.length > 1 ? 's' : ''} dans le Sheet</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('✓') ? '#00D4AA' : '#FC8181', maxWidth: 280 }}>{msg}</span>}
          <button onClick={save} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: saving ? '#1E2D3D' : 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: saving ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13 }}>
            {saving ? '⏳ Sauvegarde…' : '💾 Tout sauvegarder'}
          </button>
        </div>
      </div>

      {!loading && allKeywords.length > 0 && (
        <div style={{ background: '#0D1117', border: `1px solid ${isLegacyMode ? '#7C3AED' : '#1E2D3D'}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div
            onClick={() => setEnabledCollapsed(c => !c)}
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                🎯 Sélection des classements à déployer
              </div>
              <div style={{ fontSize: 12, color: '#8B9CB0', lineHeight: 1.5 }}>
                {isLegacyMode ? (
                  <>
                    <span style={{ color: '#A78BFA', fontWeight: 600 }}>Mode legacy actif</span>
                    {' — '}aucun fichier de sélection trouvé. Tous les classements ({allKeywords.length}) du template sont actuellement déployés. <strong>Sauvegarde</strong> pour figer la sélection (tu pourras ensuite décocher).
                  </>
                ) : (
                  <>
                    <span style={{ color: '#00D4AA', fontWeight: 600 }}>{enabledSlugs.size}</span>
                    {' / '}
                    <span>{allKeywords.length}</span>
                    {' classement(s) activé(s) sur ce site'}
                  </>
                )}
              </div>
            </div>
            <span style={{ fontSize: 18, color: '#8B9CB0', transform: enabledCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform .15s' }}>▶</span>
          </div>

          {!enabledCollapsed && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => selectAll(true)}
                  style={{ padding: '5px 11px', borderRadius: 6, border: '1px solid #1E2D3D', background: '#0A0E1A', color: '#8B9CB0', fontSize: 11, cursor: 'pointer' }}
                >Tout cocher</button>
                <button
                  type="button"
                  onClick={() => selectAll(false)}
                  style={{ padding: '5px 11px', borderRadius: 6, border: '1px solid #1E2D3D', background: '#0A0E1A', color: '#8B9CB0', fontSize: 11, cursor: 'pointer' }}
                >Tout décocher</button>
                <div style={{ flex: 1 }} />
                {enabledMsg && (
                  <span style={{ fontSize: 11, color: enabledMsg.startsWith('✓') ? '#00D4AA' : '#FC8181' }}>{enabledMsg}</span>
                )}
              </div>

              {(() => {
                const groups: Record<string, typeof allKeywords> = {}
                allKeywords.forEach(k => {
                  if (!groups[k.parent]) groups[k.parent] = []
                  groups[k.parent].push(k)
                })
                return Object.entries(groups).map(([parent, kws]) => {
                  const allChecked = kws.every(k => enabledSlugs.has(k.slug))
                  const someChecked = kws.some(k => enabledSlugs.has(k.slug))
                  return (
                    <div key={parent} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #1E2D3D' }}>
                        <input
                          type="checkbox"
                          checked={allChecked}
                          ref={el => { if (el) (el as HTMLInputElement).indeterminate = !allChecked && someChecked }}
                          onChange={e => selectAllOfCategory(parent, e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                        <div style={{ fontSize: 12, color: '#A78BFA', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{parent}</div>
                        <div style={{ fontSize: 11, color: '#8B9CB0' }}>({kws.filter(k => enabledSlugs.has(k.slug)).length} / {kws.length})</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 4 }}>
                        {kws.map(k => (
                          <label
                            key={k.slug}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                              background: enabledSlugs.has(k.slug) ? 'rgba(124, 58, 237, 0.08)' : 'transparent',
                              border: `1px solid ${enabledSlugs.has(k.slug) ? 'rgba(124, 58, 237, 0.3)' : 'transparent'}`,
                              transition: '.1s',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={enabledSlugs.has(k.slug)}
                              onChange={() => toggleSlug(k.slug)}
                              style={{ cursor: 'pointer', flexShrink: 0 }}
                            />
                            <span style={{ fontSize: 13, color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.name}</span>
                            {k.count > 0 && (
                              <span style={{ fontSize: 10, color: '#8B9CB0', flexShrink: 0 }}>{k.count} prod.</span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>
      )}

      {loading ? <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 40 }}>Chargement...</div> : (
        <div style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden' }}>

          <div style={{ width: 240, display: 'flex', flexDirection: 'column', background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #1E2D3D', fontSize: 11, color: '#8B9CB0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Pages existantes
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {(() => {
                const grouped: Record<string, string[]> = {}
                Object.keys(classements).forEach(key => {
                  const cat = keywordCategories[key] || 'Autres'
                  if (!grouped[cat]) grouped[cat] = []
                  grouped[cat].push(key)
                })
                const cats = Object.keys(grouped)
                if (cats.length <= 1) {
                  return Object.keys(classements).map(key => renderClassementItem(key))
                }
                return cats.map(cat => (
                  <div key={cat}>
                    <div onClick={() => setCollapsedCats(p => ({...p, [cat]: !p[cat]}))}
                      style={{padding:'7px 12px', background:'#0A0E1A', borderBottom:'1px solid #1E2D3D', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer'}}>
                      <span style={{fontSize:10, fontWeight:700, color:'#9F7AEA', textTransform:'uppercase' as const, letterSpacing:'0.06em'}}>{cat}</span>
                      <span style={{color:'#4A5568', fontSize:10}}>{collapsedCats[cat] ? '▶' : '▼'}</span>
                    </div>
                    {!collapsedCats[cat] && grouped[cat].map(key => renderClassementItem(key, true))}
                  </div>
                ))
              })()}
              {Object.keys(classements).length === 0 && (
                <div style={{ color: '#4A5568', padding: 16, fontSize: 12, textAlign: 'center' }}>Aucune page</div>
              )}
            </div>


          </div>

          <div style={{ flex: 1, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {!selected || !selectedData ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A5568', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 40 }}>📊</div>
                <div>Sélectionnez une page classement</div>
                {categoriesWithoutContent.length > 0 && (
                  <div style={{ fontSize: 13, color: '#F6AD55' }}>
                    {categoriesWithoutContent.length} catégorie{categoriesWithoutContent.length > 1 ? 's' : ''} détectée{categoriesWithoutContent.length > 1 ? 's' : ''} dans le Sheet sans page
                  </div>
                )}
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3 style={{ color: '#00D4AA', margin: 0, fontSize: 15 }}>
                    {selectedData.categorie || selected.replace('classement-', '')}
                  </h3>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => regeneratePage(selected)} disabled={regenerating[selected] || deploying}
                      style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #F6AD55', background: 'transparent', color: '#F6AD55', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                      {regenerating[selected] ? '⏳...' : '🔄 Régénérer'}
                    </button>
                  </div>
                </div>

                <div onClick={() => toggleSection('seo')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 0', marginBottom: 4 }}><span style={{ color: '#4A5568', fontSize: 11, transform: expandedSections['seo'] ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .2s' }}>▶</span><span style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>🔍 SEO</span><span style={{ flex: 1, height: 1, background: '#1E2D3D', marginLeft: 4 }} /></div>
                {expandedSections['seo'] && <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {[{ label: 'H1', field: 'h1' }, { label: 'Meta title', field: 'meta_title' }, { label: 'Titre "Analyse détaillée"', field: 'titre_analyse' }].map(({ label, field }) => (
                    <div key={field}>
                      <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 5 }}>{label}</div>
                      <input value={selectedData[field] || ''} onChange={e => updateField(selected, field, e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const }}>Meta description</div>
                    <button onClick={async () => {
                      setGeneratingMeta(true)
                      const cat = selectedData.categorie || selected.replace('classement-', '')
                      const count = catProducts.length
                      try {
                        const r = await fetch('/api/generate-text', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            max_tokens: 200,
                            system: 'Tu es un expert SEO. Réponds uniquement avec la meta description, sans guillemets, sans preamble. Maximum 155 caractères.',
                            prompt: `Écris une meta description SEO optimisée pour une page de classement des meilleurs ${cat} en 2026. ${count} logiciels comparés. Inclure un call-to-action. Maximum 155 caractères.`
                          })
                        })
                        const d = await r.json()
                        const text = d.text
                        if (text) updateField(selected, 'meta_description', text)
                      } catch {}
                      setGeneratingMeta(false)
                    }} disabled={generatingMeta}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #9F7AEA', background: 'transparent', color: generatingMeta ? '#4A5568' : '#9F7AEA', cursor: generatingMeta ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600 }}>
                      {generatingMeta ? '⏳...' : '✨ Générer'}
                    </button>
                  </div>
                  <input value={selectedData.meta_description || ''} onChange={e => updateField(selected, 'meta_description', e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                  {selectedData.meta_description && (
                    <div style={{ fontSize: 11, color: selectedData.meta_description.length > 155 ? '#FC8181' : '#4A5568', marginTop: 4 }}>
                      {selectedData.meta_description.length}/155 caractères
                    </div>
                  )}
                </div>

                </>}

                {[
                  { key: 'intro', label: '📝 Introduction', rows: 8, prompt: `Génère une introduction HTML engageante (150-200 mots) pour une page de classement des meilleurs ${selectedData.categorie || ''} en ${new Date().getFullYear()}. Paragraphes <p>, gras <strong>. Aucun tiret long.` },
                  { key: 'en_bref', label: '⚡ En bref', rows: 6, prompt: `Génère un encart "En bref" HTML pour les meilleurs ${selectedData.categorie || ''} en ${new Date().getFullYear()}. Format : <ul> avec 5 <li>, chaque item = nom du logiciel + profil cible idéal. Aucun tiret long.` },
                  { key: 'contenu_custom', label: '📖 Contenu expert', rows: 14, prompt: `Génère un guide expert HTML (500-800 mots) pour aider à choisir parmi les meilleurs ${selectedData.categorie || ''} en ${new Date().getFullYear()}. Utilise des <h2>, <h3>, <p>, <strong>. Aucun tiret long.` },
                ].map(({ key, label, rows, prompt }) => {
                  const cat = selectedData.categorie || selected.replace('classement-', '')
                  const kwData = Object.entries(schemaPrompts).find(([k]) => k.toLowerCase() === cat.toLowerCase() || cat.toLowerCase().includes(k.toLowerCase()))?.[1] as any
                  const promptKey = key === 'intro' ? 'prompt_intro' : key === 'contenu_custom' ? 'prompt_contenu' : null
                  const schemaPrompt = promptKey && kwData ? (kwData[promptKey] || '') : ''
                  const finalPrompt = schemaPrompt || prompt
                  const isGenerating = generatingSections[key] || false
                  return (
                  <div key={key} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div onClick={() => toggleSection(key)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 0', flex: 1 }}>
                        <span style={{ color: '#4A5568', fontSize: 11, transform: expandedSections[key] ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .2s' }}>▶</span>
                        <span style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</span>
                        <span style={{ flex: 1, height: 1, background: '#1E2D3D', marginLeft: 4 }} />
                      </div>
                      <button onClick={async () => {
                        setGeneratingSections(p => ({ ...p, [key]: true }))
                        const r = await fetch('/api/generate-text', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ max_tokens: 2000, system: 'Tu es un expert rédacteur SEO. Réponds uniquement avec le contenu HTML demandé, sans preamble, sans markdown.', prompt: finalPrompt })
                        })
                        const d = await r.json()
                        if (d.text) { updateField(selected, key, d.text); setExpandedSections(p => ({ ...p, [key]: true })) }
                        setGeneratingSections(p => ({ ...p, [key]: false }))
                      }} disabled={isGenerating} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #9F7AEA', background: 'transparent', color: isGenerating ? '#4A5568' : '#9F7AEA', cursor: isGenerating ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                        {isGenerating ? '⏳...' : '✨ Régénérer'}
                      </button>
                    </div>
                    {expandedSections[key] && <div style={{ marginBottom: 12 }}>
                      <HtmlEditor
                        value={selectedData[key] || ''}
                        rows={rows}
                        placeholder={`Contenu ${label} — généré par Sonnet ou saisi manuellement`}
                        onChange={val => updateField(selected, key, val)}
                      />
                    </div>}
                  </div>
                )})}

                <div style={{ marginBottom: 8 }}>
                  <div onClick={() => toggleSection('faq')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 0', marginBottom: 4 }}><span style={{ color: '#4A5568', fontSize: 11, transform: expandedSections['faq'] ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .2s' }}>▶</span><span style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>❓ FAQ</span><span style={{ flex: 1, height: 1, background: '#1E2D3D', marginLeft: 4 }} /></div>
                  {expandedSections['faq'] && (() => {
                    let faqItems: {q: string, a: string}[] = []
                    const raw = selectedData.faq
                    if (Array.isArray(raw)) {
                      faqItems = raw.map((i: any) => ({ q: i.q || i.question || '', a: i.a || i.answer || '' }))
                    } else if (raw?.faq?.questions) {
                      faqItems = raw.faq.questions.map((i: any) => ({ q: i.question || '', a: i.answer || '' }))
                    }
                    const updateFaq = (items: {q: string, a: string}[]) => updateField(selected, 'faq', items)
                    return (
                      <div style={{ marginBottom: 12 }}>
                        {faqItems.map((item, idx) => (
                          <div key={idx} style={{ marginBottom: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 8, padding: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600 }}>Q{idx + 1}</span>
                              <button onClick={() => updateFaq(faqItems.filter((_, i) => i !== idx))}
                                style={{ padding: '1px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: '#FC8181', cursor: 'pointer', fontSize: 13 }}>×</button>
                            </div>
                            <input value={item.q} onChange={e => { const n = [...faqItems]; n[idx] = { ...n[idx], q: e.target.value }; updateFaq(n) }}
                              placeholder="Question..."
                              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, marginBottom: 6 }} />
                            <textarea value={item.a} onChange={e => { const n = [...faqItems]; n[idx] = { ...n[idx], a: e.target.value }; updateFaq(n) }}
                              placeholder="Réponse..." rows={3}
                              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: '#0D1117', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' as const }} />
                          </div>
                        ))}
                        <button onClick={() => updateFaq([...faqItems, { q: '', a: '' }])}
                          style={{ width: '100%', padding: '8px', borderRadius: 7, border: '1px dashed #1E2D3D', background: 'transparent', color: '#00D4AA', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          + Ajouter une question
                        </button>
                      </div>
                    )
                  })()}
                </div>

                {catProducts.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div onClick={() => toggleSection('ordre')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 0', marginBottom: 4 }}><span style={{ color: '#4A5568', fontSize: 11, transform: expandedSections['ordre'] ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .2s' }}>▶</span><span style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>🔢 Ordre du classement</span><span style={{ flex: 1, height: 1, background: '#1E2D3D', marginLeft: 4 }} /></div>
                    {expandedSections['ordre'] && <>
                    <div style={{ fontSize: 12, color: '#4A5568', marginBottom: 10 }}>Réordonnez les marques avec ↑ ↓. Sans intervention : tri par note décroissante, puis ordre aléatoire stable (différent par catégorie). « Réinitialiser » revient au tri auto.</div>
                    {(() => {
                      const orderMap: Record<string, number> = selectedData.products_order || {}
                      const hasManual = Object.keys(orderMap).length > 0
                      // Affiche les marques dans l'ordre EFFECTIF : ordre manuel si
                      // défini, sinon par note décroissante (aperçu fidèle).
                      const ordered = [...catProducts].sort((a: any, b: any) => {
                        const oa = orderMap[a.slug]; const ob = orderMap[b.slug]
                        if (oa != null && ob != null) return oa - ob
                        if (oa != null) return -1
                        if (ob != null) return 1
                        return (parseFloat(b.note_redaction) || 0) - (parseFloat(a.note_redaction) || 0)
                      })
                      // Déplacer une marque d'un cran : on réécrit un products_order
                      // propre et séquentiel (1..N) pour TOUTE la catégorie.
                      const move = (idx: number, dir: number) => {
                        const arr = [...ordered]
                        const j = idx + dir
                        if (j < 0 || j >= arr.length) return
                        const tmp = arr[idx]; arr[idx] = arr[j]; arr[j] = tmp
                        const newMap: Record<string, number> = {}
                        arr.forEach((p: any, i: number) => { newMap[p.slug] = i + 1 })
                        updateField(selected, 'products_order', newMap as any)
                      }
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                          {ordered.map((prod: any, idx: number) => (
                            <div key={prod.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#0A0E1A', borderRadius: 8, border: '1px solid #1E2D3D' }}>
                              <span style={{ width: 22, textAlign: 'center' as const, fontSize: 13, fontWeight: 700, color: hasManual ? '#00D4AA' : '#8B9CB0' }}>{idx + 1}</span>
                              <span style={{ flex: 1, fontSize: 13, color: '#E5E9F0' }}>{prod.nom}</span>
                              {prod.note_redaction && <span style={{ fontSize: 11, color: '#4A5568' }}>★ {prod.note_redaction}</span>}
                              <button onClick={() => move(idx, -1)} disabled={idx === 0} title="Monter"
                                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #1E2D3D', background: idx === 0 ? '#0A0E1A' : '#0D1117', color: idx === 0 ? '#2A3441' : '#8B9CB0', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 14, lineHeight: 1 }}>↑</button>
                              <button onClick={() => move(idx, 1)} disabled={idx === ordered.length - 1} title="Descendre"
                                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #1E2D3D', background: idx === ordered.length - 1 ? '#0A0E1A' : '#0D1117', color: idx === ordered.length - 1 ? '#2A3441' : '#8B9CB0', cursor: idx === ordered.length - 1 ? 'default' : 'pointer', fontSize: 14, lineHeight: 1 }}>↓</button>
                            </div>
                          ))}
                          {hasManual && (
                            <button onClick={() => updateField(selected, 'products_order', {} as any)}
                              style={{ alignSelf: 'flex-start' as const, marginTop: 4, padding: '5px 12px', borderRadius: 7, border: '1px solid #1E2D3D', background: 'transparent', color: '#8B9CB0', cursor: 'pointer', fontSize: 12 }}>↺ Réinitialiser (tri auto)</button>
                          )}
                        </div>
                      )
                    })()}
                    </>}
                  </div>
                )}

                {catProducts.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>🏷 Contenu des marques</div>
                      <button onClick={() => setShowAddBrand(true)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #00D4AA', background: 'transparent', color: '#00D4AA', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        + Ajouter une marque
                      </button>
                    </div>

                    {showAddBrand && (
                      <div style={{ marginBottom: 16, background: '#0A0E1A', border: '1px solid #00D4AA', borderRadius: 10, padding: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#00D4AA', marginBottom: 12 }}>Nouvelle marque</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 11, color: '#8B9CB0', marginBottom: 4 }}>Nom</div>
                            <input value={newBrand.nom} onChange={e => setNewBrand(p => ({ ...p, nom: e.target.value }))}
                              placeholder="Ex: LegalPlace"
                              style={{ width: '100%', padding: '8px 12px', borderRadius: 7, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: '#8B9CB0', marginBottom: 4 }}>Slug</div>
                            <input value={newBrand.slug} onChange={e => setNewBrand(p => ({ ...p, slug: e.target.value }))}
                              placeholder="Ex: legalplace"
                              style={{ width: '100%', padding: '8px 12px', borderRadius: 7, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={async () => {
                            if (!newBrand.nom || !newBrand.slug) return
                            setGeneratingBrand(true)
                            const cat = selectedData.categorie || selected.replace('classement-', '')
                            try {
                              const r = await fetch('/api/generate-text', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  max_tokens: 1000,
                                  system: 'Tu es un expert rédacteur SEO. Réponds UNIQUEMENT en JSON valide sans backticks.',
                                  prompt: `Génère une description HTML et des avantages/inconvénients pour ${newBrand.nom} dans un classement des meilleurs ${cat}. Réponds en JSON: {"description": "<p>...</p>", "points_forts": ["avantage 1", "avantage 2", "avantage 3"], "points_faibles": ["inconvénient 1", "inconvénient 2"]}`
                                })
                              })
                              const d = await r.json()
                              if (d.text) {
                                try {
                                  const parsed = JSON.parse(d.text)
                                  const key = `prod_${newBrand.slug}`
                                  updateField(selected, key, { description: parsed.description || '', points_forts: parsed.points_forts || [], points_faibles: parsed.points_faibles || [] })
                                  setExpandedBrands(p => ({ ...p, [newBrand.slug]: true }))
                                } catch {}
                              }
                            } catch {}
                            setGeneratingBrand(false)
                            setShowAddBrand(false)
                            setNewBrand({ nom: '', slug: '', description: '', points_forts: '', points_faibles: '' })
                          }} disabled={generatingBrand || !newBrand.nom || !newBrand.slug}
                            style={{ flex: 1, padding: '8px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                            {generatingBrand ? '⏳ Génération...' : '✨ Générer avec IA'}
                          </button>
                          <button onClick={() => { setShowAddBrand(false); setNewBrand({ nom: '', slug: '', description: '', points_forts: '', points_faibles: '' }) }}
                            style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid #1E2D3D', background: 'transparent', color: '#8B9CB0', cursor: 'pointer', fontSize: 13 }}>
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}

                    {catProducts.map((prod: any) => {
                      const prodKey = prod.slug
                      const prodData = selectedData[`prod_${prodKey}`] || {}
                      const isExpanded = expandedBrands[prodKey] || false
                      const hasContent = !!(prodData.description || prodData.points_forts?.length)
                      return (
                        <div key={prodKey} style={{ marginBottom: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 10, overflow: 'hidden' }}>
                          <div onClick={() => setExpandedBrands(p => ({ ...p, [prodKey]: !p[prodKey] }))}
                            style={{ padding: '10px 14px', background: '#0D1117', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                            <span style={{ color: '#4A5568', fontSize: 12, transition: 'transform .2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', flex: 1 }}>{prod.nom}</span>
                            <span style={{ fontSize: 10, color: hasContent ? '#00D4AA' : '#4A5568' }}>{hasContent ? '✓ Contenu' : '⚠ Vide'}</span>
                          </div>
                          {isExpanded && (
                            <div style={{ padding: 14 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                                <div>
                                  <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 5 }}>🔗 Lien d'affiliation</div>
                                  <input value={prodData.url_affiliation || ''} onChange={e => updateField(selected, `prod_${prodKey}`, { ...prodData, url_affiliation: e.target.value })}
                                    placeholder="https://..."
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 7, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                                </div>
                                <div>
                                  <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 5 }}>🖱 Texte du CTA</div>
                                  <input value={prodData.cta_text || ''} onChange={e => updateField(selected, `prod_${prodKey}`, { ...prodData, cta_text: e.target.value })}
                                    placeholder={`→ Essayer ${prod.nom}`}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 7, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                                </div>
                              </div>
                              <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 6 }}>Description</div>
                              <HtmlEditor
                                value={prodData.description || ''}
                                rows={6}
                                placeholder={`Description de ${prod.nom}...`}
                                onChange={val => updateField(selected, `prod_${prodKey}`, { ...prodData, description: val })}
                              />
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                                <div>
                                  <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 6 }}>✅ Avantages</div>
                                  <textarea
                                    value={Array.isArray(prodData.points_forts) ? prodData.points_forts.join('\n') : (prodData.points_forts || '')}
                                    rows={4} placeholder="Un avantage par ligne"
                                    onChange={e => updateField(selected, 'prod_' + prodKey, { ...prodData, points_forts: e.target.value.split('\n').filter(Boolean) })}
                                    style={{ width: '100%', padding: 10, borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                                  />
                                </div>
                                <div>
                                  <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 6 }}>❌ Inconvénients</div>
                                  <textarea
                                    value={Array.isArray(prodData.points_faibles) ? prodData.points_faibles.join('\n') : (prodData.points_faibles || '')}
                                    rows={4} placeholder="Un inconvénient par ligne"
                                    onChange={e => updateField(selected, 'prod_' + prodKey, { ...prodData, points_faibles: e.target.value.split('\n').filter(Boolean) })}
                                    style={{ width: '100%', padding: 10, borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {!selectedData.intro && !selectedData.contenu_custom && (
                  <div style={{ padding: 20, textAlign: 'center', color: '#4A5568', border: '1px dashed #1E2D3D', borderRadius: 8, marginTop: 8 }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>⚠</div>
                    <div style={{ fontSize: 13 }}>Aucun contenu. Cliquez 🔄 Régénérer ou saisissez manuellement.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
