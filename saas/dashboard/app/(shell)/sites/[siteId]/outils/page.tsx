'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

// ── Catalogue d'outils disponibles ──────────────────────────────
// Pour ajouter un nouvel outil :
// 1. Créer le template Jinja2 dans platform/templates/outils/<id>.html.j2
// 2. Ajouter une entrée ici dans CATALOG (avec des defaults SEO sensés)
// 3. generate.py lira platform/sites/<site>/outils.json et publiera
//    les outils dont active=true
const CATALOG = [
  {
    id: 'convertisseur-ht-ttc',
    icon: '⇄',
    name: 'Convertisseur HT / TTC',
    description: 'Convertit un prix HT en TTC et inversement, avec les taux TVA 20%, 10%, 5,5% et 2,1%',
    defaults: {
      slug: 'convertir-ht-ttc',
      title: 'Convertisseur HT en TTC : calcul TVA instantané',
      meta_description: "Convertissez vos prix HT en TTC en 1 clic avec notre outil gratuit. Compatible TVA 20%, 10%, 5,5% et 2,1%.",
      h1: 'Convertisseur HT/TTC : calculez la TVA en 1 clic',
      prompt_redaction: "Rédige un guide pratique sur le calcul de la TVA et la conversion HT/TTC pour un dirigeant de TPE/PME. Ton accessible, exemples chiffrés concrets, mise en garde sur les taux applicables selon le secteur.",
      plan_h2: [
        'Comment calculer la TVA en pratique ?',
        'Les 4 taux de TVA en France et leurs usages',
        'Erreurs fréquentes à éviter',
      ],
      faq: [
        { question: 'Quel taux de TVA appliquer ?', answer: "Le taux standard est de 20%. Le taux intermédiaire (10%) s'applique à la restauration et certains travaux. Le taux réduit (5,5%) concerne l'alimentation, livres, etc. Le taux particulier (2,1%) ne concerne que les médicaments remboursés et la presse." },
        { question: 'Comment calculer la TVA à partir du TTC ?', answer: 'Divisez le montant TTC par (1 + taux de TVA). Par exemple, pour 120 € TTC à 20% : 120 / 1,20 = 100 € HT, donc 20 € de TVA.' },
      ],
      nb_mots: 1200,
    },
  },
  // Futur : { id: 'salaire-brut-net', ... }
  // Futur : { id: 'calcul-interets', ... }
]

interface FAQItem { question: string; answer: string }
interface OutilState {
  active: boolean
  slug: string
  title: string
  meta_description: string
  h1: string
  prompt_redaction: string
  plan_h2: string[]
  faq: FAQItem[]
  nb_mots: number
  contenu_genere?: string
}
interface ToolsConfig {
  menu_label: string
  outils: Record<string, OutilState>
}

function emptyState(toolId: string): OutilState {
  const tool = CATALOG.find(t => t.id === toolId)
  return {
    active: false,
    slug: tool?.defaults.slug || toolId,
    title: tool?.defaults.title || '',
    meta_description: tool?.defaults.meta_description || '',
    h1: tool?.defaults.h1 || '',
    prompt_redaction: tool?.defaults.prompt_redaction || '',
    plan_h2: tool?.defaults.plan_h2 || [],
    faq: tool?.defaults.faq || [],
    nb_mots: tool?.defaults.nb_mots || 1000,
    contenu_genere: '',
  }
}

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function OutilsPage() {
  const { siteId } = useParams()
  const [config, setConfig] = useState<ToolsConfig | null>(null)
  const [siteDomain, setSiteDomain] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [genError, setGenError] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)

  const configPath = `platform/sites/${siteId}/outils.json`

  // Charger config + domain
  useEffect(() => {
    if (!siteId) return
    Promise.all([
      fetch(`/api/github?path=${encodeURIComponent(configPath)}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/sites/${siteId}`).then(r => r.json()).catch(() => ({})),
    ]).then(([gh, site]) => {
      let loaded: ToolsConfig = { menu_label: 'Outils', outils: {} }
      if (gh.content) {
        try { loaded = JSON.parse(gh.content) } catch {}
      }
      // Initialiser les outils manquants avec les defaults
      for (const tool of CATALOG) {
        if (!loaded.outils[tool.id]) {
          loaded.outils[tool.id] = emptyState(tool.id)
        }
      }
      setConfig(loaded)
      setSiteDomain(site.domain || '')
      setLoading(false)
    })
  }, [siteId])

  function updateOutil(toolId: string, patch: Partial<OutilState>) {
    if (!config) return
    setConfig({
      ...config,
      outils: {
        ...config.outils,
        [toolId]: { ...config.outils[toolId], ...patch },
      },
    })
  }

  async function save() {
    if (!config) return
    setSaving(true); setMsg('')
    try {
      const r = await fetch('/api/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: configPath,
          content: JSON.stringify(config, null, 2),
          message: `HUB: Update outils ${siteId}`,
        }),
      })
      const d = await r.json()
      setMsg(d.ok ? '✓ Sauvegardé' : '✗ ' + (d.error || 'Erreur'))
    } catch (e: any) {
      setMsg('✗ ' + (e?.message || 'Erreur réseau'))
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(''), 4000)
    }
  }


  async function generateContent(toolId: string) {
    if (!config) return
    const state = config.outils[toolId]
    if (!state) return
    const tool = CATALOG.find(t => t.id === toolId)
    if (!tool) return

    if (!state.prompt_redaction.trim()) {
      setGenError(prev => ({ ...prev, [toolId]: 'Le prompt IA est vide.' }))
      return
    }

    setGenerating(prev => ({ ...prev, [toolId]: true }))
    setGenError(prev => ({ ...prev, [toolId]: '' }))

    try {
      const r = await fetch(`/api/sites/${siteId}/outils/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt_redaction: state.prompt_redaction,
          plan_h2: state.plan_h2,
          faq: state.faq,
          nb_mots: state.nb_mots,
          outil_name: tool.name,
        }),
      })
      const d = await r.json()
      if (d.ok && d.html) {
        updateOutil(toolId, { contenu_genere: d.html })
      } else {
        setGenError(prev => ({ ...prev, [toolId]: d.error || 'Erreur de génération' }))
      }
    } catch (e: any) {
      setGenError(prev => ({ ...prev, [toolId]: e?.message || 'Erreur réseau' }))
    } finally {
      setGenerating(prev => ({ ...prev, [toolId]: false }))
    }
  }

  if (loading || !config) {
    return <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 60 }}>Chargement...</div>
  }

  const domainClean = siteDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')

  return (
    <div>
      {/* En-tête + bouton sauvegarder sticky */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>🧰 Outils</h1>
          <div style={{ color: '#8B9CB0', fontSize: 13 }}>
            Outils interactifs (convertisseurs, calculateurs…) à mettre en ligne. Pour chaque outil tu choisis l'URL, le SEO, et le contenu rédactionnel généré sous l'outil.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', whiteSpace: 'nowrap' }}>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('✓') ? '#00D4AA' : '#FC8181' }}>{msg}</span>}
          <button onClick={save} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: saving ? '#1E2D3D' : 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: saving ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13 }}>
            {saving ? '⏳ Sauvegarde…' : '💾 Tout sauvegarder'}
          </button>
        </div>
      </div>

      {/* Réglage global : nom du menu */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Nom du menu affiché sur le site
        </div>
        <input
          value={config.menu_label}
          onChange={e => setConfig({ ...config, menu_label: e.target.value })}
          placeholder="Outils"
          style={{ width: '100%', maxWidth: 300, padding: '9px 13px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
        />
        <div style={{ fontSize: 11, color: '#4A5568', marginTop: 6 }}>
          Le menu n'apparaît dans la nav du site que si au moins un outil est activé.
        </div>
      </div>

      {/* Liste des outils */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {CATALOG.map(tool => {
          const state = config.outils[tool.id]
          const isActive = state?.active === true
          const isExpanded = expanded[tool.id] !== false  // ouvert par défaut
          const url = `https://${domainClean}/${state?.slug || tool.defaults.slug}`

          return (
            <div key={tool.id} style={{ background: '#0D1117', border: `1px solid ${isActive ? '#00D4AA44' : '#1E2D3D'}`, borderRadius: 12, overflow: 'hidden' }}>
              {/* Bandeau outil */}
              <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', borderBottom: isExpanded ? '1px solid #1E2D3D' : 'none' }}
                onClick={() => setExpanded(prev => ({ ...prev, [tool.id]: !isExpanded }))}>
                <span style={{ fontSize: 22 }}>{tool.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{tool.name}</div>
                  <div style={{ color: '#8B9CB0', fontSize: 12, marginTop: 2 }}>{tool.description}</div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={isActive} onChange={e => updateOutil(tool.id, { active: e.target.checked })}
                    style={{ width: 16, height: 16, accentColor: '#00D4AA', cursor: 'pointer' }} />
                  <span style={{ fontSize: 12, color: isActive ? '#00D4AA' : '#8B9CB0', fontWeight: 600 }}>
                    {isActive ? 'En ligne' : 'Hors ligne'}
                  </span>
                </label>
                <span style={{ color: '#8B9CB0', fontSize: 12 }}>{isExpanded ? '▾' : '▸'}</span>
              </div>

              {/* Corps éditable */}
              {isExpanded && state && (
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* URL */}
                  <Field label="Slug (URL)" hint={<span>URL finale : <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#0090FF', textDecoration: 'none' }}>{url} ↗</a></span>}>
                    <input value={state.slug}
                      onChange={e => updateOutil(tool.id, { slug: e.target.value })}
                      onBlur={e => updateOutil(tool.id, { slug: slugify(e.target.value) })}
                      style={inputStyle} placeholder={tool.defaults.slug} />
                  </Field>

                  {/* SEO */}
                  <SectionTitle>SEO</SectionTitle>
                  <Field label="Title (balise <title>)">
                    <input value={state.title} onChange={e => updateOutil(tool.id, { title: e.target.value })} style={inputStyle} />
                    <CharCount value={state.title} max={70} />
                  </Field>
                  <Field label="Meta description">
                    <textarea value={state.meta_description} onChange={e => updateOutil(tool.id, { meta_description: e.target.value })}
                      rows={2} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
                    <CharCount value={state.meta_description} max={160} />
                  </Field>
                  <Field label="H1 (affiché au-dessus de l'outil)">
                    <input value={state.h1} onChange={e => updateOutil(tool.id, { h1: e.target.value })} style={inputStyle} />
                  </Field>

                  {/* Contenu rédactionnel */}
                  <SectionTitle>Contenu rédactionnel (sous l'outil)</SectionTitle>
                  <Field label="Prompt IA" hint="Donne à Claude la consigne pour rédiger le contenu (ton, public cible, angle…)">
                    <textarea value={state.prompt_redaction} onChange={e => updateOutil(tool.id, { prompt_redaction: e.target.value })}
                      rows={4} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
                  </Field>
                  <Field label="Plan H2 (titres des sections)">
                    <StringList items={state.plan_h2} onChange={items => updateOutil(tool.id, { plan_h2: items })} placeholder="Ex: Comment calculer la TVA ?" />
                  </Field>
                  <Field label="Nombre de mots cible">
                    <input type="number" value={state.nb_mots} onChange={e => updateOutil(tool.id, { nb_mots: parseInt(e.target.value) || 0 })}
                      style={{ ...inputStyle, maxWidth: 160 }} min={300} max={5000} step={100} />
                  </Field>
                  <Field label="FAQ">
                    <FAQList items={state.faq} onChange={items => updateOutil(tool.id, { faq: items })} />
                  </Field>

                  {/* Génération IA */}
                  <div style={{ padding: '12px 14px', background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 12, color: '#8B9CB0' }}>
                      ✨ <strong style={{ color: '#fff' }}>Génération IA</strong> — Claude rédige le contenu HTML à partir du prompt, du plan, de la FAQ et du nb de mots.
                    </div>
                    <button onClick={() => generateContent(tool.id)} disabled={generating[tool.id]}
                      style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: generating[tool.id] ? '#1E2D3D' : 'linear-gradient(135deg, #7C3AED, #A78BFA)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: generating[tool.id] ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                      {generating[tool.id] ? '⏳ Génération…' : '✨ Générer'}
                    </button>
                  </div>
                  {genError[tool.id] && (
                    <div style={{ padding: '10px 14px', background: 'rgba(252,129,129,0.1)', border: '1px solid #FC818144', borderRadius: 8, fontSize: 12, color: '#FC8181' }}>
                      ✗ {genError[tool.id]}
                    </div>
                  )}

                  {/* Contenu généré (édition manuelle pour l'instant) */}
                  <Field label="Contenu généré (HTML)" hint="Le contenu qui s'affiche sous l'outil. Tu peux le coller manuellement, ou attendre la prochaine étape qui ajoute le bouton de génération IA.">
                    <textarea value={state.contenu_genere || ''} onChange={e => updateOutil(tool.id, { contenu_genere: e.target.value })}
                      rows={8} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
                      placeholder="<p>Le contenu HTML rédigé par l'IA apparaîtra ici, ou colle-le manuellement.</p>" />
                  </Field>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Composants utilitaires ──────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 13px', borderRadius: 8,
  background: '#0A0E1A', border: '1px solid #1E2D3D',
  color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box',
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {label}
      </div>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#4A5568', marginTop: 6, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: '#0090FF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 6, marginBottom: -8, borderTop: '1px solid #1E2D3D', paddingTop: 14 }}>
      {children}
    </div>
  )
}

function CharCount({ value, max }: { value: string; max: number }) {
  const n = value.length
  const color = n > max ? '#FC8181' : n > max * 0.9 ? '#F6AD55' : '#4A5568'
  return <div style={{ fontSize: 11, color, marginTop: 4, textAlign: 'right' }}>{n} / {max} caractères</div>
}

function StringList({ items, onChange, placeholder }: { items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: 6 }}>
          <input value={v} onChange={e => { const arr = [...items]; arr[i] = e.target.value; onChange(arr) }}
            style={{ ...inputStyle, flex: 1 }} placeholder={placeholder} />
          <button onClick={() => onChange(items.filter((_, j) => j !== i))}
            style={{ padding: '0 12px', borderRadius: 8, border: '1px solid #1E2D3D', background: 'transparent', color: '#FC8181', cursor: 'pointer', fontSize: 14 }}
            type="button">✕</button>
        </div>
      ))}
      <button onClick={() => onChange([...items, ''])}
        style={{ padding: '7px 14px', borderRadius: 8, border: '1px dashed #1E2D3D', background: 'transparent', color: '#8B9CB0', cursor: 'pointer', fontSize: 12, alignSelf: 'flex-start' }}
        type="button">+ Ajouter</button>
    </div>
  )
}

function FAQList({ items, onChange }: { items: FAQItem[]; onChange: (items: FAQItem[]) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, i) => (
        <div key={i} style={{ padding: 12, border: '1px solid #1E2D3D', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
          <input value={item.question}
            onChange={e => { const arr = [...items]; arr[i] = { ...arr[i], question: e.target.value }; onChange(arr) }}
            style={inputStyle} placeholder="Question…" />
          <textarea value={item.answer}
            onChange={e => { const arr = [...items]; arr[i] = { ...arr[i], answer: e.target.value }; onChange(arr) }}
            rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Réponse…" />
          <button onClick={() => onChange(items.filter((_, j) => j !== i))}
            style={{ position: 'absolute', top: 8, right: 8, padding: '2px 8px', borderRadius: 6, border: '1px solid #1E2D3D', background: 'transparent', color: '#FC8181', cursor: 'pointer', fontSize: 11 }}
            type="button">✕</button>
        </div>
      ))}
      <button onClick={() => onChange([...items, { question: '', answer: '' }])}
        style={{ padding: '7px 14px', borderRadius: 8, border: '1px dashed #1E2D3D', background: 'transparent', color: '#8B9CB0', cursor: 'pointer', fontSize: 12, alignSelf: 'flex-start' }}
        type="button">+ Ajouter une question</button>
    </div>
  )
}
