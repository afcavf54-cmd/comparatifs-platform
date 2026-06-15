'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { slugify, addRandomPrefix, mdToHtml } from '../../../../../../lib/blog'
import RichEditor from '../../../../../../components/RichEditor'

interface PostData {
  title: string
  slug: string
  date: string
  categorie: string                    // PRINCIPALE — calculée automatiquement = categories[0] au save
  categories: string[]                 // LISTE — source de vérité côté UI (multi-select chips)
  meta_title: string
  meta_description: string
  featured_image: string
  status: string
  content_md: string
  min_words?: number
  related_posts?: string[]
  link_anchors?: { text: string; max: number }[]
  sha?: string
}

const empty: PostData = {
  title: '', slug: '', date: '',
  categorie: '', categories: [],
  meta_title: '', meta_description: '', featured_image: '',
  status: 'draft', content_md: '',
  min_words: 750,
  link_anchors: [],
}

export default function BlogEditPage() {
  const { siteId, postSlug } = useParams() as { siteId: string; postSlug: string }
  const router = useRouter()
  const isNew = postSlug === 'new'

  const [post, setPost] = useState<PostData>(empty)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [existingCategories, setExistingCategories] = useState<string[]>([])
  const [catInput, setCatInput] = useState('')          // saisie en cours dans le chips-input
  const [generating, setGenerating] = useState(false)
  const [showGenModal, setShowGenModal] = useState(false)
  const [genPromptCustom, setGenPromptCustom] = useState('')
  const [genMinWords, setGenMinWords] = useState(750)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('09:00')
  const [uploadingFeatured, setUploadingFeatured] = useState(false)
  const [anchorsText, setAnchorsText] = useState('')
  const [publicUrl, setPublicUrl] = useState('')

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const featuredInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (isNew) return
    fetch(`/api/sites/${siteId}/blog/${postSlug}`)
      .then(r => r.json())
      .then(data => {
        if (data.post) {
          let content = data.post.content_md || ''
          if (content && !/<(p|h[1-6]|ul|ol|div|img|blockquote)\b/i.test(content)) {
            content = mdToHtml(content)
          }
          // Backward-compat : si le backend renvoie déjà categories[] (nouveau format
          // ou legacy reconstruit côté API), on l'utilise. Sinon on tombe sur [categorie].
          const cats: string[] = Array.isArray(data.post.categories) && data.post.categories.length > 0
            ? data.post.categories.filter((c: any) => typeof c === 'string' && c.trim()).map((c: string) => c.trim())
            : (data.post.categorie ? [data.post.categorie] : [])
          setPost({
            ...empty,
            ...data.post,
            content_md: content,
            categories: cats,
            categorie: cats[0] || '',
          })
          if (data.site?.domain && data.post.slug) {
            const dom = data.site.domain.replace(/\/$/, '')
            setPublicUrl(`${dom}/${data.post.slug}`)
          }
          if (data.post.min_words && Number(data.post.min_words) > 0) {
            setGenMinWords(Number(data.post.min_words))
          }
          if (Array.isArray(data.post.link_anchors)) {
            setAnchorsText(
              data.post.link_anchors
                .filter((a: any) => a?.text && Number(a.max) > 0)
                .map((a: any) => `${a.text}:${a.max}`)
                .join('\n')
            )
          }
        }
      })
      .finally(() => setLoading(false))
  }, [siteId, postSlug, isNew])

  // Récupère les catégories existantes pour l'autocomplete du multi-select.
  // On accumule à la fois `p.categorie` (string legacy) ET `p.categories[]` (nouveau)
  // pour que l'autocomplete remonte toutes les catégories déjà utilisées sur le site.
  useEffect(() => {
    fetch(`/api/sites/${siteId}/blog`)
      .then(r => r.json())
      .then(data => {
        const cats = new Set<string>()
        for (const p of data.posts || []) {
          if (p.categorie) cats.add(p.categorie)
          if (Array.isArray(p.categories)) {
            for (const c of p.categories) if (typeof c === 'string' && c.trim()) cats.add(c.trim())
          }
        }
        setExistingCategories(Array.from(cats).sort((a, b) => a.localeCompare(b, 'fr')))
      })
      .catch(() => { /* silencieux */ })
  }, [siteId])

  // Auto-derive slug from title for new posts
  useEffect(() => {
    if (!isNew) return
    if (post.title && !post.slug.replace(/^\d{3,5}-/, '')) {
      setPost(p => ({ ...p, slug: addRandomPrefix(slugify(p.title)) }))
    }
  }, [post.title, isNew])

  function update<K extends keyof PostData>(key: K, val: PostData[K]) {
    setPost(p => ({ ...p, [key]: val }))
  }

  // ─── Helpers multi-catégories ───────────────────────────────────────────
  function addCategory(name: string) {
    const trimmed = (name || '').trim()
    if (!trimmed) { setCatInput(''); return }
    if (post.categories.includes(trimmed)) { setCatInput(''); return }
    setPost(p => {
      const next = [...p.categories, trimmed]
      return { ...p, categories: next, categorie: next[0] }
    })
    setCatInput('')
  }
  function removeCategory(idx: number) {
    setPost(p => {
      const next = p.categories.filter((_, i) => i !== idx)
      return { ...p, categories: next, categorie: next[0] || '' }
    })
  }
  function moveCategoryUp(idx: number) {
    if (idx === 0) return
    setPost(p => {
      const next = [...p.categories]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return { ...p, categories: next, categorie: next[0] }
    })
  }
  function makeCategoryPrincipal(idx: number) {
    if (idx === 0) return
    setPost(p => {
      const next = [...p.categories]
      const [removed] = next.splice(idx, 1)
      next.unshift(removed)
      return { ...p, categories: next, categorie: next[0] }
    })
  }

  async function save(newStatus?: string) {
    if (!post.title.trim()) { setMsg('Le titre est obligatoire'); return }
    if (post.categories.length === 0) { setMsg('Au moins une catégorie est obligatoire'); return }
    setSaving(true); setMsg('')

    // ── Auto-génération meta description si vide ─────────────────────────
    let metaDesc = post.meta_description
    if (!metaDesc?.trim() && post.content_md?.trim()) {
      try {
        setMsg('🤖 Génération de la meta description...')
        const r = await fetch(`/api/sites/${siteId}/blog/generate-meta`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: post.title, content_html: post.content_md }),
        })
        const data = await r.json()
        if (r.ok && data.meta_description) {
          metaDesc = data.meta_description
          update('meta_description', metaDesc)
        }
      } catch { /* ignore, on save sans meta */ }
    }

    // Parse le textarea des ancres au format "ancre:nombre" → array
    const link_anchors = anchorsText
      .split(/[\n;]/)
      .map(line => {
        const s = line.trim()
        if (!s) return null
        const m = s.match(/^(.*?)[:\s]\s*(?:x\s*)?(\d+)\s*$/i)
        if (m) {
          const text = m[1].trim().replace(/:$/, '').trim()
          const max = parseInt(m[2], 10)
          if (text && max > 0) return { text, max }
          return null
        }
        return { text: s, max: 1 }
      })
      .filter(Boolean) as { text: string; max: number }[]

    // Invariant envoyé au backend : categorie === categories[0]
    const principalCat = post.categories[0]

    const payload: any = {
      ...post,
      categorie: principalCat,
      categories: post.categories,
      meta_description: metaDesc,
      status: newStatus || post.status,
      date: post.date || new Date().toISOString().replace(/\.\d+Z$/, ''),
      link_anchors,
    }
    if (isNew) {
      const r = await fetch(`/api/sites/${siteId}/blog`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: post.title,
          categorie: principalCat,
          categories: post.categories,
          content_md: post.content_md, meta_title: post.meta_title,
          meta_description: metaDesc, featured_image: post.featured_image,
          status: payload.status,
          min_words: genMinWords,
          link_anchors: payload.link_anchors,
          schedule_date: payload.status === 'scheduled' ? payload.date : undefined,
        }),
      })
      const data = await r.json()
      setSaving(false)
      if (r.ok && data.slug) {
        setMsg('✓ Article créé')
        router.push(`/sites/${siteId}/blog/${data.slug}`)
      } else {
        setMsg(`✗ ${data.error || 'Erreur création'}`)
      }
    } else {
      const r = await fetch(`/api/sites/${siteId}/blog/${postSlug}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await r.json()
      setSaving(false)
      if (r.ok) {
        setMsg('✓ Sauvegardé')
        if (data.slug && data.slug !== postSlug) router.replace(`/sites/${siteId}/blog/${data.slug}`)
        setTimeout(() => setMsg(''), 2500)
      } else {
        setMsg(`✗ ${data.error || 'Erreur sauvegarde'}`)
      }
    }
  }

  async function generateAI() {
    if (!post.title.trim()) { setMsg('Renseigne d\'abord un titre'); return }
    if (post.categories.length === 0) { setMsg('Renseigne d\'abord une catégorie'); return }
    setGenerating(true); setShowGenModal(false); setMsg('🤖 Génération en cours...')
    try {
      const r = await fetch(`/api/sites/${siteId}/blog/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: post.title,
          // On envoie la catégorie principale au générateur IA pour orienter le contenu.
          categorie: post.categories[0],
          categories: post.categories,
          prompt_custom: genPromptCustom,
          min_words: genMinWords,
        }),
      })
      const data = await r.json()
      if (r.ok && data.content_md) {
        let content = data.content_md
        if (content && !/<(p|h[1-6]|ul|ol|div|img|blockquote)\b/i.test(content)) {
          content = mdToHtml(content)
        }
        setPost(p => ({ ...p, content_md: content }))
        setMsg('✓ Contenu généré')
        setTimeout(() => setMsg(''), 3000)
      } else {
        setMsg(`✗ ${data.error || 'Erreur génération IA'}`)
      }
    } catch (e: any) {
      setMsg(`✗ ${e.message}`)
    } finally {
      setGenerating(false)
    }
  }

  async function uploadFeatured(file: File) {
    if (!file) return
    setUploadingFeatured(true); setMsg('📷 Upload featured image...')
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const imgName = `featured-${Date.now() % 100000}.${ext}`
    const slug = post.slug || 'misc'
    const path = `platform/sites/${siteId}/public/blog/${slug}/${imgName}`
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(',')[1])
      r.onerror = reject
      r.readAsDataURL(file)
    })
    const r = await fetch('/api/github/upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content: dataUrl, message: `HUB: Blog featured image ${imgName}` }),
    })
    setUploadingFeatured(false)
    if (!r.ok) { setMsg('✗ Erreur upload'); return }
    update('featured_image', `/blog/${slug}/${imgName}`)
    setMsg('✓ Featured image uploadée')
    setTimeout(() => setMsg(''), 2500)
  }

  async function uploadImage(file: File) {
    if (!file) return
    setMsg('📷 Upload en cours...')
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const imgName = `${slugify(file.name.replace(/\.[^.]+$/, ''))}-${Date.now() % 10000}.${ext}`
    const slug = post.slug || 'misc'
    const path = `platform/sites/${siteId}/public/blog/${slug}/${imgName}`
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(',')[1])
      r.onerror = reject
      r.readAsDataURL(file)
    })
    const r = await fetch('/api/github/upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content: dataUrl, message: `HUB: Blog image ${imgName}` }),
    })
    if (!r.ok) { setMsg('✗ Erreur upload'); return }
    const publicUrl = `/blog/${slug}/${imgName}`
    const alt = file.name.replace(/\.[^.]+$/, '')
    const imgHtml = `<p><img src="${publicUrl}" alt="${alt}" /></p>`
    const editor = document.querySelector('.rich-editor') as HTMLDivElement | null
    if (editor && editor.contains(document.activeElement)) {
      document.execCommand('insertHTML', false, imgHtml)
      editor.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      update('content_md', (post.content_md || '') + imgHtml)
    }
    setMsg('✓ Image insérée')
    setTimeout(() => setMsg(''), 2500)
  }

  function schedulePublish() {
    if (!scheduleDate) { setMsg('Choisis une date'); return }
    const iso = `${scheduleDate}T${scheduleTime || '09:00'}:00`
    setPost(p => ({ ...p, date: iso, status: 'scheduled' }))
    setShowSchedule(false)
    setTimeout(() => save('scheduled'), 100)
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#4A5568' }}>Chargement…</div>

  // Suggestions d'autocomplete : on filtre les catégories déjà sélectionnées
  // et celles qui matchent la saisie courante (case-insensitive).
  const catSuggestions = catInput.trim()
    ? existingCategories.filter(c =>
        !post.categories.includes(c) &&
        c.toLowerCase().includes(catInput.trim().toLowerCase())
      ).slice(0, 8)
    : existingCategories.filter(c => !post.categories.includes(c)).slice(0, 8)

  return (
    <div style={{ padding: '32px 5vw', maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, fontSize: 13 }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Sites</Link>
        <span style={{ color: '#4A5568' }}>›</span>
        <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none' }}>{siteId}</Link>
        <span style={{ color: '#4A5568' }}>›</span>
        <Link href={`/sites/${siteId}/blog`} style={{ color: '#8B9CB0', textDecoration: 'none' }}>Blog</Link>
        <span style={{ color: '#4A5568' }}>›</span>
        <span style={{ color: '#fff' }}>{isNew ? 'Nouvel article' : post.title || postSlug}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 24px', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 600, margin: 0 }}>
          {isNew ? '✨ Nouvel article' : '✏️ Édition'}
        </h1>
        {!isNew && publicUrl && (
          <a href={publicUrl} target="_blank" rel="noopener noreferrer"
            style={{
              padding: '8px 14px', borderRadius: 8,
              background: 'rgba(0,212,170,.1)', color: '#00D4AA',
              border: '1px solid #00D4AA', fontSize: 13, fontWeight: 600,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
            title="Ouvrir l'article publié dans un nouvel onglet">
            🔗 Voir l'article ↗
          </a>
        )}
      </div>

      {/* Méta-infos */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 16 }}>
          <Field label="Titre *">
            <input type="text" value={post.title} onChange={e => update('title', e.target.value)} style={input} />
          </Field>
          {/* ─── Multi-select chips pour les catégories ───────────────── */}
          <Field label={`Catégories * ${post.categories.length > 0 ? `(${post.categories.length})` : ''}`}>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
              padding: 8, minHeight: 44, borderRadius: 8,
              background: '#0A0E1A', border: '1px solid #1E2D3D',
            }}>
              {post.categories.map((cat, idx) => {
                const isPrincipal = idx === 0
                return (
                  <span key={`${cat}-${idx}`} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: isPrincipal ? 'rgba(0,212,170,.18)' : '#1E2D3D',
                    color: isPrincipal ? '#00D4AA' : '#fff',
                    border: isPrincipal ? '1px solid rgba(0,212,170,.4)' : '1px solid transparent',
                    padding: '4px 6px 4px 10px', borderRadius: 20,
                    fontSize: 12, fontWeight: 600,
                  }}>
                    {isPrincipal && (
                      <span title="Catégorie principale (utilisée pour l'URL et le breadcrumb)"
                            style={{ fontSize: 10, marginRight: 2 }}>★</span>
                    )}
                    <span>{cat}</span>
                    {!isPrincipal && (
                      <button type="button" onClick={() => makeCategoryPrincipal(idx)}
                              title="Faire de cette catégorie la principale"
                              style={chipIconBtn}>↑</button>
                    )}
                    <button type="button" onClick={() => removeCategory(idx)}
                            title="Retirer"
                            style={{ ...chipIconBtn, fontSize: 14, lineHeight: 1 }}>×</button>
                  </span>
                )
              })}
              <input
                type="text"
                value={catInput}
                onChange={e => setCatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCategory(catInput)
                  } else if (e.key === 'Backspace' && !catInput && post.categories.length > 0) {
                    removeCategory(post.categories.length - 1)
                  } else if (e.key === ',' || e.key === ';') {
                    e.preventDefault()
                    addCategory(catInput)
                  }
                }}
                placeholder={post.categories.length === 0 ? 'Tape une catégorie + Entrée…' : '+ ajouter…'}
                style={{
                  flex: 1, minWidth: 140,
                  background: 'transparent', border: 'none', outline: 'none',
                  color: '#fff', fontSize: 13, padding: '4px 6px',
                }}
              />
            </div>
            {/* Suggestions d'autocomplete (catégories existantes filtrées) */}
            {catSuggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                <span style={{ fontSize: 10, color: '#4A5568', alignSelf: 'center', marginRight: 4 }}>Suggestions :</span>
                {catSuggestions.map(c => (
                  <button key={c} type="button" onClick={() => addCategory(c)}
                          style={{
                            padding: '3px 10px', borderRadius: 20,
                            background: '#0D1117', border: '1px solid #1E2D3D',
                            color: '#8B9CB0', fontSize: 11, cursor: 'pointer',
                          }}>
                    + {c}
                  </button>
                ))}
              </div>
            )}
            <div style={{ fontSize: 10, color: '#4A5568', marginTop: 6, lineHeight: 1.5 }}>
              ★ = catégorie <strong style={{ color: '#8B9CB0' }}>principale</strong> (utilisée pour l'URL, le breadcrumb et le SEO).
              Clique <span style={{ color: '#8B9CB0' }}>↑</span> sur une chip pour la faire principale.
              Entrée / virgule pour ajouter, Backspace pour retirer la dernière.
            </div>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 0.8fr', gap: 16 }}>
          <Field label="Slug (URL)">
            <input type="text" value={post.slug} onChange={e => update('slug', e.target.value)} style={input} />
          </Field>
          <Field label="Date publication">
            <input type="datetime-local" value={(post.date || '').slice(0, 16)} onChange={e => update('date', e.target.value + ':00')} style={input} />
          </Field>
          <Field label="Statut">
            <select value={post.status} onChange={e => update('status', e.target.value)} style={input}>
              <option value="draft">Brouillon</option>
              <option value="scheduled">Programmé</option>
              <option value="published">Publié</option>
            </select>
          </Field>
          <Field label="Mots min. (IA)">
            <input type="number" min={300} max={3000} step={100}
              value={genMinWords}
              onChange={e => {
                const v = Math.max(300, Math.min(3000, parseInt(e.target.value, 10) || 750))
                setGenMinWords(v)
                update('min_words', v)
              }}
              title="Longueur minimale demandée à l'IA lors de la génération de l'article"
              style={input} />
          </Field>
        </div>
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #1E2D3D' }}>
          <div style={{ fontSize: 11, color: '#8B9CB0', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>SEO</div>
          <Field label="Meta title">
            <input type="text" value={post.meta_title} onChange={e => update('meta_title', e.target.value)} style={input} />
          </Field>
          <div style={{ marginTop: 12 }}>
            <Field label="Meta description">
              <textarea value={post.meta_description} onChange={e => update('meta_description', e.target.value)} rows={2} style={{ ...input, resize: 'vertical' }} />
            </Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#8B9CB0', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Featured image</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input type="text" value={post.featured_image} onChange={e => update('featured_image', e.target.value)}
                placeholder="/blog/<slug>/cover.jpg ou colle une URL"
                style={{ ...input, flex: 1 }} />
              <button type="button" onClick={() => featuredInputRef.current?.click()} disabled={uploadingFeatured}
                style={{ ...btn, background: '#1E2D3D', padding: '0 16px', whiteSpace: 'nowrap' }}>
                {uploadingFeatured ? '⏳' : '📤 Upload'}
              </button>
              <input ref={featuredInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && uploadFeatured(e.target.files[0])} />
            </div>
            {post.featured_image && (
              <div style={{ marginTop: 10, padding: 8, background: '#0A0E1A', borderRadius: 8, border: '1px solid #1E2D3D', maxWidth: 240 }}>
                <img src={post.featured_image.startsWith('http') ? post.featured_image
                  : `https://raw.githubusercontent.com/${process.env.NEXT_PUBLIC_GITHUB_OWNER || 'afcavf54-cmd'}/${process.env.NEXT_PUBLIC_GITHUB_REPO || 'comparatifs-platform'}/main/platform/sites/${siteId}/public${post.featured_image}`}
                  alt="aperçu"
                  style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 140, objectFit: 'cover', borderRadius: 6 }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              </div>
            )}
          </div>
        </div>

        {/* Maillage interne — ancres de lien */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #1E2D3D' }}>
          <div style={{ fontSize: 11, color: '#8B9CB0', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>🔗 Maillage interne — ancres de lien</div>
          <div style={{ fontSize: 12, color: '#4A5568', lineHeight: 1.6, marginBottom: 10 }}>
            Liste des ancres qui, trouvées dans d'autres articles, seront automatiquement transformées en liens vers <strong>cet article</strong>.
            Format : <code style={{ color: '#00D4AA' }}>ancre:nombre_max</code> (une par ligne).
            <br/>Règles automatiques : <strong>1 lien max</strong> par article source, <strong>15 liens entrants max</strong> par article cible.
          </div>
          <textarea value={anchorsText} onChange={e => setAnchorsText(e.target.value)} rows={5}
            placeholder={"pappers:5\nplateforme pappers:5\nle site pappers:3\npappers.fr:1"}
            style={{ ...input, fontFamily: 'Menlo, Monaco, Consolas, monospace', fontSize: 12, resize: 'vertical' }} />
        </div>
      </div>

      {/* Bouton Générer IA au-dessus de l'éditeur */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button onClick={() => setShowGenModal(true)} disabled={generating}
          style={{ ...btn, background: '#00D4AA', color: '#0A0E1A', padding: '10px 18px' }}>
          {generating ? '🤖 Génération…' : '✨ Générer avec IA'}
        </button>
      </div>

      {/* Éditeur WYSIWYG */}
      <div style={{ marginBottom: 24 }}>
        <RichEditor
          value={post.content_md}
          onChange={(html) => update('content_md', html)}
          onImageUpload={() => fileInputRef.current?.click()}
          height={520}
        />
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0])} />
      </div>

      {/* Boutons d'action */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => save()} disabled={saving} style={{ ...btn, background: '#1E2D3D', color: '#fff', padding: '12px 24px' }}>
          {saving ? '⏳ ...' : '💾 Sauvegarder'}
        </button>
        <button onClick={() => save('published')} disabled={saving} style={{ ...btn, background: '#00D4AA', color: '#0A0E1A', padding: '12px 24px' }}>
          🚀 Publier maintenant
        </button>
        <button onClick={() => setShowSchedule(true)} disabled={saving} style={{ ...btn, background: '#F6AD55', color: '#0A0E1A', padding: '12px 24px' }}>
          📅 Programmer
        </button>
        {msg && <span style={{ marginLeft: 8, fontSize: 13, color: msg.startsWith('✗') ? '#FC8181' : '#00D4AA' }}>{msg}</span>}
      </div>

      {/* Modale Génération IA */}
      {showGenModal && (
        <Modal onClose={() => setShowGenModal(false)} title="✨ Générer un article avec IA">
          <div style={{ color: '#E5E7EB', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
            Le titre <strong>"{post.title || '(à renseigner)'}"</strong>
            {post.categories.length > 0 && <> et la catégorie principale <strong>"{post.categories[0]}"</strong></>}
            {post.categories.length > 1 && <> (+ {post.categories.length - 1} autre{post.categories.length - 1 > 1 ? 's' : ''})</>}
            {' '}seront utilisés.
          </div>
          <Field label="Nombre de mots minimum">
            <input type="number" min={300} max={3000} step={100} value={genMinWords}
              onChange={e => setGenMinWords(Math.max(300, parseInt(e.target.value, 10) || 750))}
              style={{ ...input, maxWidth: 160 }} />
          </Field>
          <div style={{ marginTop: 14 }}>
          <Field label="Consignes spécifiques (optionnel)">
            <textarea value={genPromptCustom} onChange={e => setGenPromptCustom(e.target.value)} rows={5}
              placeholder="Ex: Insiste sur les TPE, mets en avant les solutions cloud, ton accessible..."
              style={{ ...input, resize: 'vertical' }} />
          </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button onClick={() => setShowGenModal(false)} style={btn}>Annuler</button>
            <button onClick={generateAI} style={{ ...btn, background: '#00D4AA', color: '#0A0E1A' }}>✨ Générer</button>
          </div>
        </Modal>
      )}

      {/* Modale Programmation */}
      {showSchedule && (
        <Modal onClose={() => setShowSchedule(false)} title="📅 Programmer la publication">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Date"><input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={input} /></Field>
            <Field label="Heure"><input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={input} /></Field>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: '#8B9CB0' }}>
            L'article sera automatiquement publié par le cron horaire à cette date/heure.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button onClick={() => setShowSchedule(false)} style={btn}>Annuler</button>
            <button onClick={schedulePublish} style={{ ...btn, background: '#F6AD55', color: '#0A0E1A' }}>📅 Programmer</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: '#8B9CB0', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 14, padding: 28, maxWidth: 520, width: '90%', maxHeight: '85vh', overflow: 'auto' }}>
        <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: '0 0 18px' }}>{title}</h3>
        {children}
      </div>
    </div>
  )
}

const input: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 }
const btn: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, background: '#1E2D3D', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }
const chipIconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 18, height: 18, padding: 0, borderRadius: '50%',
  background: 'rgba(255,255,255,.08)', border: 'none', color: 'inherit',
  fontSize: 11, fontWeight: 700, cursor: 'pointer', lineHeight: 1,
}
