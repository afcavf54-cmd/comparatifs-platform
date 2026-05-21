'use client'
import { useEffect, useState, use, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ─── Page d'édition d'un avis ─────────────────────────────────────────────
// URL : /sites/<siteId>/avis/<slug>
//
// Lit le .md via GET /api/sites/<siteId>/avis/<slug>, présente un formulaire
// avec TOUS les champs métier (marque, note, points forts/faibles, tarifs,
// H2, FAQ, verdict, SEO, mot_minimum, Trustpilot, link_anchors), puis fait
// un PUT pour réécrire le frontmatter.
//
// Bouton "🔄 Régénérer le contenu IA" :
// déclenche le workflow GitHub publish-now (avec FORCE_TITLES=marque) qui
// rejoue les 2 appels Claude (1er pour intro/FAQ/verdict, 2e pour sections
// custom via prompt brouillon). Tout le texte IA est écrasé, les champs
// sheet (marque, catégorie, note, CTA, tarifs) sont préservés.
//
// Choix d'UI : page dédiée plutôt que modal, car beaucoup de champs avec
// listes éditables (tarifs, FAQ, points). Une page scrollable reste plus
// confortable et autorise le copier-coller multi-écran.

type Tarif = { nom: string; prix: string; features: string }
type FaqItem = { q: string; r: string }
// `H2` est le shape commun à h2_fonctionnalites/h2_support/h2_qualite_prix
// (qui utilisent {titre, contenu_html}) ET à h2_avis_clients (qui utilise
// désormais {aiment, regrettent} depuis la refonte 2026). Les 4 champs sont
// donc optionnels — le code de rendu choisit ceux qui sont pertinents.
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
  // Intro : nouveau paragraphe d'introduction sous le H1 (généré par Claude
  // séparément du en_bref). Cf. avis_publish_scheduled.py v14+ et template
  // avis-post.html.j2 v5+.
  intro?: string
  en_bref?: string
  // Chemin relatif du logo uploadé pour cet avis. Type :
  // `/avis/<slug>/logo-<ts>.<ext>` (le fichier réside dans
  // platform/sites/<siteId>/public/avis/<slug>/...).
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
  plateforme_avis?: string
  // Avis Google : 2 colonnes optionnelles ajoutées en 2026. Le template
  // affiche une 2e carte note à côté de Trustpilot si renseignées.
  note_google?: number | string
  nb_avis_google?: number | string
  link_anchors?: LinkAnchor[]
  mot_minimum?: number
  sections_html?: string
  [k: string]: any
}

export default function AvisEditPage({ params }: { params: Promise<{ siteId: string; slug: string }> }) {
  const { siteId, slug } = use(params)
  const router = useRouter()
  const [avis, setAvis] = useState<Avis | null>(null)
  const [sha, setSha] = useState<string>('')
  const [domain, setDomain] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // État dédié à la régénération IA : permet de désactiver les autres boutons
  // pendant qu'on lance le workflow et d'afficher un loader spécifique.
  const [regenerating, setRegenerating] = useState(false)
  const [msg, setMsg] = useState<string>('')
  // ── État pour l'upload du logo (encart "Mon avis en Bref") ─────────
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // ── Chargement initial ──────────────────────────────────────────────
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
        // Sécurise les types listés/dicts pour les inputs contrôlés
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
      } catch (e) {
        setMsg('Erreur réseau')
      } finally {
        setLoading(false)
      }
    })()
  }, [siteId, slug])

  // ── Sauvegarde ──────────────────────────────────────────────────────
  const save = async () => {
    if (!avis) return
    setSaving(true)
    setMsg('')
    try {
      const r = await fetch(`/api/sites/${siteId}/avis/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avis, body: '', sha }),
      })
      const data = await r.json()
      if (!r.ok) {
        setMsg(`Erreur : ${data.error || r.status}`)
      } else {
        setMsg('✓ Sauvegardé')
        // Recharge le sha pour permettre une 2e sauvegarde dans la foulée
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

  // ── Upload du logo de la marque (encart "Mon avis en Bref") ─────────
  // Le fichier est commité dans `platform/sites/<siteId>/public/avis/<slug>/
  // logo-<timestamp>.<ext>` et le chemin relatif `/avis/<slug>/logo-<ts>.<ext>`
  // est stocké dans le frontmatter du .md. Le template avis-post.html.j2
  // affiche ce logo en haut de page (avec un placeholder = initiale de la
  // marque si vide).
  // Pattern copié de blog-edit-page (uploadFeatured) : commit direct via
  // l'API /api/github/upload, puis update du frontmatter en mémoire.
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
      // Met à jour le state local du frontmatter. La sauvegarde via le bouton
      // "Enregistrer" persiste ce chemin dans le .md de l'avis.
      setAvis((prev) => prev ? { ...prev, logo_path: `/avis/${slug}/${imgName}` } : prev)
      setMsg('✓ Logo uploadé — pense à enregistrer pour persister')
      setTimeout(() => setMsg(''), 3500)
    } catch {
      setMsg('✗ Erreur upload')
    } finally {
      setUploadingLogo(false)
    }
  }

  // ── Régénération via Claude (workflow GitHub) ───────────────────────
  // Déclenche le workflow blog-cron avec FORCE_TITLES=<marque>. Le script
  // Python `avis_publish_scheduled.py` :
  //   1. lit le brouillon (_drafts.json) → prompt custom + faq_questions
  //   2. lit config.yaml > persona_prompt → ton/style
  //   3. fait 2 appels Claude (JSON principal + sections_html)
  //   4. écrase le .md avec le nouveau contenu
  //   5. push → CF Pages redéploie
  // Donc tout le texte IA (en_bref, points forts/faibles, sections, FAQ
  // réponses, verdict, meta) est régénéré. Les champs venant de la sheet
  // (marque, catégorie, note, CTA, tarifs) sont préservés.
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
      // Vérif préalable : un brouillon existe-t-il pour ce slug ? Si non, on
      // prévient l'éditeur que la regen utilisera le format standard sans
      // prompt custom (= 3 H2 standards génériques).
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
      } catch {
        // Si la route draft n'existe pas / erreur réseau, on continue quand même
        // (le script Python gère le cas sans brouillon).
      }

      // Déclenche le workflow GitHub
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

  // ── Suppression ─────────────────────────────────────────────────────
  const remove = async () => {
    if (!confirm(`Supprimer définitivement l'avis "${avis?.marque}" ? Cette action est irréversible.`)) return
    const r = await fetch(`/api/sites/${siteId}/avis/${slug}`, { method: 'DELETE' })
    if (r.ok) {
      router.push(`/sites/${siteId}/avis`)
    } else {
      setMsg('Erreur suppression')
    }
  }

  // ── Helpers d'update partiel ────────────────────────────────────────
  const upd = (patch: Partial<Avis>) => setAvis(prev => prev ? { ...prev, ...patch } : prev)
  const updH2 = (key: 'h2_fonctionnalites' | 'h2_support' | 'h2_qualite_prix' | 'h2_avis_clients', patch: Partial<H2>) =>
    setAvis(prev => prev ? { ...prev, [key]: { ...(prev[key] || { titre: '', contenu_html: '' }), ...patch } } : prev)

  if (loading) return <div style={{ padding: 24 }}>Chargement…</div>
  if (!avis) return <div style={{ padding: 24, color: 'crimson' }}>{msg || 'Avis introuvable'}</div>

  // Avis avec sections_html ? On peut signaler à l'éditeur que les 3 H2 legacy
  // sont vides à dessein (cf. fix Python qui ne les stocke plus si sections_html).
  const hasSectionsHtml = !!(avis.sections_html && avis.sections_html.trim())

  // ── Styles partagés (sobres, cohérents avec le reste du dashboard) ──
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }
  const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }
  const sectionStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: 20, marginBottom: 20 }
  const h2Style: React.CSSProperties = { margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#222' }

  // Désactive les autres actions pendant une opération en cours
  const busy = saving || regenerating

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      {/* Bandeau top */}
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

      {/* ── INFOS DE BASE ──────────────────────────────────────────── */}
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

      {/* ── EN BREF + H1 ───────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Hero (titre + intro + résumé)</h2>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Titre H1</label>
          <input style={inputStyle} value={avis.h1 || ''} onChange={e => upd({ h1: e.target.value })}
                 placeholder={`Avis ${avis.marque || 'Marque'} (2026) : ...`} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>
            Intro <span style={{ textTransform: 'none', color: '#888', fontWeight: 400 }}>— paragraphe d'introduction sous le H1</span>
          </label>
          <textarea style={textareaStyle} rows={4} value={avis.intro || ''} onChange={e => upd({ intro: e.target.value })}
                    placeholder="Paragraphe d'accroche éditoriale qui pose le contexte. Différent du résumé « En bref »." />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>
            Résumé « En bref » <span style={{ textTransform: 'none', color: '#888', fontWeight: 400 }}>— affiché à côté du logo</span>
          </label>
          <textarea style={textareaStyle} value={avis.en_bref || ''} onChange={e => upd({ en_bref: e.target.value })}
                    placeholder="Synthèse de l'avis en ~50 mots : verdict, points clés, pour qui c'est." />
        </div>

        {/* ── Upload du logo ─────────────────────────────────────────────── */}
        {/* Le pattern d'upload est identique à celui du blog (uploadFeatured).
            Le fichier est commité dans `platform/sites/<siteId>/public/avis/<slug>/`
            et le chemin relatif `/avis/<slug>/logo-<ts>.<ext>` est stocké
            dans le frontmatter, puis rendu dans avis-post.html.j2. */}
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

      {/* ── POINTS FORTS / FAIBLES ─────────────────────────────────── */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Points forts et faibles</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <ListEditor label="Points forts" items={avis.points_forts || []} onChange={v => upd({ points_forts: v })} />
          <ListEditor label="Points faibles" items={avis.points_faibles || []} onChange={v => upd({ points_faibles: v })} />
        </div>
      </div>

      {/* ── TARIFS ─────────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Tarifs et offres</h2>
        <TarifsEditor tarifs={avis.tarifs || []} onChange={v => upd({ tarifs: v })} />
      </div>

      {/* ── SECTIONS HTML CUSTOM (si l'avis a un sections_html) ─────
          Ce champ contient le HTML libre généré par le 2e appel Claude à
          partir du prompt custom de l'éditeur (cf. brouillon). Quand il est
          rempli, c'est lui qui est rendu sur le site, et les 3 H2 legacy
          (Fonctionnalités / Support / Qualité-Prix) sont ignorés. On le
          rend éditable ici pour permettre des retouches manuelles.        */}
      {hasSectionsHtml && (
        <div style={sectionStyle}>
          <h2 style={h2Style}>
            Sections custom (HTML libre)
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: '#3D7A4F' }}>
              ✓ Actif — remplace les 3 H2 standards ci-dessous
            </span>
          </h2>
          <label style={labelStyle}>Contenu HTML</label>
          <textarea
            style={{ ...textareaStyle, minHeight: 320, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
            value={avis.sections_html || ''}
            onChange={e => upd({ sections_html: e.target.value })}
          />
          <small style={{ color: '#888', fontSize: 11, display: 'block', marginTop: 6 }}>
            Pour modifier la STRUCTURE (H2/H3) ou regénérer ce contenu via le persona,
            édite le brouillon : <Link href={`/sites/${siteId}/avis/draft/${slug}`} style={{ color: '#0066cc' }}>
              /avis/draft/{slug}
            </Link>, puis clique « 🔄 Régénérer le contenu IA » ci-dessous.
          </small>
        </div>
      )}

      {/* ── H2 ANALYSE (legacy — masqués si sections_html actif) ──── */}
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

      {/* ── Section Avis clients : aiment + regrettent ──────────────────
          Refonte 2026 : 2 paragraphes distincts au lieu d'un seul contenu_html.
          Le titre H2 est désormais forcé côté template ("Quels sont les avis
          des utilisateurs de X ?"), donc plus d'input "Titre H2" ici. */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Avis des utilisateurs (boxes aiment / regrettent)</h2>
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 14px', lineHeight: 1.5 }}>
          2 paragraphes HTML générés par Claude à partir du sentiment + points forts/faibles.
          Mots-clés à mettre en <code style={{ background: '#f4f4f4', padding: '1px 5px', borderRadius: 3 }}>&lt;strong&gt;</code>.
        </p>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>✅ Ce que les clients aiment</label>
          <textarea style={{ ...textareaStyle, minHeight: 110, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
                    value={avis.h2_avis_clients?.aiment || ''}
                    onChange={e => updH2('h2_avis_clients', { aiment: e.target.value })}
                    placeholder="<p>Les clients mettent en avant : un <strong>service client réactif</strong>, ...</p>" />
        </div>
        <div>
          <label style={labelStyle}>❌ Ce que les clients regrettent</label>
          <textarea style={{ ...textareaStyle, minHeight: 110, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
                    value={avis.h2_avis_clients?.regrettent || ''}
                    onChange={e => updH2('h2_avis_clients', { regrettent: e.target.value })}
                    placeholder="<p>Plusieurs points faibles reviennent : une <strong>application jugée vieillotte</strong>, ...</p>" />
        </div>
        {/* Rétro-compat : si l'avis a encore un ancien contenu_html (jamais
            régénéré depuis la refonte), on l'affiche en read-only pour info. */}
        {avis.h2_avis_clients?.contenu_html && (
          <div style={{ marginTop: 14, padding: 10, background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 6, fontSize: 12, color: '#5D4037' }}>
            ⚠ Contenu legacy détecté (<code>contenu_html</code>) — sera remplacé par les 2 paragraphes ci-dessus à la prochaine régénération.
          </div>
        )}
      </div>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Foire aux questions</h2>
        <FaqEditor faq={avis.faq || []} onChange={v => upd({ faq: v })} />
      </div>

      {/* ── VERDICT + CTA ──────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Verdict et CTA</h2>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Verdict final</label>
          <textarea style={textareaStyle} value={avis.verdict || ''} onChange={e => upd({ verdict: e.target.value })} />
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

      {/* ── PREUVE SOCIALE : Trustpilot + Google ────────────────────
          2 plateformes optionnelles. Si l'une OU l'autre est renseignée, la
          section "Quels sont les avis des utilisateurs de X ?" s'affiche
          avec les logos et notes correspondants. */}
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
            <div>
              <label style={labelStyle}>Plateforme (libellé custom, optionnel)</label>
              <input style={inputStyle} value={avis.plateforme_avis || ''} onChange={e => upd({ plateforme_avis: e.target.value })} placeholder="Trustpilot" />
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

      {/* ── SEO ────────────────────────────────────────────────────── */}
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

      {/* ── MAILLAGE INTERNE ────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Maillage interne (ancres → nb d'occurrences à lier)</h2>
        <LinkAnchorsEditor anchors={avis.link_anchors || []} onChange={v => upd({ link_anchors: v })} />
      </div>

      {/* ── BARRE D'ACTIONS ────────────────────────────────────────── */}
      <div style={{ position: 'sticky', bottom: 0, background: '#fafafa', borderTop: '1px solid #ddd', padding: 16, margin: '20px -24px -24px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={busy}
                style={{ background: '#000', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {saving ? 'Sauvegarde…' : '💾 Enregistrer'}
        </button>

        {/* Bouton Régénérer : style accent pour qu'il soit visible mais
            distinct du bouton primaire. Vert pour signaler l'action IA. */}
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
    </div>
  )
}

// ─── Petits éditeurs spécialisés ──────────────────────────────────────────

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
