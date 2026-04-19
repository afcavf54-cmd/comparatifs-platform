'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type Tab = 'blocs' | 'keywords'

export default function TemplateDetailPage() {
  const { templateId } = useParams()
  const [schema, setSchema] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('blocs')
  const [editingBlock, setEditingBlock] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  // Keywords state
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<Record<string, boolean>>({})
  const [newGroupSheetUrl, setNewGroupSheetUrl] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')

  const schemaPath = `platform/schemas/${templateId}.json`

  const MOCK_VARS: Record<string, string> = {
    nom: 'Iroko Zen', nom_a: 'Iroko Zen', nom_b: 'Wemo One',
    marque: 'Iroko', marque_a: 'Iroko', marque_b: 'Wemo Reim',
    td: '7,14', td_a: '7,14', td_b: '15,27',
    tri: '7,49', frais_souscription: '0', frais_gestion: '14,4',
    year: '2026', site_name: 'Comparateur SCPI',
    theme: 'logiciel de paie',
  }

  function applyMockVars(prompt: string) {
    let result = prompt
    for (const [k, v] of Object.entries(MOCK_VARS)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
    }
    return result
  }

  function buildPreviewHtml() {
    if (!schema) return ''
    const blockTypeIcon: Record<string, string> = { h1: 'H1', h2: 'H2', paragraph: '¶', 'expert-box': '💡', list: '☰', faq: '❓', verdict: '✅' }
    const html = (schema.blocks || []).map((b: any) => {
      const preview = applyMockVars(b.prompt || '')
      return `<div style="margin-bottom:20px;padding:16px;border:1px solid #e2e8f0;border-radius:10px;background:#fff">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#a0aec0;margin-bottom:8px;display:flex;align-items:center;gap:6px">
          <span style="background:#f0f4ff;padding:2px 6px;border-radius:4px">${blockTypeIcon[b.type] || b.type}</span>
          ${b.label}
        </div>
        <div style="font-size:13px;color:#4a5568;line-height:1.6;font-style:italic;background:#f8fafc;padding:10px;border-radius:6px;border-left:3px solid #e2e8f0">
          📝 <em>${preview.length > 200 ? preview.substring(0, 200) + '...' : preview}</em>
        </div>
      </div>`
    }).join('')
    return `<div style="font-family:system-ui,sans-serif;max-width:700px;margin:0 auto;padding:24px;background:#f8fafc;min-height:100vh">
      <div style="background:#0f1a2e;color:#00d4aa;padding:8px 16px;border-radius:6px;font-size:11px;font-weight:700;margin-bottom:20px;display:inline-block">
        📐 Aperçu · ${schema?.label} · données fictives
      </div>
      ${html}
    </div>`
  }

  useEffect(() => {
    fetch(`/api/github?path=${encodeURIComponent(schemaPath)}`).then(r => r.json()).then(d => {
      try {
        const s = JSON.parse(d.content)
        if (!s.keywords) s.keywords = {}
        setSchema(s)
        const groups = Object.keys(s.keywords || {})
        if (groups.length > 0) {
          setSelectedGroup(groups[0])
          const cats = Object.keys(s.keywords[groups[0]] || {})
          if (cats.length > 0) setSelectedCategory(cats[0])
        }
      } catch {}
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [templateId])

  function updateBlock(blockId: string, field: string, value: string) {
    setSchema((prev: any) => ({
      ...prev,
      blocks: prev.blocks.map((b: any) => b.id === blockId ? { ...b, [field]: value } : b)
    }))
  }

  function updateCategoryField(group: string, cat: string, field: string, value: string) {
    setSchema((prev: any) => ({
      ...prev,
      keywords: {
        ...prev.keywords,
        [group]: {
          ...prev.keywords[group],
          [cat]: { ...(prev.keywords[group]?.[cat] || {}), [field]: value }
        }
      }
    }))
  }

  function updateCategoryPrompt(group: string, cat: string, value: string) {
    updateCategoryField(group, cat, 'prompt_custom', value)
  }

  async function syncGroup(group: string) {
    const groupData = schema.keywords[group] || {}
    const sheetUrl = groupData.__sheet_url
    if (!sheetUrl) return
    setSyncing(prev => ({ ...prev, [group]: true }))
    try {
      const r = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: sheetUrl }) })
      const d = await r.json()
      if (d.error) { setMsg('✗ ' + d.error); return }
      // Récupérer les catégories uniques depuis la colonne "categorie"
      const cats = [...new Set(d.rows.map((row: any) => row.categorie).filter(Boolean))] as string[]
      setSchema((prev: any) => {
        const newGroup = { ...prev.keywords[group] }
        cats.forEach((cat: string) => {
          if (!newGroup[cat]) newGroup[cat] = { prompt_custom: '', sheet_url: '' }
        })
        return { ...prev, keywords: { ...prev.keywords, [group]: newGroup } }
      })
      setMsg(`✓ ${cats.length} catégorie(s) synchronisées`)
    } catch { setMsg('✗ Erreur synchronisation') }
    setSyncing(prev => ({ ...prev, [group]: false }))
  }

  function addGroup() {
    if (!newGroupName.trim()) return
    const groupInit: Record<string, any> = {}
    if (newGroupSheetUrl.trim()) groupInit.__sheet_url = newGroupSheetUrl.trim()
    setSchema((prev: any) => ({
      ...prev,
      keywords: { ...prev.keywords, [newGroupName.trim()]: groupInit }
    }))
    setSelectedGroup(newGroupName.trim())
    setSelectedCategory(null)
    setNewGroupName('')
    setNewGroupSheetUrl('')
  }

  function addCategory() {
    if (!newCategoryName.trim() || !selectedGroup) return
    setSchema((prev: any) => ({
      ...prev,
      keywords: {
        ...prev.keywords,
        [selectedGroup]: {
          ...prev.keywords[selectedGroup],
          [newCategoryName.trim()]: { prompt_custom: '' }
        }
      }
    }))
    setSelectedCategory(newCategoryName.trim())
    setNewCategoryName('')
  }

  function removeCategory(group: string, cat: string) {
    setSchema((prev: any) => {
      const newKw = { ...prev.keywords }
      const newGroup = { ...newKw[group] }
      delete newGroup[cat]
      newKw[group] = newGroup
      return { ...prev, keywords: newKw }
    })
    if (selectedCategory === cat) setSelectedCategory(null)
  }

  function removeGroup(group: string) {
    setSchema((prev: any) => {
      const newKw = { ...prev.keywords }
      delete newKw[group]
      return { ...prev, keywords: newKw }
    })
    if (selectedGroup === group) { setSelectedGroup(null); setSelectedCategory(null) }
  }

  async function save() {
    setSaving(true); setMsg('')
    const r = await fetch('/api/github', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: schemaPath, content: JSON.stringify(schema, null, 2), message: `HUB: Update schema ${templateId}` })
    })
    const d = await r.json()
    setMsg(d.ok ? '✓ Modèle sauvegardé' : '✗ Erreur')
    setSaving(false)
  }

  const typeColors: Record<string, string> = { avis: '#00D4AA', vs: '#0090FF', local: '#F6AD55', classement: '#9F7AEA' }
  const blockTypeIcon: Record<string, string> = { h1: 'H1', h2: 'H2', paragraph: '¶', 'expert-box': '💡', list: '☰', faq: '❓', verdict: '✅' }

  const tabStyle = (t: Tab) => ({
    padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
    background: tab === t ? 'rgba(0,212,170,0.15)' : 'transparent',
    color: tab === t ? '#00D4AA' : '#8B9CB0',
  })

  if (loading) return <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 60 }}>Chargement...</div>
  if (!schema) return <div style={{ color: '#FC8181', textAlign: 'center', padding: 60 }}>Modèle introuvable</div>

  const keywords = schema.keywords || {}
  const groups = Object.keys(keywords)
  const selectedGroupCats = selectedGroup ? Object.keys(keywords[selectedGroup] || {}) : []
  const selectedCatData = (selectedGroup && selectedCategory) ? keywords[selectedGroup]?.[selectedCategory] : null

  return (
    <div style={{ maxWidth: showPreview ? '100%' : 800 }}>
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
          <p style={{ color: '#8B9CB0', fontSize: 13, margin: 0 }}>{schema.description} · {schema.blocks?.length} blocs</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('✓') ? '#00D4AA' : '#FC8181' }}>{msg}</span>}
          {tab === 'blocs' && (
            <button onClick={() => setShowPreview(p => !p)} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid #1E2D3D', background: showPreview ? 'rgba(0,212,170,0.1)' : 'transparent', color: showPreview ? '#00D4AA' : '#8B9CB0', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              {showPreview ? '✕ Fermer aperçu' : '👁 Aperçu'}
            </button>
          )}
          <button onClick={save} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            {saving ? '...' : '💾 Sauvegarder'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        <button style={tabStyle('blocs')} onClick={() => setTab('blocs')}>🧱 Structure ({schema.blocks?.length} blocs)</button>
        <button style={tabStyle('keywords')} onClick={() => setTab('keywords')}>🏷 Mots clés ({groups.length} groupes)</button>
      </div>

      {/* ── BLOCS ── */}
      {tab === 'blocs' && (
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ flex: showPreview ? '0 0 420px' : 1 }}>
            {/* Variables */}
            <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10 }}>Variables disponibles</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                {(schema.variables || []).map((v: string) => (
                  <code key={v} style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(0,212,170,0.1)', color: '#00D4AA', fontSize: 12 }}>{`{${v}}`}</code>
                ))}
              </div>
            </div>

            {(schema.blocks || []).map((block: any) => (
              <div key={block.id} style={{ background: '#0D1117', border: `1px solid ${editingBlock === block.id ? '#00D4AA' : '#1E2D3D'}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }}
                  onClick={() => setEditingBlock(editingBlock === block.id ? null : block.id)}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: '#1E2D3D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#8B9CB0', flexShrink: 0 }}>
                    {blockTypeIcon[block.type] || block.type}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{block.label}</div>
                    <div style={{ fontSize: 11, color: '#4A5568', marginTop: 2 }}>champ: <code style={{ color: '#8B9CB0' }}>{block.field}</code> · type: {block.type}</div>
                  </div>
                  <div style={{ fontSize: 18, color: '#4A5568' }}>{editingBlock === block.id ? '▲' : '▼'}</div>
                </div>
                {editingBlock === block.id && (
                  <div style={{ padding: '0 18px 18px', borderTop: '1px solid #1E2D3D' }}>
                    <div style={{ paddingTop: 14 }}>
                      <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>Prompt</div>
                      <textarea value={block.prompt || ''} rows={6} onChange={e => updateBlock(block.id, 'prompt', e.target.value)}
                        style={{ width: '100%', padding: 12, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, resize: 'vertical' as const, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
                      <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, marginTop: 12, marginBottom: 6 }}>Label</div>
                      <input value={block.label || ''} onChange={e => updateBlock(block.id, 'label', e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
            <button onClick={() => {
              const id = `block_${Date.now()}`
              setSchema((prev: any) => ({ ...prev, blocks: [...(prev.blocks || []), { id, type: 'paragraph', label: 'Nouveau bloc', field: id, prompt: '' }] }))
              setEditingBlock(id)
            }} style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px dashed #1E2D3D', background: 'transparent', color: '#4A5568', cursor: 'pointer', fontSize: 13, marginTop: 8 }}>
              ➕ Ajouter un bloc
            </button>
          </div>

          {showPreview && (
            <div style={{ flex: 1, position: 'sticky', top: 0, maxHeight: '90vh', overflow: 'hidden', borderRadius: 12, border: '1px solid #1E2D3D' }}>
              <iframe srcDoc={buildPreviewHtml()} style={{ width: '100%', height: '100%', minHeight: '80vh', border: 'none', borderRadius: 12 }} title="Aperçu template" />
            </div>
          )}
        </div>
      )}

      {/* ── MOTS CLÉS ── */}
      {tab === 'keywords' && (
        <div style={{ display: 'flex', gap: 16 }}>
          {/* Sidebar groupes + catégories */}
          <div style={{ width: 260, flexShrink: 0 }}>
            {/* Groupes */}
            <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #1E2D3D', fontSize: 11, color: '#8B9CB0', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Groupes</div>
              {groups.map(group => (
                <div key={group} onClick={() => { setSelectedGroup(group); setSelectedCategory(null) }}
                  style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: selectedGroup === group ? 'rgba(0,212,170,0.1)' : 'transparent',
                    borderLeft: selectedGroup === group ? '2px solid #00D4AA' : '2px solid transparent',
                    color: selectedGroup === group ? '#fff' : '#8B9CB0', borderBottom: '1px solid #1E2D3D' }}>
                  <span style={{ fontWeight: 600 }}>{group}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#4A5568' }}>{Object.keys(keywords[group] || {}).length}</span>
                    <span onClick={e => { e.stopPropagation(); removeGroup(group) }} style={{ color: '#FC8181', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</span>
                  </div>
                </div>
              ))}
              <div style={{ padding: '10px 14px', borderTop: '1px solid #1E2D3D' }}>
                <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Nom du groupe..." onKeyDown={e => e.key === 'Enter' && addGroup()}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none', marginBottom: 6, boxSizing: 'border-box' as const }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={newGroupSheetUrl} onChange={e => setNewGroupSheetUrl(e.target.value)} placeholder="URL Sheet CSV (optionnel)"
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 6, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 11, outline: 'none' }} />
                  <button onClick={addGroup} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: '#1E2D3D', color: '#00D4AA', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>+</button>
                </div>
              </div>
            </div>

            {/* Catégories du groupe sélectionné */}
            {selectedGroup && (
              <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #1E2D3D', fontSize: 11, color: '#F6AD55', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                  {selectedGroup}
                </div>
                {/* Sheet URL + Sync */}
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #1E2D3D', background: '#0A0E1A' }}>
                  <div style={{ fontSize: 10, color: '#4A5568', marginBottom: 6 }}>URL SHEET DU GROUPE</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={schema.keywords[selectedGroup]?.__sheet_url || ''}
                      onChange={e => setSchema((prev: any) => ({ ...prev, keywords: { ...prev.keywords, [selectedGroup]: { ...prev.keywords[selectedGroup], __sheet_url: e.target.value } } }))}
                      placeholder="https://docs.google.com/..."
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 6, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 11, outline: 'none' }}
                    />
                    <button onClick={() => syncGroup(selectedGroup)} disabled={syncing[selectedGroup] || !schema.keywords[selectedGroup]?.__sheet_url}
                      style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: schema.keywords[selectedGroup]?.__sheet_url ? '#1E2D3D' : '#0A0E1A', color: schema.keywords[selectedGroup]?.__sheet_url ? '#00D4AA' : '#4A5568', cursor: schema.keywords[selectedGroup]?.__sheet_url ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' as const }}>
                      {syncing[selectedGroup] ? '⏳' : '🔄 Sync'}
                    </button>
                  </div>
                </div>
                {selectedGroupCats.filter(cat => cat !== '__sheet_url').map(cat => (
                  <div key={cat} onClick={() => setSelectedCategory(cat)}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: selectedCategory === cat ? 'rgba(246,173,85,0.1)' : 'transparent',
                      borderLeft: selectedCategory === cat ? '2px solid #F6AD55' : '2px solid transparent',
                      color: selectedCategory === cat ? '#fff' : '#8B9CB0', borderBottom: '1px solid #1E2D3D' }}>
                    <span>{cat}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {keywords[selectedGroup][cat]?.prompt_custom && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00D4AA', display: 'inline-block' }} />}
                      <span onClick={e => { e.stopPropagation(); removeCategory(selectedGroup, cat) }} style={{ color: '#FC8181', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</span>
                    </div>
                  </div>
                ))}
                <div style={{ padding: '10px 14px', display: 'flex', gap: 8 }}>
                  <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="Ex: logiciel de paie" onKeyDown={e => e.key === 'Enter' && addCategory()}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 6, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none' }} />
                  <button onClick={addCategory} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: '#1E2D3D', color: '#F6AD55', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>+</button>
                </div>
              </div>
            )}
          </div>

          {/* Éditeur de la catégorie sélectionnée */}
          <div style={{ flex: 1, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden' }}>
            {!selectedCategory || !selectedCatData ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#4A5568' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🏷</div>
                <div>{selectedGroup ? 'Sélectionnez ou créez une catégorie' : 'Sélectionnez ou créez un groupe'}</div>
              </div>
            ) : (
              <div style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                  <span style={{ fontSize: 11, color: '#8B9CB0' }}>{selectedGroup}</span>
                  <span style={{ color: '#4A5568' }}>›</span>
                  <h3 style={{ color: '#F6AD55', margin: 0, fontSize: 15, fontWeight: 600 }}>{selectedCategory}</h3>
                  {selectedCatData.prompt_custom && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(0,212,170,0.15)', color: '#00D4AA' }}>✓ prompt défini</span>}
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>
                    URL Google Sheet
                  </div>
                  <div style={{ fontSize: 12, color: '#4A5568', marginBottom: 8 }}>
                    Sheet CSV qui alimente les produits pour cette catégorie.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={selectedCatData.sheet_url || ''}
                      onChange={e => updateCategoryField(selectedGroup!, selectedCategory!, 'sheet_url', e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }}
                    />
                    {selectedCatData.sheet_url && (
                      <a href={selectedCatData.sheet_url} target="_blank" rel="noopener noreferrer"
                        style={{ padding: '10px 14px', borderRadius: 8, background: '#1E2D3D', color: '#00D4AA', fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                        ↗
                      </a>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>
                    Prompt de génération du contenu
                  </div>
                  <div style={{ fontSize: 12, color: '#4A5568', marginBottom: 10, lineHeight: 1.6 }}>
                    Ce prompt sera utilisé pour générer la section de contenu spécifique à <strong style={{ color: '#F6AD55' }}>{selectedCategory}</strong>.<br/>
                    Il remplace le prompt générique du template pour cette catégorie.
                  </div>
                  <textarea
                    value={selectedCatData.prompt_custom || ''}
                    rows={14}
                    onChange={e => updateCategoryPrompt(selectedGroup!, selectedCategory!, e.target.value)}
                    placeholder={`Contexte : Tu es un expert en ${selectedCategory}.\n\nTâche : Génère 4 sections H3 segmentées par profil...\n\nMots-clés à intégrer : "${selectedCategory} gratuit", "meilleur ${selectedCategory}"...\n\nLogiciels à recommander : {produits}`}
                    style={{ width: '100%', padding: 14, borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 13, lineHeight: 1.7, resize: 'vertical' as const, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                  />
                  <div style={{ fontSize: 11, color: '#4A5568', marginTop: 8 }}>
                    Variable disponible : <code style={{ color: '#00D4AA' }}>{'{produits}'}</code> → liste des logiciels de cette catégorie
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
