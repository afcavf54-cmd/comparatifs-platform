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
  categorie: string
  meta_title: string
  meta_description: string
  featured_image: string
  status: string
  content_md: string
  related_posts?: string[]
  link_anchors?: { text: string; max: number }[]
  sha?: string
}

const empty: PostData = {
  title: '', slug: '', date: '', categorie: '',
  meta_title: '', meta_description: '', featured_image: '',
  status: 'draft', content_md: '',
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
  const [generating, setGenerating] = useState(false)
  const [showGenModal, setShowGenModal] = useState(false)
  const [genPromptCustom, setGenPromptCustom] = useState('')
  const [genMinWords, setGenMinWords] = useState(800)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('09:00')
  const [uploadingFeatured, setUploadingFeatured] = useState(false)
  // Texte affiché dans le textarea des ancres (format "ancre:nombre" par ligne)
  // synchronisé avec post.link_anchors (array de {text, max}) au save.
  const [anchorsText, setAnchorsText] = useState('')

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const featuredInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (isNew) return
    fetch(`/api/sites/${siteId}/blog/${postSlug}`)
      .then(r => r.json())
      .then(data => {
        if (data.post) {
          let content = data.post.content_md || ''
          // Si le contenu legacy est en markdown (pas de balises HTML
          // structurelles détectées), on le convertit pour que le RichEditor
          // l'affiche correctement. Les nouveaux articles produits par
          // RichEditor sont déjà en HTML, on les laisse tels quels.
          if (content && !/<(p|h[1-6]|ul|ol|div|img|blockquote)\b/i.test(content)) {
            content = mdToHtml(content)
          }
          setPost({ ...empty, ...data.post, content_md: content })
          // Initialiser le textarea des ancres depuis le frontmatter
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

  // Récupère les catégories existantes (pour le datalist du champ catégorie)
  useEffect(() => {
    fetch(`/api/sites/${siteId}/blog`)
      .then(r => r.json())
      .then(data => {
        const cats = new Set<string>()
        for (const p of data.posts || []) {
          if (p.categorie) cats.add(p.categorie)
        }
        setExistingCategories(Array.from(cats).sort())
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

  async function save(newStatus?: string) {
    if (!post.title.trim()) { setMsg('Le titre est obligatoire'); return }
    if (!post.categorie.trim()) { setMsg('La catégorie est obligatoire'); return }
    setSaving(true); setMsg('')

    // ── Auto-génération meta description si vide ─────────────────────────
    // Si l'utilisateur n'a rien renseigné, on appelle Claude pour générer
    // une meta description courte (~155 caractères) à partir du contenu.
    // Le résultat est injecté dans le state ET utilisé dans le payload.
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

    const payload: any = {
      ...post,
      meta_description: metaDesc,
      status: newStatus || post.status,
      date: post.date || new Date().toISOString().replace(/\.\d+Z$/, ''),
      link_anchors,
    }
    if (isNew) {
      // POST → création
      const r = await fetch(`/api/sites/${siteId}/blog`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: post.title, categorie: post.categorie,
          content_md: post.content_md, meta_title: post.meta_title,
          meta_description: metaDesc, featured_image: post.featured_image,
          status: payload.status,
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
      // PUT → save
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
    if (!post.categorie.trim()) { setMsg('Renseigne d\'abord une catégorie'); return }
    setGenerating(true); setShowGenModal(false); setMsg('🤖 Génération en cours...')
    try {
      const r = await fetch(`/api/sites/${siteId}/blog/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: post.title, categorie: post.categorie, prompt_custom: genPromptCustom, min_words: genMinWords }),
      })
      const data = await r.json()
      if (r.ok && data.content_md) {
        let content = data.content_md
        // Filet de sécurité : si l'IA renvoie du markdown malgré la consigne
        // HTML, on convertit pour que le RichEditor l'affiche correctement.
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
    // Insérer l'image dans l'éditeur : on essaie d'abord d'insérer à la
    // position du curseur (execCommand insertHTML), sinon on append à la fin.
    const publicUrl = `/blog/${slug}/${imgName}`
    const alt = file.name.replace(/\.[^.]+$/, '')
    const imgHtml = `<p><img src="${publicUrl}" alt="${alt}" /></p>`
    const editor = document.querySelector('.rich-editor') as HTMLDivElement | null
    if (editor && editor.contains(document.activeElement)) {
      document.execCommand('insertHTML', false, imgHtml)
      // Trigger input event pour que RichEditor remonte la nouvelle valeur
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

      <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 600, margin: '16px 0 24px' }}>
        {isNew ? '✨ Nouvel article' : '✏️ Édition'}
      </h1>

      {/* Méta-infos */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
          <Field label="Titre *">
            <input type="text" value={post.title} onChange={e => update('title', e.target.value)} style={input} />
          </Field>
          <Field label="Catégorie *">
            <input type="text" list="blog-categories-list" value={post.categorie}
              onChange={e => update('categorie', e.target.value)}
              placeholder="Ex: Paie, Compta..." style={input} />
            <datalist id="blog-categories-list">
              {existingCategories.map(c => <option key={c} value={c} />)}
            </datalist>
            {existingCategories.length > 0 && (
              <div style={{ fontSize: 10, color: '#4A5568', marginTop: 4 }}>
                💡 {existingCategories.length} catégorie{existingCategories.length > 1 ? 's' : ''} existante{existingCategories.length > 1 ? 's' : ''} — clique sur le champ pour voir la liste
              </div>
            )}
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
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
            Le titre <strong>"{post.title || '(à renseigner)'}"</strong>{post.categorie && <> et la catégorie <strong>"{post.categorie}"</strong></>} seront utilisés.
          </div>
          <Field label="Nombre de mots minimum">
            <input type="number" min={300} max={3000} step={100} value={genMinWords}
              onChange={e => setGenMinWords(Math.max(300, parseInt(e.target.value, 10) || 800))}
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
