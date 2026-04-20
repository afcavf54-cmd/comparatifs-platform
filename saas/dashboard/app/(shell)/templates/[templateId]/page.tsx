'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type Tab = 'keywords'

export default function TemplateDetailPage() {
  const { templateId } = useParams()
  const [schema, setSchema] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('keywords')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // Keywords state
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<Record<string, boolean>>({})
  const [newGroupSheetUrl, setNewGroupSheetUrl] = useState('')
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [availableCategories, setAvailableCategories] = useState<string[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')

  const schemaPath = `platform/schemas/${templateId}.json`


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
        // Extraire les catégories uniques déjà définies
        const cats = [...new Set(
          Object.values(s.keywords || {})
            .map((v: any) => v.__categorie)
            .filter(Boolean)
        )] as string[]
        setAvailableCategories(cats)
      } catch {}
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [templateId])

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


  if (loading) return <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 60 }}>Chargement...</div>
  if (!schema) return <div style={{ color: '#FC8181', textAlign: 'center', padding: 60 }}>Modèle introuvable</div>

  const keywords = schema.keywords || {}
  const groups = Object.keys(keywords)
  const selectedGroupCats = selectedGroup ? Object.keys(keywords[selectedGroup] || {}) : []
  const selectedCatData = (selectedGroup && selectedCategory) ? keywords[selectedGroup]?.[selectedCategory] : null

  return (
    <div style={{ maxWidth: 800 }}>
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

          <button onClick={save} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            {saving ? '...' : '💾 Sauvegarder'}
          </button>
        </div>
      </div>




      {/* ── MOTS CLÉS ── */}
      {tab === 'keywords' && (
        <div style={{ display: 'flex', gap: 16 }}>

          {/* Sidebar types */}
          <div style={{ width: 240, flexShrink: 0, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #1E2D3D', fontSize: 11, color: '#8B9CB0', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
              Types de logiciels
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {Object.keys(schema.keywords || {}).map(type => (
                <div key={type} onClick={() => { setSelectedGroup(type); setSelectedCategory(null) }}
                  style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: selectedGroup === type ? 'rgba(0,212,170,0.1)' : 'transparent',
                    borderLeft: selectedGroup === type ? '2px solid #00D4AA' : '2px solid transparent',
                    color: selectedGroup === type ? '#fff' : '#8B9CB0',
                    borderBottom: '1px solid #1E2D3D' }}>
                  <div>
                    <div>{type}</div>
                    <div style={{ fontSize: 10, color: '#4A5568', marginTop: 2 }}>
                      {schema.keywords[type]?.__products?.length ? `${schema.keywords[type].__products.length} produits` : 'Non synchronisé'}
                    </div>
                  </div>
                  <span onClick={e => { e.stopPropagation(); removeGroup(type) }} style={{ color: '#FC8181', cursor: 'pointer', fontSize: 16 }}>×</span>
                </div>
              ))}
              {Object.keys(schema.keywords || {}).length === 0 && (
                <div style={{ color: '#4A5568', padding: 16, fontSize: 12, textAlign: 'center' }}>Aucun type</div>
              )}
            </div>

            {/* Ajouter un type */}
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
                      const newSchema = { ...schema, keywords: { ...(schema.keywords || {}), [newGroupName.trim()]: { __sheet_url: '', __products: [], prompt_intro: '', prompt_classement: '', prompt_contenu: '', prompt_faq: '' } } }
                      setSchema(newSchema)
                      setSelectedGroup(newGroupName.trim())
                      setNewGroupName(''); setShowAddGroup(false)
                      // Sauvegarde immédiate
                      setSaving(true)
                      const r = await fetch('/api/github', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: schemaPath, content: JSON.stringify(newSchema, null, 2), message: `HUB: Add keyword type ${newGroupName.trim()}` }) })
                      const d = await r.json()
                      setMsg(d.ok ? '✓ Type créé et sauvegardé' : '✗ Erreur')
                      setSaving(false)
                    }} style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      ✓ Créer
                    </button>
                    <button onClick={() => { setShowAddGroup(false); setNewGroupName('') }}
                      style={{ padding: '7px 10px', borderRadius: 6, border: 'none', background: '#1E2D3D', color: '#8B9CB0', cursor: 'pointer', fontSize: 12 }}>✕</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Éditeur du type sélectionné */}
          <div style={{ flex: 1, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'auto' }}>
            {!selectedGroup ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#4A5568' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🏷</div>
                <div>Sélectionnez ou créez un type de logiciel</div>
              </div>
            ) : (
              <div style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <h3 style={{ color: '#00D4AA', margin: 0, fontSize: 16, fontWeight: 600 }}>{selectedGroup}</h3>
                </div>

                {/* Catégorie parente */}
                <div style={{ background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 10 }}>
                    Catégorie parente
                  </div>
                  <div style={{ fontSize: 12, color: '#4A5568', marginBottom: 10 }}>
                    Regroupe ce type dans une catégorie pour la page d'accueil (ex: Comptabilité & Finance)
                  </div>
                  <select
                    value={schema.keywords[selectedGroup]?.__categorie || ''}
                    onChange={e => {
                      const val = e.target.value
                      setSchema((prev: any) => ({
                        ...prev,
                        keywords: { ...prev.keywords, [selectedGroup]: { ...prev.keywords[selectedGroup], __categorie: val } }
                      }))
                      if (val && !availableCategories.includes(val)) {
                        setAvailableCategories(prev => [...prev, val])
                      }
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: schema.keywords[selectedGroup]?.__categorie ? '#fff' : '#4A5568', fontSize: 13, outline: 'none', marginBottom: 8 }}>
                    <option value=''>— Sans catégorie —</option>
                    {availableCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)}
                      placeholder="Nouvelle catégorie..."
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newCategoryName.trim()) {
                          const cat = newCategoryName.trim()
                          if (!availableCategories.includes(cat)) setAvailableCategories(prev => [...prev, cat])
                          setSchema((prev: any) => ({
                            ...prev,
                            keywords: { ...prev.keywords, [selectedGroup]: { ...prev.keywords[selectedGroup], __categorie: cat } }
                          }))
                          setNewCategoryName('')
                        }
                      }}
                      style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none' }} />
                    <button onClick={() => {
                      if (!newCategoryName.trim()) return
                      const cat = newCategoryName.trim()
                      if (!availableCategories.includes(cat)) setAvailableCategories(prev => [...prev, cat])
                      setSchema((prev: any) => ({
                        ...prev,
                        keywords: { ...prev.keywords, [selectedGroup]: { ...prev.keywords[selectedGroup], __categorie: cat } }
                      }))
                      setNewCategoryName('')
                    }} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#1E2D3D', color: '#00D4AA', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      + Créer
                    </button>
                  </div>
                </div>

                {/* Sheet URL + Sync */}
                <div style={{ background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 10, padding: 16, marginBottom: 24 }}>
                  <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>
                    Google Sheet — Produits
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input
                      value={schema.keywords[selectedGroup]?.__sheet_url || ''}
                      onChange={e => setSchema((prev: any) => ({ ...prev, keywords: { ...prev.keywords, [selectedGroup]: { ...prev.keywords[selectedGroup], __sheet_url: e.target.value } } }))}
                      placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                      style={{ flex: 1, padding: '9px 12px', borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none' }}
                    />
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

                  {/* Produits synchronisés */}
                  {schema.keywords[selectedGroup]?.__products?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, color: '#4A5568', marginBottom: 8 }}>{schema.keywords[selectedGroup].__products.length} produits</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                        {schema.keywords[selectedGroup].__products.map((p: any) => (
                          <span key={p.slug} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: '#1E2D3D', color: '#8B9CB0', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {p.logo_url && <img src={p.logo_url} alt="" style={{ width: 14, height: 14, borderRadius: 2, objectFit: 'contain' }} />}
                            {p.nom}
                            {p.note_redaction && <span style={{ color: '#F6AD55' }}>★{p.note_redaction}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Prompts */}
                {[
                  { key: 'prompt_intro', label: 'Prompt — Introduction', placeholder: 'Rédige une introduction pour une page classement des meilleurs {type}...' },
                  { key: 'prompt_classement', label: 'Prompt — Classement détaillé', placeholder: 'Pour chaque logiciel de la liste, génère une fiche détaillée...' },
                  { key: 'prompt_contenu', label: 'Prompt — Contenu expert', placeholder: 'Contexte : Tu es un expert en {type}. Génère 4 sections H3 segmentées par profil...' },
                  { key: 'prompt_faq', label: 'Prompt — FAQ', placeholder: 'Génère 5 questions/réponses FAQ sur les {type}...' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
                    <textarea
                      value={schema.keywords[selectedGroup]?.[key] || ''}
                      rows={5}
                      onChange={e => setSchema((prev: any) => ({ ...prev, keywords: { ...prev.keywords, [selectedGroup]: { ...prev.keywords[selectedGroup], [key]: e.target.value } } }))}
                      placeholder={placeholder}
                      style={{ width: '100%', padding: 12, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, resize: 'vertical' as const, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
