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

  // Sync visuel → HTML
  function onVisualInput() {
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }

  // Sync HTML → visuel au changement de mode
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
      {/* Tabs */}
      <div style={{ display: 'flex', background: '#0A0E1A', borderBottom: '1px solid #1E2D3D', padding: '0 8px', gap: 4 }}>
        <button style={tabBtn('visual','Visuel')} onClick={() => switchMode('visual')}>✏️ Visuel</button>
        <button style={tabBtn('source','HTML')} onClick={() => switchMode('source')}>{'</>'} HTML</button>
      </div>

      {/* Toolbar */}
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

      {/* Éditeur visuel */}
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

      {/* Éditeur source */}
      {mode === 'source' && (
        <textarea ref={taRef} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ width: '100%', padding: 12, background: '#0D1117', border: 'none', color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, outline: 'none', fontFamily: 'monospace', resize: 'vertical', minHeight: (rows * 22) + 'px', boxSizing: 'border-box' as const, display: 'block' }} />
      )}
    </div>
  )
}
// ── fin HtmlEditor ────────────────────────────────────────────────────────

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
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ seo: true })
  function toggleSection(key: string) { setExpandedSections(p => ({ ...p, [key]: !p[key] })) }

  const [showAddBrand, setShowAddBrand] = useState(false)
  const [newBrand, setNewBrand] = useState({ nom: '', slug: '', description: '', points_forts: '', points_faibles: '' })
  const [generatingBrand, setGeneratingBrand] = useState(false)
  const [schemaPrompts, setSchemaPrompts] = useState<Record<string, string>>({})
  const [generatingSections, setGeneratingSections] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState('')

  const editorialPath = `platform/sites/${siteId}/editorial.json`

  useEffect(() => {
    fetch(`/api/sites/${siteId}`).then(r => r.json()).then(async d => {
      if (d.sheet_csv_url) {
        const r = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: d.sheet_csv_url }) })
        const sd = await r.json()
        if (!sd.error) setProducts(sd.rows || [])
      }
    })
    // Aussi essayer de charger depuis le schema du template
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
        Object.values(schema.keywords || {}).forEach((kw: any) => {
          if (Array.isArray(kw.__products)) allProducts.push(...kw.__products)
        })
        if (allProducts.length > 0) setProducts(prev => prev.length > 0 ? prev : allProducts)
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
          // Injecter les données produits dans chaque classement
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

  async function saveAndDeploy() {
    await save()
    await deploy()
  }

  async function save() {
    setSaving(true); setMsg('')
    const r = await fetch(`/api/github?path=${encodeURIComponent(editorialPath)}`)
    const d = await r.json()
    let allEditorial: Record<string, any> = {}
    if (d.content) { try { allEditorial = JSON.parse(d.content) } catch {} }
    const merged = { ...allEditorial, ...classements }
    const wr = await fetch('/api/github', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: editorialPath, content: JSON.stringify(merged, null, 2), message: `HUB: Update classements ${siteId}` })
    })
    const wd = await wr.json()
    setMsg(wd.ok ? '✓ Sauvegardé' : '✗ Erreur')
    setSaving(false)
  }

  // Régénère une page : supprime la clé dans editorial.json et relance le déploiement
  async function regeneratePage(catKey: string) {
    setRegenerating(prev => ({ ...prev, [catKey]: true })); setMsg('')
    try {
      // 1. Charger editorial.json complet
      const r = await fetch(`/api/github?path=${encodeURIComponent(editorialPath)}`)
      const d = await r.json()
      let allEditorial: Record<string, any> = {}
      if (d.content) { try { allEditorial = JSON.parse(d.content) } catch {} }

      // 2. Supprimer la clé de ce classement
      delete allEditorial[catKey]

      // 3. Sauvegarder sur GitHub
      const wr = await fetch('/api/github', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: editorialPath, content: JSON.stringify(allEditorial, null, 2), message: `HUB: Reset classement ${catKey} for regeneration` })
      })
      const wd = await wr.json()
      if (!wd.ok) { setMsg('✗ Erreur sauvegarde'); return }

      // 4. Mettre à jour le state local
      setClassements(prev => {
        const next = { ...prev }
        delete next[catKey]
        return next
      })
      if (selected === catKey) setSelected(null)

      // 5. Lancer le déploiement
      setDeploying(true)
      const dr = await fetch(`/api/sites/${siteId}/deploy`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skip_enrich: false })
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
        const slug = slugifyCat(p.categorie || '')
        return `classement-${slug}` === selected
      })
    : []

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
          <button onClick={save} disabled={saving} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid #1E2D3D', background: '#0D1117', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            {saving ? '...' : '💾 Sauvegarder'}
          </button>
          <button onClick={saveAndDeploy} disabled={saving || deploying} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            {deploying ? '⏳ Déploiement...' : '🚀 Sauvegarder & Déployer'}
          </button>
        </div>
      </div>

      {loading ? <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 40 }}>Chargement...</div> : (
        <div style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden' }}>

          {/* Sidebar */}
          <div style={{ width: 240, display: 'flex', flexDirection: 'column', background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #1E2D3D', fontSize: 11, color: '#8B9CB0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Pages existantes
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {Object.keys(classements).map(key => (
                <div key={key} onClick={() => setSelected(key)} style={{
                  padding: '10px 14px', cursor: 'pointer', fontSize: 12,
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
                        if (!window.confirm('Supprimer cette page de classement ?')) return
                        const r = await fetch('/api/github?path=' + encodeURIComponent(editorialPath))
                        const d = await r.json()
                        let all: Record<string, any> = {}
                        if (d.content) { try { all = JSON.parse(d.content) } catch {} }
                        delete all[key]
                        await fetch('/api/github', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: editorialPath, content: JSON.stringify(all, null, 2), message: 'HUB: Delete classement ' + key }) })
                        setClassements(prev => { const n = { ...prev }; delete n[key]; return n })
                        if (selected === key) setSelected(null)
                        setMsg('✓ Page supprimée')
                      }} title="Supprimer" style={{ padding: '2px 5px', borderRadius: 4, border: 'none', background: 'transparent', color: '#FC8181', cursor: 'pointer', fontSize: 12 }}>
                        ×
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: '#4A5568', marginTop: 2 }}>
                    {classements[key]?.intro || classements[key]?.contenu_custom ? '✓ Contenu généré' : '⚠ Sans contenu'}
                  </div>
                </div>
              ))}
              {Object.keys(classements).length === 0 && (
                <div style={{ color: '#4A5568', padding: 16, fontSize: 12, textAlign: 'center' }}>Aucune page</div>
              )}
            </div>


          </div>

          {/* Éditeur */}
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
                {/* Header */}
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

                {/* SEO */}
                <div onClick={() => toggleSection('seo')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 0', marginBottom: 4 }}><span style={{ color: '#4A5568', fontSize: 11, transform: expandedSections['seo'] ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .2s' }}>▶</span><span style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>🔍 SEO</span><span style={{ flex: 1, height: 1, background: '#1E2D3D', marginLeft: 4 }} /></div>
                {expandedSections['seo'] && <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {[{ label: 'H1', field: 'h1' }, { label: 'Meta title', field: 'meta_title' }].map(({ label, field }) => (
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

                {/* Sections éditables */}
                {[
                  { key: 'intro', label: '📝 Introduction', rows: 8, prompt: `Génère une introduction HTML engageante (150-200 mots) pour une page de classement des meilleurs ${selectedData.categorie || ''} en ${new Date().getFullYear()}. Paragraphes <p>, gras <strong>. Aucun tiret long.` },
                  { key: 'contenu_custom', label: '📖 Contenu expert', rows: 14, prompt: `Génère un guide expert HTML (500-800 mots) pour aider à choisir parmi les meilleurs ${selectedData.categorie || ''} en ${new Date().getFullYear()}. Utilise des <h2>, <h3>, <p>, <strong>. Aucun tiret long.` },
                ].map(({ key, label, rows, prompt }) => {
                  // Chercher le prompt dans le schema pour la catégorie sélectionnée
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

                {/* FAQ */}
                <div style={{ marginBottom: 8 }}>
                  <div onClick={() => toggleSection('faq')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 0', marginBottom: 4 }}><span style={{ color: '#4A5568', fontSize: 11, transform: expandedSections['faq'] ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .2s' }}>▶</span><span style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>❓ FAQ</span><span style={{ flex: 1, height: 1, background: '#1E2D3D', marginLeft: 4 }} /></div>
                  {expandedSections['faq'] && (() => {
                    // Normaliser la FAQ en tableau [{q, a}]
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

                {/* Ordre des marques */}
                {catProducts.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div onClick={() => toggleSection('ordre')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 0', marginBottom: 4 }}><span style={{ color: '#4A5568', fontSize: 11, transform: expandedSections['ordre'] ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .2s' }}>▶</span><span style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>🔢 Ordre du classement</span><span style={{ flex: 1, height: 1, background: '#1E2D3D', marginLeft: 4 }} /></div>
                    {expandedSections['ordre'] && <>
                    <div style={{ fontSize: 12, color: '#4A5568', marginBottom: 10 }}>Par défaut : trié par note. Entrez un numéro pour forcer la position.</div>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                      {catProducts.map((prod: any) => {
                        const orderMap = selectedData.products_order || {}
                        const currentOrder = orderMap[prod.slug] ?? ''
                        return (
                          <div key={prod.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#0A0E1A', borderRadius: 8, border: '1px solid #1E2D3D' }}>
                            <input
                              type="number" min="1" max="99"
                              value={currentOrder}
                              placeholder="Auto"
                              onChange={e => {
                                const val = e.target.value
                                const newOrder = { ...(selectedData.products_order || {}) }
                                if (val === '') delete newOrder[prod.slug]
                                else newOrder[prod.slug] = parseInt(val)
                                updateField(selected, 'products_order', newOrder)
                              }}
                              style={{ width: 60, padding: '5px 8px', borderRadius: 6, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', textAlign: 'center' }}
                            />
                            <span style={{ fontSize: 13, color: currentOrder !== '' ? '#00D4AA' : '#8B9CB0', fontWeight: currentOrder !== '' ? 600 : 400 }}>{prod.nom}</span>
                            {prod.note_redaction && <span style={{ fontSize: 11, color: '#4A5568', marginLeft: 'auto' }}>★ {prod.note_redaction}</span>}
                            {currentOrder !== '' && <span style={{ fontSize: 10, color: '#00D4AA' }}>Position forcée</span>}
                          </div>
                        )
                      })}
                    </div>
                    </>}
                  </div>
                )}

                {/* Contenu des marques */}
                {catProducts.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>🏷 Contenu des marques</div>
                      <button onClick={() => setShowAddBrand(true)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #00D4AA', background: 'transparent', color: '#00D4AA', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        + Ajouter une marque
                      </button>
                    </div>

                    {/* Formulaire ajout marque */}
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
                          {/* Header cliquable */}
                          <div onClick={() => setExpandedBrands(p => ({ ...p, [prodKey]: !p[prodKey] }))}
                            style={{ padding: '10px 14px', background: '#0D1117', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                            <span style={{ color: '#4A5568', fontSize: 12, transition: 'transform .2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', flex: 1 }}>{prod.nom}</span>
                            <span style={{ fontSize: 10, color: hasContent ? '#00D4AA' : '#4A5568' }}>{hasContent ? '✓ Contenu' : '⚠ Vide'}</span>
                          </div>
                          {/* Contenu déplié */}
                          {isExpanded && (
                            <div style={{ padding: 14 }}>
                              {/* Lien affiliation + CTA */}
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
