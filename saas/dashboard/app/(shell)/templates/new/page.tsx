'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ── Création d'une nouvelle THÉMATIQUE ───────────────────────────────────
// Une thématique est un univers éditorial transversal qui s'applique à TOUS
// les types de pages d'un site (blog, classement, avis, vs, local). Elle
// porte principalement le `global_prompt` (voix éditoriale, contraintes de
// style, mots à éviter, etc.) + les défauts par section.
//
// Le concept de "type" (blog/classement/avis/...) est un attribut des
// SITES qui consomment la thématique, pas de la thématique elle-même.
// Le site cadeauclic.com référence la thématique "cadeau" dans son config
// via :
//     page_types:
//       blog: cadeau         # pour la génération des articles de blog
//       classement: cadeau   # plus tard, quand on fera des classements cadeau
//       avis: cadeau         # plus tard, pour les avis sur des produits cadeau
//
// Le code Python (blog_publish_scheduled.py > load_prompts) lit alors
// platform/schemas/cadeau.json et en extrait le global_prompt.
//
// Le `type: "thematic"` du schema généré est UNIQUEMENT utilisé pour le
// regroupement dans la liste /templates (cf. TYPE_LABELS et typeColors).
// Il n'a aucun impact côté Python (où c'est `page_types.<X>` dans le
// config du site qui choisit quel schema lire).

function slugify(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function NewTemplatePage() {
  const router = useRouter()
  const [form, setForm] = useState({
    template: '',
    label: '',
    niche: '',
    description: '',
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => {
    setForm(f => {
      const next = { ...f, [k]: v }
      // Auto-derive slug from label tant que l'utilisateur n'a pas saisi le slug manuellement.
      // Si le slug actuel correspond au slugify du label précédent (= jamais modifié à la main),
      // on continue de le suivre. Sinon on respecte le choix de l'utilisateur.
      if (k === 'label' && (f.template === '' || f.template === slugify(f.label))) {
        next.template = slugify(v)
      }
      return next
    })
  }

  async function handleCreate() {
    setError('')
    const slug = slugify(form.template)
    if (!slug) { setError('Identifiant technique (slug) obligatoire'); return }
    if (!form.label.trim()) { setError('Nom obligatoire'); return }

    setCreating(true)

    // ── Vérifier que ce slug n'existe pas déjà ───────────────────────────
    // L'API /api/github renvoie { content: "..." } si le fichier existe.
    // On considère donc que la présence d'un champ `content` non vide = collision.
    try {
      const check = await fetch(`/api/github?path=${encodeURIComponent(`platform/schemas/${slug}.json`)}&t=${Date.now()}`)
      if (check.ok) {
        const d = await check.json()
        if (d?.content) {
          setError(`Une thématique avec l'identifiant "${slug}" existe déjà. Choisis un autre slug.`)
          setCreating(false)
          return
        }
      }
    } catch {
      // Erreur réseau ou 404 → considère comme inexistant, on peut créer
    }

    // ── JSON initial du schema de la thématique ──────────────────────────
    // On reproduit la structure complète des schemas existants (cf.
    // classement-saas.json) pour que l'éditeur fonctionne sans surprise
    // une fois la création terminée. Tous les sous-champs sont vides ou
    // initialisés à leurs défauts ; Julien les remplira au fur et à
    // mesure que la thématique se développe (blog d'abord, classement
    // et avis plus tard si pertinents pour la thématique).
    const schema = {
      template: slug,
      label: form.label.trim(),
      type: 'thematic',
      niche: form.niche.trim() || slug,
      description: form.description.trim() || '',
      variables: ['theme', 'year', 'site_name'],
      blocks: [],
      keywords: {},
      global_prompt: '',
      default_prompts: {
        prompt_intro:      { text: '', words_min: 100, words_max: 300 },
        prompt_en_bref:    { text: '', words_min: 10,  words_max: 30  },
        prompt_classement: { text: '', words_min: 150, words_max: 400 },
        prompt_contenu:    { text: '', words_min: 200, words_max: 500 },
        prompt_faq:        { text: '', words_min: 50,  words_max: 150 },
      },
      avis_config: {
        hero:           { words_min: 80, words_max: 130, prompt: '' },
        en_bref:        { words_min: 50, words_max: 90,  prompt: '' },
        points_forts:   { words_min: 5,  words_max: 14,  prompt: '' },
        points_faibles: { words_min: 5,  words_max: 14,  prompt: '' },
        faq:            { words_min: 30, words_max: 80,  prompt: '' },
        verdict:        { words_min: 50, words_max: 100, prompt: '' },
      },
      blog_config: {
        excerpt:     { words_min: 15,  words_max: 30,  prompt: '' },
        intro:       { words_min: 100, words_max: 200, prompt: '' },
        sections_h2: { words_min: 250, words_max: 500, prompt: '' },
        conclusion:  { words_min: 60,  words_max: 130, prompt: '' },
        faq:         { words_min: 40,  words_max: 90,  prompt: '' },
      },
    }

    try {
      const r = await fetch('/api/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: `platform/schemas/${slug}.json`,
          content: JSON.stringify(schema, null, 2),
          message: `HUB: Create thematic ${slug}`,
        }),
      })
      const d = await r.json()
      if (!d?.ok) {
        setError(`Erreur création : ${d?.error || 'erreur GitHub inconnue'}`)
        setCreating(false)
        return
      }
      // Redirige vers l'éditeur. 500ms de latence pour laisser GitHub
      // se synchroniser avant que l'éditeur ne tente de relire le fichier
      // (sinon il peut tomber sur l'ancien index Git et croire que le
      // fichier n'existe pas → écran "Modèle introuvable").
      setTimeout(() => router.push(`/templates/${slug}`), 500)
    } catch (e: any) {
      setError(`Erreur réseau : ${e?.message || 'inconnue'}`)
      setCreating(false)
    }
  }

  const lbl = (text: string) => (
    <div style={{ fontSize: 12, color: '#8B9CB0', marginBottom: 6, fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{text}</div>
  )

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <Link href="/templates" style={{ color: '#8B9CB0', textDecoration: 'none', fontSize: 13 }}>← Retour aux modèles</Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '12px 0 6px' }}>🎨 Nouvelle thématique</h1>
      <p style={{ color: '#8B9CB0', fontSize: 13, marginBottom: 28, lineHeight: 1.6 }}>
        Une thématique est un <strong style={{ color: '#fff' }}>univers éditorial</strong> qui s'applique à tous les types de pages
        d'un site (blog, classement, avis...). Elle porte le prompt global (voix, ton, contraintes)
        et les défauts par section, partagés entre toutes les générations de contenu pour les sites
        rattachés à cette thématique.
      </p>

      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 24 }}>

        {/* ── Label ── */}
        <div style={{ marginBottom: 14 }}>
          {lbl('Nom affiché *')}
          <input
            value={form.label}
            onChange={e => set('label', e.target.value)}
            placeholder="Ex: Cadeaux"
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}
          />
        </div>

        {/* ── Slug technique ── */}
        <div style={{ marginBottom: 14 }}>
          {lbl('Identifiant technique (slug) *')}
          <input
            value={form.template}
            onChange={e => set('template', slugify(e.target.value))}
            placeholder="cadeau"
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'ui-monospace, monospace', boxSizing: 'border-box' as const }}
          />
          <div style={{ fontSize: 11, color: '#4A5568', marginTop: 6, lineHeight: 1.6 }}>
            Nom du fichier généré : <code style={{ color: '#8B9CB0', background: '#0A0E1A', padding: '1px 6px', borderRadius: 3, fontSize: 11 }}>platform/schemas/{form.template || 'xxx'}.json</code>
            <br/>Référence dans <code style={{ color: '#8B9CB0', background: '#0A0E1A', padding: '1px 6px', borderRadius: 3, fontSize: 11 }}>config.yaml</code> du site (selon les types de pages activés) :
            <pre style={{ margin: '6px 0 0', padding: '6px 10px', background: '#0A0E1A', borderRadius: 6, fontSize: 11, color: '#00D4AA', overflowX: 'auto' as const }}>
{`page_types:
  blog: ${form.template || 'xxx'}
  classement: ${form.template || 'xxx'}   # si tu fais des classements
  avis: ${form.template || 'xxx'}         # si tu fais des avis`}
            </pre>
          </div>
        </div>

        {/* ── Niche ── */}
        <div style={{ marginBottom: 14 }}>
          {lbl('Niche (optionnel)')}
          <input
            value={form.niche}
            onChange={e => set('niche', e.target.value)}
            placeholder="cadeau, finance-perso, saas, immobilier..."
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}
          />
          <div style={{ fontSize: 11, color: '#4A5568', marginTop: 6 }}>
            Si laissé vide, sera égal au slug
          </div>
        </div>

        {/* ── Description ── */}
        <div style={{ marginBottom: 20 }}>
          {lbl('Description (optionnel)')}
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Description courte affichée dans la liste des thématiques..."
            rows={3}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit', boxSizing: 'border-box' as const, lineHeight: 1.5 }}
          />
        </div>

        {error && <div style={{ color: '#FC8181', fontSize: 13, marginBottom: 16, padding: '10px 14px', background: 'rgba(252,129,129,0.08)', borderRadius: 8 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <Link href="/templates" style={{ padding: '10px 20px', borderRadius: 10, background: '#1E2D3D', color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
            Annuler
          </Link>
          <button onClick={handleCreate} disabled={creating}
            style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: creating ? '#1E2D3D' : 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: creating ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 14 }}>
            {creating ? 'Création...' : '✓ Créer la thématique'}
          </button>
        </div>

        <div style={{ marginTop: 24, padding: 16, background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 10, fontSize: 12, color: '#8B9CB0', lineHeight: 1.6 }}>
          💡 <strong style={{ color: '#fff' }}>Après création</strong>, tu seras redirigé vers l'éditeur de la thématique.
          Tu pourras y configurer :
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            <li>L'onglet <strong style={{ color: '#fff' }}>🌐 Prompt global</strong> : la voix éditoriale, le ton, les contraintes de style (à coller depuis ChatGPT par ex.)</li>
            <li>L'onglet <strong style={{ color: '#fff' }}>🏆 Classement</strong> : à remplir uniquement si tu fais des classements pour cette thématique (mots-clés, sheets produits, prompts par catégorie)</li>
            <li>L'onglet <strong style={{ color: '#fff' }}>⭐ Avis</strong> : à remplir uniquement si tu fais des avis (limites de mots par section)</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
