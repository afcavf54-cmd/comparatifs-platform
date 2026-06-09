'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ── Types de modèles disponibles ──────────────────────────────────────────
// Doit rester cohérent avec :
//   - TYPE_LABELS et typeColors dans /templates/page.tsx (liste)
//   - load_prompts() côté Python qui cherche page_types.classement OU page_types.blog
// 'blog' est le type à utiliser pour les sites blog-only (ex: cadeauclic.com).
// Pour ces sites, on créera le schema ici puis on l'éditera via l'onglet
// "🌐 Prompt global" de l'éditeur ; les onglets "Classement" et "Avis" peuvent
// être ignorés car ils ne s'appliquent pas aux sites blog-only.
const TYPES = [
  { id: 'blog',       label: '📝 Blog (thématique)', desc: "Pour les sites blog-only. Définit le ton, le style et l'angle éditorial de la thématique." },
  { id: 'classement', label: '🏆 Classement',        desc: 'Pour les sites avec pages de classement (logiciels, produits, services).' },
  { id: 'avis',       label: '⭐ Avis',              desc: 'Pour les pages individuelles d\'avis sur un produit ou service.' },
  { id: 'vs',         label: '⚖️ Comparatif (vs)',   desc: 'Pour les pages A vs B (comparaison entre deux produits).' },
  { id: 'local',      label: '📍 Page locale',       desc: 'Pour les pages géolocalisées (ville, région, code postal...).' },
]

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
    type: 'blog',
    niche: '',
    description: '',
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => {
    setForm(f => {
      const next = { ...f, [k]: v }
      // Auto-derive slug from label tant que l'utilisateur n'a pas saisi le slug manuellement.
      // Si le slug actuel correspond au label précédent (= jamais modifié manuellement),
      // on continue de le suivre. Sinon, on respecte le choix de l'utilisateur.
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
    // L'API /api/github renvoie { content: "..." } si le fichier existe,
    // ou un objet sans content (voire une erreur) sinon. On considère donc
    // que la présence d'un champ `content` non vide = fichier déjà présent.
    try {
      const check = await fetch(`/api/github?path=${encodeURIComponent(`platform/schemas/${slug}.json`)}&t=${Date.now()}`)
      if (check.ok) {
        const d = await check.json()
        if (d?.content) {
          setError(`Un modèle avec l'identifiant "${slug}" existe déjà. Choisis un autre slug.`)
          setCreating(false)
          return
        }
      }
    } catch {
      // Erreur réseau ou 404 → considère comme inexistant, on peut créer
    }

    // ── JSON initial du schema ────────────────────────────────────────────
    // On reproduit la structure du schema "classement-saas.json" existant
    // pour garder la cohérence avec l'éditeur. Pour un type "blog", les
    // sections `keywords`, `blocks`, et `avis_config` ne seront pas utilisées,
    // mais on les pose vides pour que l'éditeur fonctionne sans crash.
    // Le seul champ qui compte vraiment pour un site blog-only est `global_prompt`
    // (à remplir dans l'éditeur juste après création).
    const schema = {
      template: slug,
      label: form.label.trim(),
      type: form.type,
      niche: form.niche.trim() || form.type,
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

    // ── Création via /api/github ──────────────────────────────────────────
    try {
      const r = await fetch('/api/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: `platform/schemas/${slug}.json`,
          content: JSON.stringify(schema, null, 2),
          message: `HUB: Create template ${slug} (${form.type})`,
        }),
      })
      const d = await r.json()
      if (!d?.ok) {
        setError(`Erreur création : ${d?.error || 'erreur GitHub inconnue'}`)
        setCreating(false)
        return
      }
      // Redirige vers l'éditeur. On laisse 500ms pour que GitHub se mette à jour
      // avant que l'éditeur ne tente de relire le fichier (sinon il peut tomber
      // sur l'ancien index Git et croire que le fichier n'existe pas).
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
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '12px 0 6px' }}>📐 Nouveau modèle</h1>
      <p style={{ color: '#8B9CB0', fontSize: 13, marginBottom: 28, lineHeight: 1.6 }}>
        Crée un nouveau modèle pour une nouvelle thématique (ex: blog cadeau, classement immobilier, finance perso...).
        Le prompt global et les défauts s'éditent ensuite via l'éditeur de modèle classique.
      </p>

      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 24 }}>

        {/* ── Type ── */}
        <div style={{ marginBottom: 22 }}>
          {lbl('Type *')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {TYPES.map(t => (
              <div key={t.id} onClick={() => set('type', t.id)} style={{
                padding: '14px 16px',
                borderRadius: 10,
                cursor: 'pointer',
                border: form.type === t.id ? '2px solid #00D4AA' : '2px solid #1E2D3D',
                background: form.type === t.id ? 'rgba(0,212,170,0.06)' : 'transparent',
                transition: 'all .15s',
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: '#8B9CB0', lineHeight: 1.4 }}>{t.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Label ── */}
        <div style={{ marginBottom: 14 }}>
          {lbl("Nom affiché *")}
          <input
            value={form.label}
            onChange={e => set('label', e.target.value)}
            placeholder="Ex: Blog Cadeaux"
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
          <div style={{ fontSize: 11, color: '#4A5568', marginTop: 6, lineHeight: 1.5 }}>
            Nom du fichier généré : <code style={{ color: '#8B9CB0', background: '#0A0E1A', padding: '1px 6px', borderRadius: 3, fontSize: 11 }}>platform/schemas/{form.template || 'xxx'}.json</code>
            <br/>Référencé dans config.yaml du site via <code style={{ color: '#8B9CB0', background: '#0A0E1A', padding: '1px 6px', borderRadius: 3, fontSize: 11 }}>page_types: {form.type === 'classement' ? 'classement' : 'blog'}: {form.template || 'xxx'}</code>
          </div>
        </div>

        {/* ── Niche ── */}
        <div style={{ marginBottom: 14 }}>
          {lbl('Niche (optionnel)')}
          <input
            value={form.niche}
            onChange={e => set('niche', e.target.value)}
            placeholder={`Ex: ${form.type === 'blog' ? 'cadeau, finance-perso, immobilier' : 'saas, scpi, mutuelle'}`}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}
          />
          <div style={{ fontSize: 11, color: '#4A5568', marginTop: 6 }}>
            Si laissé vide, sera identique au type sélectionné ("{form.type}")
          </div>
        </div>

        {/* ── Description ── */}
        <div style={{ marginBottom: 20 }}>
          {lbl('Description (optionnel)')}
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Description courte affichée dans la liste des modèles..."
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
            {creating ? 'Création...' : '✓ Créer le modèle'}
          </button>
        </div>

        <div style={{ marginTop: 24, padding: 16, background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 10, fontSize: 12, color: '#8B9CB0', lineHeight: 1.6 }}>
          💡 <strong style={{ color: '#fff' }}>Après création</strong>, tu seras redirigé vers l'éditeur du modèle.
          Tu pourras y coller ton prompt global (généré via ChatGPT par exemple) dans l'onglet
          <strong style={{ color: '#fff' }}> "🌐 Prompt global"</strong>.
          <br/><br/>
          {form.type === 'blog' && (
            <>
              📌 <strong style={{ color: '#fff' }}>Pour un type "blog"</strong>, seul l'onglet
              "🌐 Prompt global" est pertinent ; les onglets "Classement" et "Avis" peuvent être ignorés.
              Côté site, édite ensuite manuellement <code style={{ color: '#8B9CB0', background: '#0A0E1A', padding: '1px 6px', borderRadius: 3, fontSize: 11 }}>platform/sites/&lt;site&gt;/config.yaml</code> pour ajouter :
              <pre style={{ margin: '8px 0 0', padding: '8px 10px', background: '#0A0E1A', borderRadius: 6, fontSize: 11, color: '#00D4AA', overflowX: 'auto' as const }}>
{`page_types:
  blog: ${form.template || 'xxx'}`}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
