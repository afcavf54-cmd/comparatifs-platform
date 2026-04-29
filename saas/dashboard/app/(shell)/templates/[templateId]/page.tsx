'use client'
import React from 'react'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type Tab = 'keywords'

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

export default function TemplateDetailPage() {
  const { templateId } = useParams()
  const [schema, setSchema] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('keywords')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<Record<string, boolean>>({})
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [availableCategories, setAvailableCategories] = useState<string[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [uploadingImg, setUploadingImg] = useState<Record<string, boolean>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const schemaPath = `platform/schemas/${templateId}.json`
  const imagesBasePath = `platform/schemas/images/${templateId}`

  useEffect(() => {
    fetch(`/api/github?path=${encodeURIComponent(schemaPath)}`).then(r => r.json()).then(d => {
      try {
        const s = JSON.parse(d.content)
        if (!s.keywords) s.keywords = {}
        setSchema(s)
        const groups = Object.keys(s.keywords || {})
        if (groups.length > 0) setSelectedGroup(groups[0])
        const cats = [...new Set(Object.values(s.keywords || {}).map((v: any) => v.__categorie).filter(Boolean))] as string[]
        setAvailableCategories(cats)
      } catch {}
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [templateId])

  async function save() {
    setSaving(true); setMsg('')
    const r = await fetch('/api/github', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: schemaPath, content: JSON.stringify(schema, null, 2), message: `HUB: Update schema ${templateId}` })
    })
    const d = await r.json()
    setMsg(d.ok ? '✓ Sauvegardé' : '✗ Erreur')
    setSaving(false)
  }

  async function uploadImage(file: File, slug: string, imgType: 'logo' | 'screenshot') {
    const key = `${slug}-${imgType}`
    setUploadingImg(prev => ({ ...prev, [key]: true }))
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const filename = `${slug}-${imgType}.${ext}`
      const path = `${imagesBasePath}/${filename}`
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1]
        // Vérifier si le fichier existe déjà pour récupérer son SHA
        let sha: string | undefined
        try {
          const existing = await fetch(`/api/github?path=${encodeURIComponent(path)}`)
          const ed = await existing.json()
          if (ed.sha) sha = ed.sha
        } catch {}

        const r = await fetch('/api/github/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, content: base64, message: `HUB: Upload ${imgType} for ${slug}`, sha })
        })
        const d = await r.json()
        if (d.ok) {
          setMsg(`✓ ${imgType} uploadé pour ${slug}`)
          // Mettre à jour l'URL dans __products
          if (selectedGroup) {
            setSchema((prev: any) => {
              const products = prev.keywords[selectedGroup].__products || []
              return {
                ...prev,
                keywords: {
                  ...prev.keywords,
                  [selectedGroup]: {
                    ...prev.keywords[selectedGroup],
                    __products: products.map((p: any) => p.slug === slug ? {
                      ...p,
                      [`${imgType}_path`]: `/${filename}`
                    } : p)
                  }
                }
              }
            })
          }
        } else {
          setMsg('✗ Erreur upload')
        }
        setUploadingImg(prev => ({ ...prev, [key]: false }))
      }
      reader.readAsDataURL(file)
    } catch {
      setMsg('✗ Erreur')
      setUploadingImg(prev => ({ ...prev, [key]: false }))
    }
  }

  const pendingRef = useRef<{ slug: string, type: 'logo' | 'screenshot' } | null>(null)
  const [imgPreviews, setImgPreviews] = useState<Record<string, string>>({})

  function triggerUpload(slug: string, imgType: 'logo' | 'screenshot') {
    pendingRef.current = { slug, type: imgType }
    fileInputRef.current?.click()
  }

  const typeColors: Record<string, string> = { avis: '#00D4AA', vs: '#0090FF', local: '#F6AD55', classement: '#9F7AEA' }

  if (loading) return <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 60 }}>Chargement...</div>
  if (!schema) return <div style={{ color: '#FC8181', textAlign: 'center', padding: 60 }}>Modèle introuvable</div>

  const keywords = schema.keywords || {}

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Popup confirmation suppression */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 14, padding: 28, maxWidth: 400, width: '90%' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Supprimer ce type ?</div>
            <div style={{ fontSize: 14, color: '#8B9CB0', marginBottom: 24, lineHeight: 1.6 }}>
              Le type <strong style={{ color: '#fff' }}>{confirmDelete}</strong> et tous ses prompts seront supprimés. Cette action est irréversible.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #1E2D3D', background: 'transparent', color: '#8B9CB0', cursor: 'pointer', fontSize: 14 }}>
                Annuler
              </button>
              <button onClick={() => {
                const type = confirmDelete
                setSchema((prev: any) => { const k = { ...prev.keywords }; delete k[type]; return { ...prev, keywords: k } })
                if (selectedGroup === type) setSelectedGroup(null)
                setConfirmDelete(null)
              }}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#FC8181', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                🗑 Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input file caché */}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          const p = pendingRef.current
          if (file && p) {
            uploadImage(file, p.slug, p.type)
            pendingRef.current = null
          }
          if (fileInputRef.current) fileInputRef.current.value = ''
        }} />

      <div style={{ marginBottom: 24, fontSize: 13, color: '#8B9CB0' }}>
        <Link href="/templates" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Modèles</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: '#fff' }}>{schema.label}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>{schema.label}</h1>
            <span style={{ padding: '3px 10px', borderRadius: 6, background: `${typeColors[schema.type] || '#8B9CB0'}20`, color: typeColors[schema.type] || '#8B9CB0', fontSize: 12, fontWeight: 700 }}>{schema.type}</span>
          </div>
          <p style={{ color: '#8B9CB0', fontSize: 13, margin: 0 }}>{schema.description}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('✓') ? '#00D4AA' : '#FC8181', maxWidth: 260 }}>{msg}</span>}
          <button onClick={save} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            {saving ? '...' : '💾 Sauvegarder'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        {/* Sidebar types */}
        <div style={{ width: 220, flexShrink: 0, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #1E2D3D', fontSize: 11, color: '#8B9CB0', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Types</div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {Object.keys(keywords).map(type => (
              <div key={type} onClick={() => setSelectedGroup(type)} style={{
                padding: '10px 14px', cursor: 'pointer', fontSize: 13,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: selectedGroup === type ? 'rgba(0,212,170,0.1)' : 'transparent',
                borderLeft: selectedGroup === type ? '2px solid #00D4AA' : '2px solid transparent',
                color: selectedGroup === type ? '#fff' : '#8B9CB0', borderBottom: '1px solid #1E2D3D'
              }}>
                <div>
                  <div>{type}</div>
                  <div style={{ fontSize: 10, color: '#4A5568', marginTop: 2 }}>
                    {keywords[type]?.__products?.length ? `${keywords[type].__products.length} produits` : 'Non synchronisé'}
                  </div>
                </div>
                <span onClick={e => { e.stopPropagation(); setConfirmDelete(type) }}
                  style={{ color: '#FC8181', cursor: 'pointer', fontSize: 16 }}>×</span>
              </div>
            ))}
            {Object.keys(keywords).length === 0 && <div style={{ color: '#4A5568', padding: 16, fontSize: 12, textAlign: 'center' }}>Aucun type</div>}
          </div>
          <div style={{ padding: '10px 14px', borderTop: '1px solid #1E2D3D' }}>
            {!showAddGroup ? (
              <button onClick={() => setShowAddGroup(true)} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px dashed #1E2D3D', background: 'transparent', color: '#00D4AA', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                ➕ Ajouter un type
              </button>
            ) : (
              <div>
                <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Ex: logiciel de paie"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none', marginBottom: 8, boxSizing: 'border-box' as const }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={async () => {
                    if (!newGroupName.trim()) return
                    const newSchema = { ...schema, keywords: { ...(schema.keywords || {}), [newGroupName.trim()]: { __sheet_url: '', __products: [], prompt_intro: '', prompt_en_bref: '', prompt_classement: '', prompt_contenu: '', prompt_faq: '' } } }
                    setSchema(newSchema); setSelectedGroup(newGroupName.trim()); setNewGroupName(''); setShowAddGroup(false)
                    setSaving(true)
                    const r = await fetch('/api/github', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: schemaPath, content: JSON.stringify(newSchema, null, 2), message: `HUB: Add keyword type ${newGroupName.trim()}` }) })
                    const d = await r.json()
                    setMsg(d.ok ? '✓ Type créé' : '✗ Erreur'); setSaving(false)
                  }} style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✓ Créer</button>
                  <button onClick={() => { setShowAddGroup(false); setNewGroupName('') }} style={{ padding: '7px 10px', borderRadius: 6, border: 'none', background: '#1E2D3D', color: '#8B9CB0', cursor: 'pointer', fontSize: 12 }}>✕</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Panneau droit */}
        <div style={{ flex: 1, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'auto' }}>
          {!selectedGroup ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#4A5568' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🏷</div>
              <div>Sélectionnez ou créez un type de logiciel</div>
            </div>
          ) : (
            <div style={{ padding: 24 }}>
              <h3 style={{ color: '#00D4AA', margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>{selectedGroup}</h3>

              {/* Catégorie parente */}
              <div style={{ background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 10 }}>Catégorie parente</div>
                <select value={schema.keywords[selectedGroup]?.__categorie || ''}
                  onChange={e => { const val = e.target.value; setSchema((prev: any) => ({ ...prev, keywords: { ...prev.keywords, [selectedGroup]: { ...prev.keywords[selectedGroup], __categorie: val } } })); if (val && !availableCategories.includes(val)) setAvailableCategories(prev => [...prev, val]) }}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: schema.keywords[selectedGroup]?.__categorie ? '#fff' : '#4A5568', fontSize: 13, outline: 'none', marginBottom: 8 }}>
                  <option value=''>— Sans catégorie —</option>
                  {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="Nouvelle catégorie..."
                    onKeyDown={e => { if (e.key === 'Enter' && newCategoryName.trim()) { const cat = newCategoryName.trim(); if (!availableCategories.includes(cat)) setAvailableCategories(prev => [...prev, cat]); setSchema((prev: any) => ({ ...prev, keywords: { ...prev.keywords, [selectedGroup]: { ...prev.keywords[selectedGroup], __categorie: cat } } })); setNewCategoryName('') } }}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none' }} />
                  <button onClick={() => { if (!newCategoryName.trim()) return; const cat = newCategoryName.trim(); if (!availableCategories.includes(cat)) setAvailableCategories(prev => [...prev, cat]); setSchema((prev: any) => ({ ...prev, keywords: { ...prev.keywords, [selectedGroup]: { ...prev.keywords[selectedGroup], __categorie: cat } } })); setNewCategoryName('') }}
                    style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#1E2D3D', color: '#00D4AA', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>+ Créer</button>
                </div>
              </div>

              {/* Sheet URL + Sync */}
              <div style={{ background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 10, padding: 16, marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 8 }}>Google Sheet — Produits</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input value={schema.keywords[selectedGroup]?.__sheet_url || ''}
                    onChange={e => setSchema((prev: any) => ({ ...prev, keywords: { ...prev.keywords, [selectedGroup]: { ...prev.keywords[selectedGroup], __sheet_url: e.target.value } } }))}
                    placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                    style={{ flex: 1, padding: '9px 12px', borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none' }} />
                  <button onClick={async () => {
                    const url = schema.keywords[selectedGroup]?.__sheet_url
                    if (!url) return
                    setSyncing(prev => ({ ...prev, [selectedGroup]: true }))
                    try {
                      const r = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
                      const d = await r.json()
                      if (d.error) { setMsg('✗ ' + d.error); return }
                      setSchema((prev: any) => ({ ...prev, keywords: { ...prev.keywords, [selectedGroup]: { ...prev.keywords[selectedGroup], __products: d.rows } } }))
                      setMsg(`✓ ${d.rows.length} produits synchronisés`)
                    } catch { setMsg('✗ Erreur') }
                    setSyncing(prev => ({ ...prev, [selectedGroup]: false }))
                  }} disabled={syncing[selectedGroup] || !schema.keywords[selectedGroup]?.__sheet_url}
                    style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#1E2D3D', color: '#00D4AA', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                    {syncing[selectedGroup] ? '⏳' : '🔄 Sync'}
                  </button>
                </div>

                {/* Grille produits avec upload images */}
                {schema.keywords[selectedGroup]?.__products?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 12 }}>
                      {schema.keywords[selectedGroup].__products.length} produits · Images
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                      {schema.keywords[selectedGroup].__products.map((p: any) => {
                        const logoKey = `${p.slug}-logo`
                        const screenshotKey = `${p.slug}-screenshot`
                        const rawBase = `https://raw.githubusercontent.com/afcavf54-cmd/comparatifs-platform/main/${imagesBasePath}`
                        const logoPath = p.logo_path ? `${rawBase}/${p.logo_path.replace(/^\//, '')}?t=${Date.now()}` : null
                        const screenshotPath = p.screenshot_path ? `${rawBase}/${p.screenshot_path.replace(/^\//, '')}?t=${Date.now()}` : null
                        return (
                          <div key={p.slug} style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
                            {/* Nom */}
                            <div style={{ width: 140, flexShrink: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{p.nom}</div>
                              <div style={{ fontSize: 11, color: '#4A5568' }}>{p.slug}</div>
                            </div>

                            {/* Logo */}
                            <div style={{ flexShrink: 0 }}>
                              <div style={{ fontSize: 10, color: '#4A5568', marginBottom: 4 }}>LOGO</div>
                              <div onClick={() => triggerUpload(p.slug, 'logo')} style={{
                                width: 48, height: 48, borderRadius: 8, border: '1px dashed #1E2D3D',
                                background: '#0A0E1A', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', overflow: 'hidden', position: 'relative' as const,
                                transition: 'border-color .15s'
                              }}
                                onMouseEnter={e => (e.currentTarget.style.borderColor = '#00D4AA')}
                                onMouseLeave={e => (e.currentTarget.style.borderColor = '#1E2D3D')}>
                                {uploadingImg[logoKey] ? (
                                  <span style={{ fontSize: 16 }}>⏳</span>
                                ) : logoPath ? (
                                  <img src={logoPath} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                ) : (
                                  <span style={{ fontSize: 18, opacity: .4 }}>🖼</span>
                                )}
                              </div>
                            </div>

                            {/* Screenshot */}
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 10, color: '#4A5568', marginBottom: 4 }}>APERÇU DU SITE</div>
                              <div onClick={() => triggerUpload(p.slug, 'screenshot')} style={{
                                height: 60, borderRadius: 8, border: '1px dashed #1E2D3D',
                                background: '#0A0E1A', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', overflow: 'hidden', transition: 'border-color .15s'
                              }}
                                onMouseEnter={e => (e.currentTarget.style.borderColor = '#00D4AA')}
                                onMouseLeave={e => (e.currentTarget.style.borderColor = '#1E2D3D')}>
                                {uploadingImg[screenshotKey] ? (
                                  <span style={{ color: '#8B9CB0', fontSize: 13 }}>⏳ Upload...</span>
                                ) : screenshotPath ? (
                                  <img src={screenshotPath} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <span style={{ color: '#4A5568', fontSize: 12 }}>📸 Cliquez pour uploader un aperçu</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Prompts */}
              {[
                { key: 'prompt_intro', label: 'Prompt — Introduction', placeholder: 'Rédige une introduction...' },
                { key: 'prompt_en_bref', label: 'Prompt — En bref ⚡', placeholder: 'Génère un <ul> avec 5 items : logiciel + profil cible idéal...' },
                { key: 'prompt_classement', label: 'Prompt — Classement détaillé', placeholder: 'Pour chaque logiciel...' },
                { key: 'prompt_contenu', label: 'Prompt — Contenu expert', placeholder: 'Contexte : Tu es un expert...' },
                { key: 'prompt_faq', label: 'Prompt — FAQ', placeholder: 'Génère 5 questions/réponses...' },
              ].map(({ key, label, placeholder }) => (
                <div key={key} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
                  <HtmlEditor
                    value={schema.keywords[selectedGroup]?.[key] || ''}
                    rows={6}
                    placeholder={placeholder}
                    onChange={val => setSchema((prev: any) => ({ ...prev, keywords: { ...prev.keywords, [selectedGroup]: { ...prev.keywords[selectedGroup], [key]: val } } }))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
