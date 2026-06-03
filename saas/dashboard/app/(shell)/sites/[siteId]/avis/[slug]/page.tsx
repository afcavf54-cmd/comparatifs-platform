'use client'
import { useEffect, useState, use, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import RichEditor from '../../../../../../components/RichEditor'

// ─── Page d'édition d'un avis ─────────────────────────────────────────────
// URL : /sites/<siteId>/avis/<slug>
//
// Édition WYSIWYG via le composant RichEditor (même que le blog) sur 6
// champs rich-text : intro, en_bref, sections_html, h2_avis_clients.aiment,
// h2_avis_clients.regrettent, verdict. Les autres champs restent en input
// texte simple ou en éditeurs spécialisés (FAQ, tarifs, points, ancres).
//
// L'upload d'image est partagé par les 6 RichEditor via un seul file input
// caché + activeEditorRef qui tracke quel éditeur a déclenché l'upload.
// Les images sont commités dans platform/sites/<siteId>/public/avis/<slug>/
// et insérées soit à la position du curseur (si l'éditeur a le focus),
// soit appendées à la fin du contenu du champ ciblé.

type Tarif = { nom: string; prix: string; features: string }
type FaqItem = { q: string; r: string }
type H2 = {
  titre?: string
  contenu_html?: string
  aiment?: string
  regrettent?: string
}
type LinkAnchor = { phrase: string; count: number }

type Avis = {
  slug?: string
  marque?: string
  categorie?: string
  sentiment?: 'positif' | 'mitige' | 'negatif' | string
  note?: number
  date?: string
  updated?: string
  cible?: string
  intro?: string
  en_bref?: string
  logo_path?: string
  points_forts?: string[]
  points_faibles?: string[]
  tarifs?: Tarif[]
  h2_fonctionnalites?: H2
  h2_support?: H2
  h2_qualite_prix?: H2
  h2_avis_clients?: H2
  faq?: FaqItem[]
  verdict?: string
  meta_title?: string
  meta_description?: string
  cta_url?: string
  cta_label?: string
  note_trustpilot?: number | string
  nb_avis_trustpilot?: number | string
  note_google?: number | string
  nb_avis_google?: number | string
  link_anchors?: LinkAnchor[]
  mot_minimum?: number
  sections_html?: string
  [k: string]: any
}

// Identifiants des 6 champs édités via RichEditor. Utilisés pour router
// l'upload d'image vers le bon champ via activeEditorRef.
type RichField = 'intro' | 'en_bref' | 'sections_html' | 'aiment' | 'regrettent' | 'verdict'

export default function AvisEditPage({ params }: { params: Promise<{ siteId: string; slug: string }> }) {
  const { siteId, slug } = use(params)
  const router = useRouter()
  const [avis, setAvis] = useState<Avis | null>(null)
  const [sha, setSha] = useState<string>('')
  const [domain, setDomain] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [msg, setMsg] = useState<string>('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  // File input caché unique partagé par les 6 RichEditor. Quand un éditeur
  // demande un upload, il set activeEditorRef AVANT de trigger le picker,
  // ce qui permet à uploadImage() de savoir dans quel champ injecter l'URL.
  const imageInputRef = useRef<HTMLInputElement>(null)
  const activeEditorRef = useRef<RichField | null>(null)
  const [promptCustom, setPromptCustom] = useState<string>('')
  const [faqQuestions, setFaqQuestions] = useState<string[]>([])
  const [draftCollapsed, setDraftCollapsed] = useState<boolean>(true)

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/sites/${siteId}/avis/${slug}`)
        if (!r.ok) {
          setMsg(`Erreur chargement (${r.status})`)
          setLoading(false)
          return
        }
        const data = await r.json()
        const a: Avis = data.avis || {}
        a.points_forts = Array.isArray(a.points_forts) ? a.points_forts : []
        a.points_faibles = Array.isArray(a.points_faibles) ? a.points_faibles : []
        a.tarifs = Array.isArray(a.tarifs) ? a.tarifs : []
        a.faq = Array.isArray(a.faq) ? a.faq : []
        a.link_anchors = Array.isArray(a.link_anchors) ? a.link_anchors : []
        for (const k of ['h2_fonctionnalites', 'h2_support', 'h2_qualite_prix', 'h2_avis_clients']) {
          if (!a[k] || typeof a[k] !== 'object') a[k] = { titre: '', contenu_html: '' }
        }
        setAvis(a)
        setSha(data.sha || '')
        setDomain(data.site?.domain || '')
        try {
          const dr = await fetch(`/api/sites/${siteId}/avis/draft/${slug}`)
          if (dr.ok) {
            const dd = await dr.json()
            setPromptCustom((dd?.draft?.prompt_custom || '').toString())
            const fq = Array.isArray(dd?.draft?.faq_questions) ? dd.draft.faq_questions : []
            setFaqQuestions(fq.filter((q: any) => typeof q === 'string'))
            const hasContent = !!(dd?.draft?.prompt_custom || '').trim() || fq.length > 0
            setDraftCollapsed(!hasContent)
          }
        } catch { /* draft inaccessible : on continue */ }
      } catch (e) {
        setMsg('Erreur réseau')
      } finally {
        setLoading(false)
      }
    })()
  }, [siteId, slug])

  const save = async () => {
    if (!avis) return
    setSaving(true)
    setMsg('')
    try {
      const cleanedFaq = faqQuestions.map(q => (q || '').trim()).filter(q => q.length > 0)
      const [r, dr] = await Promise.all([
        fetch(`/api/sites/${siteId}/avis/${slug}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avis, body: '', sha }),
        }),
        fetch(`/api/sites/${siteId}/avis/draft/${slug}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt_custom: promptCustom, faq_questions: cleanedFaq }),
        }),
      ])
      const data = await r.json()
      if (!r.ok) {
        setMsg(`Erreur frontmatter : ${data.error || r.status}`)
      } else if (!dr.ok) {
        setMsg("✓ Frontmatter sauvegardé (brouillon non persisté — vérifier l'API draft)")
        const fresh = await fetch(`/api/sites/${siteId}/avis/${slug}`).then(r => r.json())
        setSha(fresh.sha || '')
        setTimeout(() => setMsg(''), 4500)
      } else {
        setMsg('✓ Sauvegardé (frontmatter + brouillon)')
        const fresh = await fetch(`/api/sites/${siteId}/avis/${slug}`).then(r => r.json())
        setSha(fresh.sha || '')
        setTimeout(() => setMsg(''), 3000)
      }
    } catch (e) {
      setMsg('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  const uploadLogo = async (file: File) => {
    if (!file || !slug) return
    setUploadingLogo(true)
    setMsg('📷 Upload du logo en cours...')
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const imgName = `logo-${Date.now() % 100000}.${ext}`
    const ghPath = `platform/sites/${siteId}/public/avis/${slug}/${imgName}`
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result).split(',')[1])
        r.onerror = reject
        r.readAsDataURL(file)
      })
      const r = await fetch('/api/github/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: ghPath,
          content: dataUrl,
          message: `HUB: Avis logo for ${slug}`,
        }),
      })
      if (!r.ok) {
        setMsg('✗ Erreur upload logo')
        return
      }
      setAvis((prev) => prev ? { ...prev, logo_path: `/avis/${slug}/${imgName}` } : prev)
      setMsg('✓ Logo uploadé — pense à enregistrer pour persister')
      setTimeout(() => setMsg(''), 3500)
    } catch {
      setMsg('✗ Erreur upload')
    } finally {
      setUploadingLogo(false)
    }
  }

  // ── Upload image inline dans un RichEditor ──────────────────────────
  // L'éditeur appelant a set activeEditorRef.current via son `onImageUpload`.
  // Si un .rich-editor a le focus on insère à la position du curseur via
  // execCommand insertHTML, sinon on append au state du champ ciblé.
  const uploadImage = async (file: File) => {
    if (!file || !slug) return
    const field = activeEditorRef.current
    if (!field) return
    setUploadingImage(true)
    setMsg("📷 Upload de l'image en cours...")
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const baseName = (file.name.replace(/\.[^.]+$/, '') || 'image')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image'
    const imgName = `${baseName}-${Date.now() % 100000}.${ext}`
    const ghPath = `platform/sites/${siteId}/public/avis/${slug}/${imgName}`
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result).split(',')[1])
        r.onerror = reject
        r.readAsDataURL(file)
      })
      const r = await fetch('/api/github/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: ghPath,
          content: dataUrl,
          message: `HUB: Avis image for ${slug} (${field})`,
        }),
      })
      if (!r.ok) {
        setMsg('✗ Erreur upload image')
        return
      }
      const publicUrl = `/avis/${slug}/${imgName}`
      const alt = file.name.replace(/\.[^.]+$/, '')
      const imgHtml = `<p><img src="${publicUrl}" alt="${alt}" /></p>`

      const focusedEditor = document.activeElement?.closest('.rich-editor') as HTMLDivElement | null
      if (focusedEditor) {
        document.execCommand('insertHTML', false, imgHtml)
        focusedEditor.dispatchEvent(new Event('input', { bubbles: true }))
      } else {
        if (field === 'intro') {
          upd({ intro: (avis?.intro || '') + imgHtml })
        } else if (field === 'en_bref') {
          upd({ en_bref: (avis?.en_bref || '') + imgHtml })
        } else if (field === 'sections_html') {
          upd({ sections_html: (avis?.sections_html || '') + imgHtml })
        } else if (field === 'verdict') {
          upd({ verdict: (avis?.verdict || '') + imgHtml })
        } else if (field === 'aiment') {
          updH2('h2_avis_clients', { aiment: (avis?.h2_avis_clients?.aiment || '') + imgHtml })
        } else if (field === 'regrettent') {
          updH2('h2_avis_clients', { regrettent: (avis?.h2_avis_clients?.regrettent || '') + imgHtml })
        }
      }
      setMsg('✓ Image insérée — pense à enregistrer')
      setTimeout(() => setMsg(''), 3500)
    } catch {
      setMsg('✗ Erreur upload')
    } finally {
      setUploadingImage(false)
      activeEditorRef.current = null
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  const regenerate = async () => {
    if (!avis?.marque) {
      setMsg('Marque manquante, impossible de lancer la régénération')
      return
    }

    if (!confirm(
      `Régénérer tout le contenu IA pour "${avis.marque}" ?\n\n` +
      `• Texte IA RÉÉCRIT : intro, en bref, points forts/faibles, sections H2/H3 custom, ` +
      `réponses FAQ, verdict, meta\n` +
      `• Tes éditions manuelles sur ces champs seront PERDUES\n` +
      `• Préservés : marque, catégorie, note, CTA, tarifs, questions FAQ (= ce qui vient de la sheet/brouillon)\n\n` +
      `Le brouillon (_drafts.json) sera utilisé pour le prompt custom + persona.\n` +
      `Durée totale : ~3 minutes (workflow GitHub + redéploiement CF Pages).`
    )) return

    setRegenerating(true)
    setMsg('')
    try {
      try {
        const draftRes = await fetch(`/api/sites/${siteId}/avis/draft/${slug}`)
        const draftData = await draftRes.json()
        const hasPrompt = !!((draftData?.draft?.prompt_custom || '').trim())
        if (!hasPrompt) {
          if (!confirm(
            `⚠ Aucun prompt custom détecté pour ${avis.marque} dans le brouillon.\n\n` +
            `La régénération utilisera le format standard (3 H2 génériques) au lieu de ta structure custom H2/H3.\n\n` +
            `Continuer quand même ? (Sinon, va d'abord créer un brouillon via /avis → Éditer le brouillon)`
          )) {
            setRegenerating(false)
            return
          }
        }
      } catch { /* draft inaccessible : on continue */ }

      const r = await fetch(`/api/sites/${siteId}/avis/publish-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marques: [avis.marque] }),
      })
      const d = await r.json()
      if (d.ok) {
        setMsg('✓ Régénération lancée. Workflow GitHub en cours (~3 min). Redirection vers la liste des avis...')
        setTimeout(() => router.push(`/sites/${siteId}/avis`), 3500)
      } else {
        setMsg('✗ ' + (d.error || 'Erreur lancement workflow'))
        setRegenerating(false)
      }
    } catch (e: any) {
      setMsg('Erreur réseau : ' + (e?.message || e))
      setRegenerating(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Supprimer définitivement l'avis "${avis?.marque}" ? Cette action est irréversible.`)) return
    const r = await fetch(`/api/sites/${siteId}/avis/${slug}`, { method: 'DELETE' })
    if (r.ok) {
      router.push(`/sites/${siteId}/avis`)
    } else {
      setMsg('Erreur suppression')
    }
  }

  const upd = (patch: Partial<Avis>) => setAvis(prev => prev ? { ...prev, ...patch } : prev)
  const updH2 = (key: 'h2_fonctionnalites' | 'h2_support' | 'h2_qualite_prix' | 'h2_avis_clients', patch: Partial<H2>) =>
    setAvis(prev => prev ? { ...prev, [key]: { ...(prev[key] || { titre: '', contenu_html: '' }), ...patch } } : prev)

  // Helper : tracke l'éditeur actif puis ouvre le picker
  const triggerImagePicker = (field: RichField) => {
    activeEditorRef.current = field
    imageInputRef.current?.click()
  }

  if (loading) return <div style={{ padding: 24 }}>Chargement…</div>
  if (!avis) return <div style={{ padding: 24, color: 'crimson' }}>{msg || 'Avis introuvable'}</div>

  const hasSectionsHtml = !!(avis.sections_html && avis.sections_html.trim())

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }
  const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }
  const sectionStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: 20, marginBottom: 20 }
  const h2Style: React.CSSProperties = { margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#222' }

  const busy = saving || regenerating

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href={`/sites/${siteId}/avis`} style={{ fontSize: 14, color: '#666', textDecoration: 'none' }}>← Retour aux avis</Link>
        <h1 style={{ flex: 1, margin: 0, fontSize: 22, fontWeight: 600 }}>Édition : {avis.marque || slug}</h1>
        {domain && (
          <a href={`https://${domain.replace(/^https?:\/\//, '')}/${slug}`} target="_blank" rel="noreferrer"
             style={{ fontSize: 13, color: '#0066cc', textDecoration: 'none' }}>
            👁 Voir en ligne ↗
          </a>
        )}
      </div>

      <div style={{ ...sectionStyle, background: '#FAF7FF', border: '1px solid #D6C8F0' }}>
        <div
          onClick={() => setDraftCollapsed(c => !c)}
          style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
        >
          <div>
            <h2 style={{ ...h2Style, marginBottom: 4 }}>🤖 Configuration de la génération IA</h2>
            <div style={{ fontSize: 12, color: '#666', lineHeight: 1.4 }}>
              Prompt qui impose la structure H2 + questions FAQ — utilisés à chaque <strong>🔄 Régénération</strong>.
              {(promptCustom.trim() || faqQuestions.length > 0) && (
                <span style={{ marginLeft: 6, color: '#7C3AED', fontWeight: 600 }}>
                  ({promptCustom.trim() ? `${promptCustom.length} car. de prompt` : 'sans prompt'}
                  {faqQuestions.length > 0 ? `, ${faqQuestions.length} question(s) FAQ` : ''})
                </span>
              )}
            </div>
          </div>
          <span style={{ fontSize: 20, color: '#7C3AED', transform: draftCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform .15s' }}>▶</span>
        </div>
        {!draftCollapsed && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                Prompt de structure (sections H2 du corps de l'avis)
              </label>
              <textarea
                value={promptCustom}
                onChange={e => setPromptCustom(e.target.value)}
                rows={10}
                placeholder={`Ex: Génère exactement 4 sections H2 dans cet ordre :\n1. "Présentation de la marque et son positionnement"\n2. "Fonctionnalités principales et points forts"\n...`}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: '#fff', border: '1px solid #D6C8F0',
                  color: '#222', fontSize: 13, outline: 'none',
                  resize: 'vertical' as const, fontFamily: 'ui-monospace, monospace',
                  boxSizing: 'border-box' as const, lineHeight: 1.6,
                }}
              />
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                Ce prompt est envoyé tel quel à Claude lors du 2e appel pour générer le bloc <code>sections_html</code>.
                Vide = Claude génère librement (h2_fonctionnalites + h2_support + h2_qualite_prix).
              </div>
            </div>
            <div>
              <label style={labelStyle}>
                Questions FAQ imposées <span style={{ textTransform: 'none', color: '#888', fontWeight: 400 }}>— Claude génère seulement les réponses</span>
              </label>
              {faqQuestions.length === 0 && (
                <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginBottom: 8 }}>
                  Aucune question imposée. Claude inventera 4 questions par défaut lors de la régénération.
                </div>
              )}
              {faqQuestions.map((q, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input
                    value={q}
                    onChange={e => {
                      const next = [...faqQuestions]
                      next[i] = e.target.value
                      setFaqQuestions(next)
                    }}
                    placeholder={`Question ${i + 1}`}
                    style={{ ...inputStyle, flex: 1, background: '#fff', borderColor: '#D6C8F0' }}
                  />
                  <button
                    type="button"
                    onClick={() => setFaqQuestions(faqQuestions.filter((_, j) => j !== i))}
                    style={{
                      padding: '6px 10px', borderRadius: 6, border: '1px solid #D6C8F0',
                      background: '#fff', color: '#FC8181', cursor: 'pointer', fontSize: 14,
                    }}
                  >×</button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setFaqQuestions([...faqQuestions, ''])}
                style={{
                  padding: '6px 12px', borderRadius: 6, border: '1px dashed #D6C8F0',
                  background: 'transparent', color: '#7C3AED', cursor: 'pointer', fontSize: 13,
                }}
              >+ Ajouter une question</button>
            </div>
          </div>
        )}
      </div>

      <div style={sectionStyle}>
        <h2 style={h2Style}>Informations</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Marque</label>
            <input style={inputStyle} value={avis.marque || ''} onChange={e => upd({ marque: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Catégorie</label>
            <input style={inputStyle} value={avis.categorie || ''} onChange={e => upd({ categorie: e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Sentiment</label>
            <select style={inputStyle} value={avis.sentiment || 'positif'} onChange={e => upd({ sentiment: e.target.value })}>
              <option value="positif">Positif</option>
              <option value="mitige">Mitigé</option>
              <option value="negatif">Négatif</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Note (/5)</label>
            <input style={inputStyle} type="number" min="0" max="5" step="0.5" value={avis.note ?? 0}
                   onChange={e => upd({ note: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label style={labelStyle}>Mot minimum</label>
            <input style={inputStyle} type="number" min="0" step="50" value={avis.mot_minimum ?? 800}
                   onChange={e => upd({ mot_minimum: parseInt(e.target.value) || 800 })} />
          </div>
        </div>
      </div>

      {/* ── HERO (H1 + INTRO + EN BREF + LOGO) ─────────────────────── */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Hero (titre + intro + résumé)</h2>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Titre H1</label>
          <input style={inputStyle} value={avis.h1 || ''} onChange={e => upd({ h1: e.target.value })}
                 placeholder={`Avis ${avis.marque || 'Marque'} (2026) : ...`} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>
            Intro <span style={{ textTransform: 'none', color: '#888', fontWeight: 400 }}>— paragraphe d'introduction sous le H1</span>
          </label>
          <RichEditor
            value={avis.intro || ''}
            onChange={(html) => upd({ intro: html })}
            onImageUpload={() => triggerImagePicker('intro')}
            placeholder="Paragraphe d'accroche éditoriale qui pose le contexte. Différent du résumé « En bref »."
            height={220}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>
            Résumé « En bref » <span style={{ textTransform: 'none', color: '#888', fontWeight: 400 }}>— affiché à côté du logo</span>
          </label>
          <RichEditor
            value={avis.en_bref || ''}
            onChange={(html) => upd({ en_bref: html })}
            onImageUpload={() => triggerImagePicker('en_bref')}
            placeholder="Synthèse de l'avis en ~50 mots : verdict, points clés, pour qui c'est."
            height={200}
          />
        </div>

        <div>
          <label style={labelStyle}>
            Logo de la marque <span style={{ textTransform: 'none', color: '#888', fontWeight: 400 }}>— affiché à gauche du résumé « En bref »</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={avis.logo_path || ''}
              onChange={e => upd({ logo_path: e.target.value })}
              placeholder={`/avis/${slug || 'votre-slug'}/logo.png — ou laisse vide pour uploader ci-contre`}
            />
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid #1E2D3D',
                background: uploadingLogo ? '#1E2D3D' : '#0D1117',
                color: uploadingLogo ? '#888' : '#00D4AA',
                cursor: uploadingLogo ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {uploadingLogo ? '⏳ Upload...' : '📤 Upload'}
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])}
            />
          </div>
          {avis.logo_path && (
            <div style={{
              marginTop: 10,
              display: 'inline-flex', alignItems: 'center', gap: 12,
              padding: 12, borderRadius: 10, border: '1px solid #1E2D3D', background: '#0A0E1A'
            }}>
              <img
                src={
                  avis.logo_path.startsWith('http')
                    ? avis.logo_path
                    : `https://raw.githubusercontent.com/afcavf54-cmd/comparatifs-platform/main/platform/sites/${siteId}/public${avis.logo_path}`
                }
                alt={`Logo ${avis.marque || ''}`}
                style={{ width: 56, height: 56, objectFit: 'contain', background: '#fff', borderRadius: 8 }}
              />
              <div style={{ fontSize: 12, color: '#888' }}>Aperçu — pense à <strong style={{ color: '#fff' }}>enregistrer</strong> pour persister.</div>
            </div>
          )}
        </div>
      </div>

      <div style={sectionStyle}>
        <h2 style={h2Style}>Points forts et faibles</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <ListEditor label="Points forts" items={avis.points_forts || []} onChange={v => upd({ points_forts: v })} />
          <ListEditor label="Points faibles" items={avis.points_faibles || []} onChange={v => upd({ points_faibles: v })} />
        </div>
      </div>

      <div style={sectionStyle}>
        <h2 style={h2Style}>Tarifs et offres</h2>
        <TarifsEditor tarifs={avis.tarifs || []} onChange={v => upd({ tarifs: v })} />
      </div>

      {hasSectionsHtml && (
        <div style={sectionStyle}>
          <h2 style={h2Style}>
            Sections custom (HTML libre)
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: '#3D7A4F' }}>
              ✓ Actif — remplace les 3 H2 standards ci-dessous
            </span>
          </h2>
          <label style={labelStyle}>Contenu</label>
          <RichEditor
            value={avis.sections_html || ''}
            onChange={(html) => upd({ sections_html: html })}
            onImageUpload={() => triggerImagePicker('sections_html')}
            placeholder="Bloc HTML libre généré par Claude depuis le prompt custom du brouillon."
            height={420}
          />
          <small style={{ color: '#888', fontSize: 11, display: 'block', marginTop: 6 }}>
            Pour modifier la STRUCTURE (H2/H3) ou regénérer ce contenu via le persona,
            édite le brouillon : <Link href={`/sites/${siteId}/avis/draft/${slug}`} style={{ color: '#0066cc' }}>
              /avis/draft/{slug}
            </Link>, puis clique « 🔄 Régénérer le contenu IA » ci-dessous.
          </small>
        </div>
      )}

      {!hasSectionsHtml && (['h2_fonctionnalites', 'h2_support', 'h2_qualite_prix'] as const).map(key => (
        <div style={sectionStyle} key={key}>
          <h2 style={h2Style}>{({
            h2_fonctionnalites: 'Section : Fonctionnalités',
            h2_support: 'Section : Support client',
            h2_qualite_prix: 'Section : Qualité-prix',
          })[key]}</h2>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Titre H2</label>
            <input style={inputStyle} value={avis[key]?.titre || ''} onChange={e => updH2(key, { titre: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Contenu HTML</label>
            <textarea style={{ ...textareaStyle, minHeight: 160, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
                      value={avis[key]?.contenu_html || ''}
                      onChange={e => updH2(key, { contenu_html: e.target.value })} />
          </div>
        </div>
      ))}

      <div style={sectionStyle}>
        <h2 style={h2Style}>Avis des utilisateurs (boxes aiment / regrettent)</h2>
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 14px', lineHeight: 1.5 }}>
          2 paragraphes HTML générés par Claude à partir du sentiment + points forts/faibles.
          Mets les mots-clés en <strong>gras</strong> via la toolbar.
        </p>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>✅ Ce que les clients aiment</label>
          <RichEditor
            value={avis.h2_avis_clients?.aiment || ''}
            onChange={(html) => updH2('h2_avis_clients', { aiment: html })}
            onImageUpload={() => triggerImagePicker('aiment')}
            placeholder="Les clients mettent en avant : un service client réactif, ..."
            height={200}
          />
        </div>
        <div>
          <label style={labelStyle}>❌ Ce que les clients regrettent</label>
          <RichEditor
            value={avis.h2_avis_clients?.regrettent || ''}
            onChange={(html) => updH2('h2_avis_clients', { regrettent: html })}
            onImageUpload={() => triggerImagePicker('regrettent')}
            placeholder="Plusieurs points faibles reviennent : une application jugée vieillotte, ..."
            height={200}
          />
        </div>
        {avis.h2_avis_clients?.contenu_html && (
          <div style={{ marginTop: 14, padding: 10, background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 6, fontSize: 12, color: '#5D4037' }}>
            ⚠ Contenu legacy détecté (<code>contenu_html</code>) — sera remplacé par les 2 paragraphes ci-dessus à la prochaine régénération.
          </div>
        )}
      </div>

      <div style={sectionStyle}>
        <h2 style={h2Style}>Foire aux questions</h2>
        <FaqEditor faq={avis.faq || []} onChange={v => upd({ faq: v })} />
      </div>

      <div style={sectionStyle}>
        <h2 style={h2Style}>Verdict et CTA</h2>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Verdict final</label>
          <RichEditor
            value={avis.verdict || ''}
            onChange={(html) => upd({ verdict: html })}
            onImageUpload={() => triggerImagePicker('verdict')}
            placeholder="Conclusion finale de l'avis : recommandation, pour qui, à éviter si..."
            height={240}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>URL CTA (affiliation)</label>
            <input style={inputStyle} value={avis.cta_url || ''} onChange={e => upd({ cta_url: e.target.value })} placeholder="https://..." />
          </div>
          <div>
            <label style={labelStyle}>Texte du bouton</label>
            <input style={inputStyle} value={avis.cta_label || ''} onChange={e => upd({ cta_label: e.target.value })} placeholder={`Visiter ${avis.marque || 'Marque'}`} />
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <h2 style={h2Style}>Preuve sociale (Trustpilot + Google)</h2>
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 14px', lineHeight: 1.5 }}>
          Renseigne au moins une des deux plateformes pour afficher la section "Avis des utilisateurs".
          Les deux peuvent coexister, le template les affiche alors côte à côte.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ padding: 14, border: '1px solid #1E2D3D', borderRadius: 8, background: '#0A0E1A' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#00B67A', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>⭐ Trustpilot</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>Note (/5)</label>
                <input style={inputStyle} type="number" min="0" max="5" step="0.1" value={avis.note_trustpilot ?? ''}
                       onChange={e => upd({ note_trustpilot: e.target.value ? parseFloat(e.target.value) : '' })} placeholder="4.7" />
              </div>
              <div>
                <label style={labelStyle}>Nb d'avis</label>
                <input style={inputStyle} type="number" min="0" value={avis.nb_avis_trustpilot ?? ''}
                       onChange={e => upd({ nb_avis_trustpilot: e.target.value ? parseInt(e.target.value) : '' })} placeholder="3000" />
              </div>
            </div>
          </div>
          <div style={{ padding: 14, border: '1px solid #1E2D3D', borderRadius: 8, background: '#0A0E1A' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4285F4', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>📍 Google Reviews</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Note (/5)</label>
                <input style={inputStyle} type="number" min="0" max="5" step="0.1" value={avis.note_google ?? ''}
                       onChange={e => upd({ note_google: e.target.value ? parseFloat(e.target.value) : '' })} placeholder="3.2" />
              </div>
              <div>
                <label style={labelStyle}>Nb d'avis</label>
                <input style={inputStyle} type="number" min="0" value={avis.nb_avis_google ?? ''}
                       onChange={e => upd({ nb_avis_google: e.target.value ? parseInt(e.target.value) : '' })} placeholder="1247" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <h2 style={h2Style}>SEO</h2>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Meta title</label>
          <input style={inputStyle} value={avis.meta_title || ''} onChange={e => upd({ meta_title: e.target.value })} maxLength={70} />
          <small style={{ color: '#888', fontSize: 11 }}>{(avis.meta_title || '').length}/60 caractères recommandés</small>
        </div>
        <div>
          <label style={labelStyle}>Meta description</label>
          <textarea style={{ ...textareaStyle, minHeight: 60 }} value={avis.meta_description || ''} onChange={e => upd({ meta_description: e.target.value })} maxLength={170} />
          <small style={{ color: '#888', fontSize: 11 }}>{(avis.meta_description || '').length}/155 caractères recommandés</small>
        </div>
      </div>

      <div style={sectionStyle}>
        <h2 style={h2Style}>Maillage interne (ancres → nb d'occurrences à lier)</h2>
        <LinkAnchorsEditor anchors={avis.link_anchors || []} onChange={v => upd({ link_anchors: v })} />
      </div>

      <div style={{ position: 'sticky', bottom: 0, background: '#fafafa', borderTop: '1px solid #ddd', padding: 16, margin: '20px -24px -24px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={busy}
                style={{ background: '#000', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {saving ? 'Sauvegarde…' : '💾 Enregistrer'}
        </button>

        <button onClick={regenerate} disabled={busy}
                title="Relance les 2 appels Claude (prompt brouillon + persona) et écrase le contenu actuel"
                style={{ background: '#3D7A4F', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {regenerating ? '⏳ Lancement workflow…' : '🔄 Régénérer le contenu IA'}
        </button>

        <button onClick={remove} disabled={busy}
                style={{ background: 'transparent', color: '#c00', border: '1px solid #c00', padding: '10px 16px', borderRadius: 6, fontSize: 13, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          🗑 Supprimer
        </button>

        {msg && <span style={{ fontSize: 14, color: msg.startsWith('✓') ? 'green' : 'crimson' }}>{msg}</span>}
        <span style={{ flex: 1 }} />
        <small style={{ color: '#888' }}>Le HTML sera regénéré au prochain déploiement automatique.</small>
      </div>

      {/* File input caché unique partagé par les 6 RichEditor — uploadImage() lit activeEditorRef pour router l'URL au bon champ */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0])}
      />
    </div>
  )
}

function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input style={{ flex: 1, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                 value={it} onChange={e => {
                   const v = [...items]; v[i] = e.target.value; onChange(v)
                 }} />
          <button onClick={() => onChange(items.filter((_, j) => j !== i))}
                  style={{ background: 'transparent', border: '1px solid #ddd', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>×</button>
        </div>
      ))}
      <button onClick={() => onChange([...items, ''])}
              style={{ background: 'transparent', border: '1px dashed #aaa', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#555' }}>
        + Ajouter
      </button>
    </div>
  )
}

function TarifsEditor({ tarifs, onChange }: { tarifs: Tarif[]; onChange: (v: Tarif[]) => void }) {
  return (
    <div>
      {tarifs.map((t, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 36px', gap: 6, marginBottom: 8 }}>
          <input placeholder="Nom" style={inputBase} value={t.nom || ''} onChange={e => {
            const v = [...tarifs]; v[i] = { ...v[i], nom: e.target.value }; onChange(v)
          }} />
          <input placeholder="Prix" style={inputBase} value={t.prix || ''} onChange={e => {
            const v = [...tarifs]; v[i] = { ...v[i], prix: e.target.value }; onChange(v)
          }} />
          <input placeholder="Features (séparés par virgules)" style={inputBase} value={t.features || ''} onChange={e => {
            const v = [...tarifs]; v[i] = { ...v[i], features: e.target.value }; onChange(v)
          }} />
          <button onClick={() => onChange(tarifs.filter((_, j) => j !== i))}
                  style={{ background: 'transparent', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>×</button>
        </div>
      ))}
      <button onClick={() => onChange([...tarifs, { nom: '', prix: '', features: '' }])}
              style={{ background: 'transparent', border: '1px dashed #aaa', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#555' }}>
        + Ajouter une offre
      </button>
    </div>
  )
}

function FaqEditor({ faq, onChange }: { faq: FaqItem[]; onChange: (v: FaqItem[]) => void }) {
  return (
    <div>
      {faq.map((item, i) => (
        <div key={i} style={{ border: '1px solid #eee', borderRadius: 6, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input placeholder="Question (terminant par ?)" style={{ ...inputBase, flex: 1, fontWeight: 600 }} value={item.q || ''} onChange={e => {
              const v = [...faq]; v[i] = { ...v[i], q: e.target.value }; onChange(v)
            }} />
            <button onClick={() => onChange(faq.filter((_, j) => j !== i))}
                    style={{ background: 'transparent', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', padding: '4px 10px' }}>×</button>
          </div>
          <textarea placeholder="Réponse (2-4 phrases, texte brut)" style={{ ...inputBase, width: '100%', minHeight: 60, resize: 'vertical' }} value={item.r || ''} onChange={e => {
            const v = [...faq]; v[i] = { ...v[i], r: e.target.value }; onChange(v)
          }} />
        </div>
      ))}
      <button onClick={() => onChange([...faq, { q: '', r: '' }])}
              style={{ background: 'transparent', border: '1px dashed #aaa', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#555' }}>
        + Ajouter une question
      </button>
    </div>
  )
}

function LinkAnchorsEditor({ anchors, onChange }: { anchors: LinkAnchor[]; onChange: (v: LinkAnchor[]) => void }) {
  return (
    <div>
      {anchors.map((a, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 80px 36px', gap: 6, marginBottom: 6 }}>
          <input placeholder="Ancre (ex: comité d'entreprise CIC)" style={inputBase} value={a.phrase || ''} onChange={e => {
            const v = [...anchors]; v[i] = { ...v[i], phrase: e.target.value }; onChange(v)
          }} />
          <input type="number" min="1" placeholder="Nb" style={inputBase} value={a.count ?? 1} onChange={e => {
            const v = [...anchors]; v[i] = { ...v[i], count: parseInt(e.target.value) || 1 }; onChange(v)
          }} />
          <button onClick={() => onChange(anchors.filter((_, j) => j !== i))}
                  style={{ background: 'transparent', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer' }}>×</button>
        </div>
      ))}
      <button onClick={() => onChange([...anchors, { phrase: '', count: 1 }])}
              style={{ background: 'transparent', border: '1px dashed #aaa', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#555' }}>
        + Ajouter une ancre
      </button>
    </div>
  )
}

const inputBase: React.CSSProperties = { padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }
