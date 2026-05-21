'use client'
import React from 'react'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

// ── Tabs principaux du modèle ───────────────────────────────────────────
// 'global'     : prompt global du site + 5 prompts par défaut pour les classements
// 'classement' : sidebar Types + détails (mots-clés, sheet, produits, prompts)
// 'avis'       : limites de mots et prompts par section pour les pages d'avis
// 'blog'       : pareil pour les articles de blog (placeholder en attente)
type Tab = 'global' | 'classement' | 'avis' | 'blog'

// ── Sections d'un avis avec leur fourchette de mots par défaut ──────────
// Min et max par section. L'éditeur peut ajuster chaque borne, et Claude
// est instruit de viser cette fourchette ([min, max] mots). Les valeurs
// utilisateur stockées dans `schema.avis_config` prennent le pas sur les
// défauts ci-dessous.
const DEFAULT_AVIS_CONFIG: Record<string, { label: string, description: string, words_min_default: number, words_max_default: number }> = {
  hero: {
    label: '🎯 Hero (intro éditoriale)',
    description: 'Paragraphe d\'introduction affiché sous le H1. Pose le contexte du sujet, l\'angle de l\'avis, à qui s\'adresse la marque.',
    words_min_default: 80,
    words_max_default: 130,
  },
  en_bref: {
    label: '⚡ Mon avis en Bref (résumé)',
    description: 'Encart affiché à côté du logo avec la note. Synthèse de l\'avis : verdict global, point fort clé, point faible clé.',
    words_min_default: 50,
    words_max_default: 90,
  },
  points_forts: {
    label: '✅ Points forts (par item)',
    description: 'Limite par bullet point de la liste « Points forts ». 4-6 items au total recommandés.',
    words_min_default: 5,
    words_max_default: 14,
  },
  points_faibles: {
    label: '❌ Points faibles (par item)',
    description: 'Limite par bullet point de la liste « Points faibles ». 2-4 items au total.',
    words_min_default: 5,
    words_max_default: 14,
  },
  faq: {
    label: '❓ FAQ (par réponse)',
    description: 'Limite par réponse de FAQ. 4-6 questions au total recommandées.',
    words_min_default: 30,
    words_max_default: 80,
  },
  verdict: {
    label: '🏆 Verdict + CTA',
    description: 'Bloc de conclusion centré, juste avant le bouton call-to-action.',
    words_min_default: 50,
    words_max_default: 100,
  },
}

// ── Sections d'un article de blog (placeholder, à étoffer plus tard) ────
const DEFAULT_BLOG_CONFIG: Record<string, { label: string, description: string, words_min_default: number, words_max_default: number }> = {
  excerpt: {
    label: '📌 Excerpt (meta-description)',
    description: 'Court résumé affiché dans les SERP et les cartes d\'article.',
    words_min_default: 15,
    words_max_default: 30,
  },
  intro: {
    label: '📝 Intro',
    description: 'Paragraphe d\'ouverture qui pose le sujet et l\'angle.',
    words_min_default: 100,
    words_max_default: 200,
  },
  sections_h2: {
    label: '📚 Sections H2 (par section)',
    description: 'Limite par bloc H2 du corps de l\'article.',
    words_min_default: 250,
    words_max_default: 500,
  },
  conclusion: {
    label: '🎯 Conclusion',
    description: 'Synthèse finale, takeaway pour le lecteur.',
    words_min_default: 60,
    words_max_default: 130,
  },
  faq: {
    label: '❓ FAQ (par réponse)',
    description: 'Limite par réponse FAQ. Optionnel.',
    words_min_default: 40,
    words_max_default: 90,
  },
}

// ── HtmlEditor v2 (visuel + source) ─────────────────────────────────────
// Inchangé depuis la version précédente.
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
    background: mode === m ? '#1E2D3D' : '#0A0E1A',
    color: mode === m ? '#fff' : '#8B9CB0',
  } as const)

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <button style={tabBtn('visual','Visuel')} onClick={() => switchMode('visual')}>✏️ Visuel</button>
        <button style={tabBtn('source','HTML')} onClick={() => switchMode('source')}>{'</>'} HTML</button>
        <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center', marginLeft: 8 }}>
          <button onClick={() => mode === 'visual' ? blockSource('h2') : blockSource('h2')} title="H2" style={{ padding: '2px 7px', borderRadius: 4, border: '1px solid #1E2D3D', background: '#0A0E1A', color: '#8B9CB0', cursor: 'pointer', fontSize: 11 }}>H2</button>
          <button onClick={() => mode === 'visual' ? blockSource('h3') : blockSource('h3')} title="H3" style={{ padding: '2px 7px', borderRadius: 4, border: '1px solid #1E2D3D', background: '#0A0E1A', color: '#8B9CB0', cursor: 'pointer', fontSize: 11 }}>H3</button>
          <button onClick={() => mode === 'visual' ? exec('bold') : wrapSource('<strong>', '</strong>')} title="Gras" style={{ padding: '2px 7px', borderRadius: 4, border: '1px solid #1E2D3D', background: '#0A0E1A', color: '#8B9CB0', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>B</button>
          <button onClick={() => mode === 'visual' ? exec('italic') : wrapSource('<em>', '</em>')} title="Italique" style={{ padding: '2px 7px', borderRadius: 4, border: '1px solid #1E2D3D', background: '#0A0E1A', color: '#8B9CB0', cursor: 'pointer', fontSize: 11, fontStyle: 'italic' }}>I</button>
          <button onClick={() => mode === 'visual' ? exec('insertUnorderedList') : wrapSource('<ul>\n  <li>', '</li>\n</ul>')} title="Liste" style={{ padding: '2px 7px', borderRadius: 4, border: '1px solid #1E2D3D', background: '#0A0E1A', color: '#8B9CB0', cursor: 'pointer', fontSize: 11 }}>•</button>
        </div>
      </div>
      {mode === 'visual' ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={onVisualInput}
          style={{
            minHeight: rows * 22,
            padding: '10px 12px',
            borderRadius: '0 8px 8px 8px',
            background: '#0A0E1A',
            border: '1px solid #1E2D3D',
            color: '#fff',
            fontSize: 13,
            outline: 'none',
            lineHeight: 1.6,
          }}
          dangerouslySetInnerHTML={{ __html: value }}
        />
      ) : (
        <textarea
          ref={taRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: '0 8px 8px 8px',
            background: '#0A0E1A',
            border: '1px solid #1E2D3D',
            color: '#fff',
            fontSize: 13,
            outline: 'none',
            resize: 'vertical' as const,
            fontFamily: 'ui-monospace, monospace',
            boxSizing: 'border-box' as const,
          }}
        />
      )}
    </div>
  )
}

// ── Sous-composant : section configurable avec fourchette de mots + prompt ─
function SectionConfigCard({
  label, description, words_min, words_max, prompt, onChangeWordsMin, onChangeWordsMax, onChangePrompt,
}: {
  label: string, description: string, words_min: number, words_max: number, prompt: string,
  onChangeWordsMin: (n: number) => void, onChangeWordsMax: (n: number) => void, onChangePrompt: (s: string) => void,
}) {
  return (
    <div style={{ background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 10, padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{label}</div>
          <div style={{ color: '#8B9CB0', fontSize: 12, lineHeight: 1.5 }}>{description}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <input
            type="number"
            value={words_min || ''}
            onChange={e => onChangeWordsMin(parseInt(e.target.value) || 0)}
            placeholder="min"
            style={{
              width: 60, padding: '6px 10px', borderRadius: 6,
              background: '#0D1117', border: '1px solid #1E2D3D',
              color: '#fff', fontSize: 13, outline: 'none', textAlign: 'center' as const, fontWeight: 600,
            }}
          />
          <span style={{ color: '#8B9CB0', fontSize: 12 }}>→</span>
          <input
            type="number"
            value={words_max || ''}
            onChange={e => onChangeWordsMax(parseInt(e.target.value) || 0)}
            placeholder="max"
            style={{
              width: 60, padding: '6px 10px', borderRadius: 6,
              background: '#0D1117', border: '1px solid #1E2D3D',
              color: '#fff', fontSize: 13, outline: 'none', textAlign: 'center' as const, fontWeight: 600,
            }}
          />
          <span style={{ color: '#8B9CB0', fontSize: 12 }}>mots</span>
        </div>
      </div>
      <textarea
        value={prompt}
        onChange={e => onChangePrompt(e.target.value)}
        rows={2}
        placeholder="Prompt complémentaire pour cette section (optionnel). Ex: « Mets en avant le rapport qualité/prix. »"
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 6,
          background: '#0D1117', border: '1px solid #1E2D3D',
          color: '#fff', fontSize: 12, outline: 'none', resize: 'vertical' as const,
          fontFamily: 'inherit', boxSizing: 'border-box' as const, lineHeight: 1.5,
        }}
      />
    </div>
  )
}

export default function TemplateDetailPage() {
  const { templateId } = useParams()
  const [schema, setSchema] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  // Tab par défaut : 'global'. L'utilisateur peut switcher entre les 4.
  const [tab, setTab] = useState<Tab>('global')
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
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})
  const [globalPrompt, setGlobalPrompt] = useState('')
  const [savingGlobal, setSavingGlobal] = useState(false)
  const [defaultPrompts, setDefaultPrompts] = useState<Record<string, any>>({
    prompt_intro: { text: '', words_min: 100, words_max: 300 },
    prompt_en_bref: { text: '', words_min: 10, words_max: 30 },
    prompt_classement: { text: '', words_min: 150, words_max: 400 },
    prompt_contenu: { text: '', words_min: 200, words_max: 500 },
    prompt_faq: { text: '', words_min: 50, words_max: 150 },
  })
  // Configs des onglets Avis et Blog : map { section_key -> { words_max, prompt } }
  const [avisConfig, setAvisConfig] = useState<Record<string, { words_min: number, words_max: number, prompt: string }>>({})
  const [blogConfig, setBlogConfig] = useState<Record<string, { words_min: number, words_max: number, prompt: string }>>({})
  const [loadedImages, setLoadedImages] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const schemaPath = `platform/schemas/${templateId}.json`
  const imagesBasePath = `platform/schemas/images/${templateId}`

  useEffect(() => {
    fetch(`/api/github?path=${encodeURIComponent(schemaPath)}&t=${Date.now()}`).then(r => r.json()).then(d => {
      try {
        const s = JSON.parse(d.content)
        if (!s.keywords) s.keywords = {}
        setSchema(s)
        // Charger global_prompt et default_prompts
        setGlobalPrompt(s.global_prompt || '')
        if (s.default_prompts) {
          setDefaultPrompts({
            prompt_intro: s.default_prompts.prompt_intro || { text: '', words_min: 100, words_max: 300 },
            prompt_en_bref: s.default_prompts.prompt_en_bref || { text: '', words_min: 10, words_max: 30 },
            prompt_classement: s.default_prompts.prompt_classement || { text: '', words_min: 150, words_max: 400 },
            prompt_contenu: s.default_prompts.prompt_contenu || { text: '', words_min: 200, words_max: 500 },
            prompt_faq: s.default_prompts.prompt_faq || { text: '', words_min: 50, words_max: 150 },
          })
        }
        // Charger avis_config : merge entre les défauts (pour les sections manquantes)
        // et les valeurs persistées dans le schema.
        const avisStored = s.avis_config || {}
        const avisMerged: Record<string, { words_min: number, words_max: number, prompt: string }> = {}
        Object.entries(DEFAULT_AVIS_CONFIG).forEach(([key, def]) => {
          avisMerged[key] = {
            words_min: avisStored[key]?.words_min ?? def.words_min_default,
            words_max: avisStored[key]?.words_max ?? def.words_max_default,
            prompt: avisStored[key]?.prompt ?? '',
          }
        })
        setAvisConfig(avisMerged)
        // Idem pour blog_config
        const blogStored = s.blog_config || {}
        const blogMerged: Record<string, { words_min: number, words_max: number, prompt: string }> = {}
        Object.entries(DEFAULT_BLOG_CONFIG).forEach(([key, def]) => {
          blogMerged[key] = {
            words_min: blogStored[key]?.words_min ?? def.words_min_default,
            words_max: blogStored[key]?.words_max ?? def.words_max_default,
            prompt: blogStored[key]?.prompt ?? '',
          }
        })
        setBlogConfig(blogMerged)

        const groups = Object.keys(s.keywords || {})
        if (groups.length > 0) setSelectedGroup(groups[0])
        const cats = [...new Set(Object.values(s.keywords || {}).map((v: any) => v.__categorie).filter(Boolean))] as string[]
        setAvailableCategories(cats)
      } catch {}
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [templateId])

  // Charger les aperçus quand le groupe change
  useEffect(() => {
    if (!selectedGroup || !schema?.keywords?.[selectedGroup]?.__products) return
    const owner = 'afcavf54-cmd'
    const repo = 'comparatifs-platform'
    const ts = Date.now()
    const newImages: Record<string, string> = {}
    schema.keywords[selectedGroup].__products.forEach((p: any) => {
      const base = `https://raw.githubusercontent.com/${owner}/${repo}/main/${imagesBasePath}`
      if (p.logo_path) {
        newImages[`${p.slug}-logo`] = `${base}/${p.logo_path.replace(/^\//, '')}?t=${ts}`
      }
      if (p.screenshot_path) {
        newImages[`${p.slug}-screenshot`] = `${base}/${p.screenshot_path.replace(/^\//, '')}?t=${ts}`
      }
    })
    setLoadedImages(newImages)
  }, [selectedGroup])

  // Sauvegarde GLOBALE du schema (utilisée par les onglets Classement, Avis, Blog).
  // Fusionne les states locaux dans le schema avant push pour ne rien perdre.
  async function save() {
    setSaving(true); setMsg('')
    const fullSchema = {
      ...schema,
      global_prompt: globalPrompt,
      default_prompts: defaultPrompts,
      avis_config: avisConfig,
      blog_config: blogConfig,
    }
    const r = await fetch('/api/github', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: schemaPath, content: JSON.stringify(fullSchema, null, 2), message: `HUB: Update schema ${templateId}` })
    })
    const d = await r.json()
    setMsg(d.ok ? '✓ Sauvegardé' : '✗ Erreur')
    setSaving(false)
    // Met aussi à jour le schema en mémoire (utile car d'autres onglets peuvent lire dessus)
    if (d.ok) setSchema(fullSchema)
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
          const rawUrl = `https://raw.githubusercontent.com/afcavf54-cmd/comparatifs-platform/main/${imagesBasePath}/${filename}?t=${Date.now()}`
          setLoadedImages(prev => ({ ...prev, [`${slug}-${imgType}`]: rawUrl }))
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

  function triggerUpload(slug: string, imgType: 'logo' | 'screenshot') {
    pendingRef.current = { slug, type: imgType }
    fileInputRef.current?.click()
  }

  const typeColors: Record<string, string> = { avis: '#00D4AA', vs: '#0090FF', local: '#F6AD55', classement: '#9F7AEA' }

  if (loading) return <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 60 }}>Chargement...</div>
  if (!schema) return <div style={{ color: '#FC8181', textAlign: 'center', padding: 60 }}>Modèle introuvable</div>

  const keywords = schema.keywords || {}

  // ─── Style commun des onglets ─────────────────────────────────────────
  const tabBtnStyle = (active: boolean) => ({
    padding: '10px 18px',
    borderRadius: '10px 10px 0 0',
    border: 'none',
    borderBottom: active ? '2px solid #00D4AA' : '2px solid transparent',
    background: active ? '#0D1117' : 'transparent',
    color: active ? '#fff' : '#8B9CB0',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    transition: 'all .15s',
  } as const)

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Popup confirmation suppression (onglet Classement) */}
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

      {/* ─── Breadcrumb ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24, fontSize: 13, color: '#8B9CB0' }}>
        <Link href="/templates" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Modèles</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: '#fff' }}>{schema.label}</span>
      </div>

      {/* ─── Header : titre + bouton Sauvegarder ────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
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

      {/* ─── Onglets ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #1E2D3D', marginBottom: 0 }}>
        <button onClick={() => setTab('global')} style={tabBtnStyle(tab === 'global')}>🌐 Prompt global</button>
        <button onClick={() => setTab('classement')} style={tabBtnStyle(tab === 'classement')}>🏆 Classement</button>
        <button onClick={() => setTab('avis')} style={tabBtnStyle(tab === 'avis')}>⭐ Avis</button>
        <button onClick={() => setTab('blog')} style={tabBtnStyle(tab === 'blog')}>📝 Blog</button>
      </div>

      {/* ─── Contenu de l'onglet actif ──────────────────────────────── */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 20 }}>

        {/* ╔═════ ONGLET PROMPT GLOBAL ═══════════════════════════════ */}
        {tab === 'global' && (
          <div>
            <div style={{ marginBottom: 6, color: '#fff', fontWeight: 600, fontSize: 14 }}>Prompt global du site</div>
            <p style={{ color: '#8B9CB0', fontSize: 12, marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
              Appliqué à toutes les générations de ce modèle (classements, avis, blog). Ton, style, contraintes éditoriales communes.
            </p>
            <textarea
              value={globalPrompt}
              onChange={e => setGlobalPrompt(e.target.value)}
              rows={8}
              placeholder="Ex: Tu es un expert en logiciels SaaS. Écris en français, ton professionnel, sans tirets longs..."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit', boxSizing: 'border-box' as const, lineHeight: 1.6 }}
            />

            {/* ─── Prompts par défaut par section (utilisés au moment de créer un nouveau Type dans l'onglet Classement) ─── */}
            <div style={{ marginTop: 24, borderTop: '1px solid #1E2D3D', paddingTop: 16 }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Prompts par défaut par section (Classement)</div>
              <p style={{ color: '#8B9CB0', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
                Ces prompts prérempliront chaque nouveau type ajouté dans l'onglet Classement et seront combinés avec les prompts spécifiques lors de la génération.
              </p>
              {[
                { key: 'prompt_intro', label: '📝 Introduction' },
                { key: 'prompt_en_bref', label: '⚡ En bref', perLine: true },
                { key: 'prompt_classement', label: '🏆 Classement détaillé' },
                { key: 'prompt_contenu', label: '🎓 Contenu expert' },
                { key: 'prompt_faq', label: '❓ FAQ' },
              ].map(({ key, label, perLine }) => (
                <div key={key} style={{ marginBottom: 16, background: '#0A0E1A', borderRadius: 8, padding: 12, border: '1px solid #1E2D3D' }}>
                  <label style={{ fontSize: 11, color: '#8B9CB0', display: 'block', marginBottom: 6, fontWeight: 600 }}>
                    {label}{perLine && <span style={{ color: '#00D4AA', marginLeft: 6, fontSize: 10 }}>intervalle par ligne</span>}
                  </label>
                  <textarea
                    value={defaultPrompts[key]?.text || ''}
                    onChange={e => setDefaultPrompts(prev => ({ ...prev, [key]: { ...prev[key], text: e.target.value } }))}
                    rows={3}
                    placeholder={`Prompt par défaut pour ${label}...`}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit', boxSizing: 'border-box' as const, marginBottom: 8 }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#8B9CB0' }}>Nb mots{perLine ? ' / ligne' : ''} :</span>
                    <input
                      type="number"
                      value={defaultPrompts[key]?.words_min ?? ''}
                      onChange={e => setDefaultPrompts(prev => ({ ...prev, [key]: { ...prev[key], words_min: parseInt(e.target.value) || 0 } }))}
                      placeholder="min"
                      style={{ width: 60, padding: '4px 8px', borderRadius: 6, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none', textAlign: 'center' as const }}
                    />
                    <span style={{ color: '#8B9CB0', fontSize: 12 }}>→</span>
                    <input
                      type="number"
                      value={defaultPrompts[key]?.words_max ?? ''}
                      onChange={e => setDefaultPrompts(prev => ({ ...prev, [key]: { ...prev[key], words_max: parseInt(e.target.value) || 0 } }))}
                      placeholder="max"
                      style={{ width: 60, padding: '4px 8px', borderRadius: 6, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none', textAlign: 'center' as const }}
                    />
                    <span style={{ fontSize: 11, color: '#8B9CB0' }}>mots</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ╔═════ ONGLET CLASSEMENT (contenu existant) ════════════════ */}
        {tab === 'classement' && (
          <div style={{ display: 'flex', gap: 16 }}>
            {/* Sidebar types */}
            <div style={{ width: 220, flexShrink: 0, background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #1E2D3D', fontSize: 11, color: '#8B9CB0', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Types</div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {(() => {
                  const grouped: Record<string, string[]> = {}
                  const uncategorized: string[] = []
                  Object.keys(keywords).forEach(type => {
                    const cat = keywords[type]?.__categorie || ''
                    if (cat) {
                      if (!grouped[cat]) grouped[cat] = []
                      grouped[cat].push(type)
                    } else {
                      uncategorized.push(type)
                    }
                  })
                  if (uncategorized.length > 0) grouped['Autres'] = uncategorized
                  return Object.entries(grouped).map(([cat, types]) => (
                    <div key={cat}>
                      <div onClick={() => setCollapsedCategories(p => ({ ...p, [cat]: !p[cat] }))}
                        style={{ padding: '8px 14px', background: '#0D1117', borderBottom: '1px solid #1E2D3D', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#9F7AEA', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{cat}</span>
                        <span style={{ color: '#4A5568', fontSize: 10 }}>{collapsedCategories[cat] ? '▶' : '▼'}</span>
                      </div>
                      {!collapsedCategories[cat] && types.map(type => (
                        <div key={type} onClick={() => setSelectedGroup(type)} style={{
                          padding: '9px 14px 9px 20px', cursor: 'pointer', fontSize: 12,
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
                    </div>
                  ))
                })()}
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
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none', marginBottom: 8, boxSizing: 'border-box' as const }} />
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
            <div style={{ flex: 1, background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'auto' }}>
              {!selectedGroup ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#4A5568' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🏷</div>
                  <div>Sélectionnez ou créez un type de logiciel</div>
                </div>
              ) : (
                <div style={{ padding: 24 }}>
                  <h3 style={{ color: '#00D4AA', margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>{selectedGroup}</h3>

                  {/* Catégorie parente */}
                  <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 10 }}>Catégorie parente</div>
                    <select value={schema.keywords[selectedGroup]?.__categorie || ''}
                      onChange={e => { const val = e.target.value; setSchema((prev: any) => ({ ...prev, keywords: { ...prev.keywords, [selectedGroup]: { ...prev.keywords[selectedGroup], __categorie: val } } })); if (val && !availableCategories.includes(val)) setAvailableCategories(prev => [...prev, val]) }}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: schema.keywords[selectedGroup]?.__categorie ? '#fff' : '#4A5568', fontSize: 13, outline: 'none', marginBottom: 8 }}>
                      <option value=''>— Sans catégorie —</option>
                      {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="Nouvelle catégorie..."
                        onKeyDown={e => { if (e.key === 'Enter' && newCategoryName.trim()) { const cat = newCategoryName.trim(); if (!availableCategories.includes(cat)) setAvailableCategories(prev => [...prev, cat]); setSchema((prev: any) => ({ ...prev, keywords: { ...prev.keywords, [selectedGroup]: { ...prev.keywords[selectedGroup], __categorie: cat } } })); setNewCategoryName('') } }}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none' }} />
                      <button onClick={() => { if (!newCategoryName.trim()) return; const cat = newCategoryName.trim(); if (!availableCategories.includes(cat)) setAvailableCategories(prev => [...prev, cat]); setSchema((prev: any) => ({ ...prev, keywords: { ...prev.keywords, [selectedGroup]: { ...prev.keywords[selectedGroup], __categorie: cat } } })); setNewCategoryName('') }}
                        style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#1E2D3D', color: '#00D4AA', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>+ Créer</button>
                    </div>
                  </div>

                  {/* Sheet URL + Sync */}
                  <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 10, padding: 16, marginBottom: 24 }}>
                    <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 8 }}>Google Sheet — Produits</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input value={schema.keywords[selectedGroup]?.__sheet_url || ''}
                        onChange={e => setSchema((prev: any) => ({ ...prev, keywords: { ...prev.keywords, [selectedGroup]: { ...prev.keywords[selectedGroup], __sheet_url: e.target.value } } }))}
                        placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                        style={{ flex: 1, padding: '9px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none' }} />
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

                    {schema.keywords[selectedGroup]?.__products?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 12 }}>
                          {schema.keywords[selectedGroup].__products.length} produits · Images
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                          {schema.keywords[selectedGroup].__products.map((p: any) => {
                            const logoKey = `${p.slug}-logo`
                            const screenshotKey = `${p.slug}-screenshot`
                            const logoPath = loadedImages[`${p.slug}-logo`] || null
                            const screenshotPath = loadedImages[`${p.slug}-screenshot`] || null
                            return (
                              <div key={p.slug} style={{ background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{ width: 140, flexShrink: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{p.nom}</div>
                                  <div style={{ fontSize: 11, color: '#4A5568' }}>{p.slug}</div>
                                </div>
                                <div style={{ flexShrink: 0 }}>
                                  <div style={{ fontSize: 10, color: '#4A5568', marginBottom: 4 }}>LOGO</div>
                                  <div onClick={() => triggerUpload(p.slug, 'logo')} style={{
                                    width: 48, height: 48, borderRadius: 8, border: '1px dashed #1E2D3D',
                                    background: '#0D1117', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', overflow: 'hidden', position: 'relative' as const,
                                    transition: 'border-color .15s'
                                  }}
                                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#00D4AA')}
                                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#1E2D3D')}>
                                    {uploadingImg[logoKey] ? <span style={{ fontSize: 16 }}>⏳</span> : logoPath ? <img src={logoPath} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 18, opacity: .4 }}>🖼</span>}
                                  </div>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 10, color: '#4A5568', marginBottom: 4 }}>APERÇU DU SITE</div>
                                  <div onClick={() => triggerUpload(p.slug, 'screenshot')} style={{
                                    height: 60, borderRadius: 8, border: '1px dashed #1E2D3D',
                                    background: '#0D1117', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', overflow: 'hidden', transition: 'border-color .15s'
                                  }}
                                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#00D4AA')}
                                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#1E2D3D')}>
                                    {uploadingImg[screenshotKey] ? <span style={{ color: '#8B9CB0', fontSize: 13 }}>⏳ Upload...</span> : screenshotPath ? <img src={screenshotPath} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#4A5568', fontSize: 12 }}>📸 Cliquez pour uploader un aperçu</span>}
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
        )}

        {/* ╔═════ ONGLET AVIS (nouveau) ══════════════════════════════ */}
        {tab === 'avis' && (
          <div>
            <div style={{ marginBottom: 6, color: '#fff', fontWeight: 600, fontSize: 14 }}>Structure et limites des pages d'avis</div>
            <p style={{ color: '#8B9CB0', fontSize: 12, marginTop: 0, marginBottom: 18, lineHeight: 1.5 }}>
              Pour chaque section d'une page d'avis, définis un nombre maximum de mots. La valeur est envoyée à Claude au moment de la génération (et de la régénération via le dashboard).
              Tu peux aussi ajouter un prompt complémentaire pour orienter le ton ou le contenu d'une section précise.
            </p>
            {Object.entries(DEFAULT_AVIS_CONFIG).map(([key, def]) => (
              <SectionConfigCard
                key={key}
                label={def.label}
                description={def.description}
                words_min={avisConfig[key]?.words_min ?? def.words_min_default}
                words_max={avisConfig[key]?.words_max ?? def.words_max_default}
                prompt={avisConfig[key]?.prompt ?? ''}
                onChangeWordsMin={(n) => setAvisConfig(prev => ({ ...prev, [key]: { words_min: n, words_max: prev[key]?.words_max ?? def.words_max_default, prompt: prev[key]?.prompt ?? '' } }))}
                onChangeWordsMax={(n) => setAvisConfig(prev => ({ ...prev, [key]: { words_min: prev[key]?.words_min ?? def.words_min_default, words_max: n, prompt: prev[key]?.prompt ?? '' } }))}
                onChangePrompt={(s) => setAvisConfig(prev => ({ ...prev, [key]: { words_min: prev[key]?.words_min ?? def.words_min_default, words_max: prev[key]?.words_max ?? def.words_max_default, prompt: s } }))}
              />
            ))}
          </div>
        )}

        {/* ╔═════ ONGLET BLOG (nouveau) ══════════════════════════════ */}
        {tab === 'blog' && (
          <div>
            <div style={{ marginBottom: 6, color: '#fff', fontWeight: 600, fontSize: 14 }}>Structure et limites des articles de blog</div>
            <p style={{ color: '#8B9CB0', fontSize: 12, marginTop: 0, marginBottom: 18, lineHeight: 1.5 }}>
              Comme pour les avis, ces limites de mots sont envoyées à Claude au moment de générer un article de blog. Les prompts complémentaires permettent d'ajuster section par section.
            </p>
            {Object.entries(DEFAULT_BLOG_CONFIG).map(([key, def]) => (
              <SectionConfigCard
                key={key}
                label={def.label}
                description={def.description}
                words_min={blogConfig[key]?.words_min ?? def.words_min_default}
                words_max={blogConfig[key]?.words_max ?? def.words_max_default}
                prompt={blogConfig[key]?.prompt ?? ''}
                onChangeWordsMin={(n) => setBlogConfig(prev => ({ ...prev, [key]: { words_min: n, words_max: prev[key]?.words_max ?? def.words_max_default, prompt: prev[key]?.prompt ?? '' } }))}
                onChangeWordsMax={(n) => setBlogConfig(prev => ({ ...prev, [key]: { words_min: prev[key]?.words_min ?? def.words_min_default, words_max: n, prompt: prev[key]?.prompt ?? '' } }))}
                onChangePrompt={(s) => setBlogConfig(prev => ({ ...prev, [key]: { words_min: prev[key]?.words_min ?? def.words_min_default, words_max: prev[key]?.words_max ?? def.words_max_default, prompt: s } }))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
