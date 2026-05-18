'use client'
import { useEffect, useState, use } from 'react'
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
// Choix d'UI : page dédiée plutôt que modal, car beaucoup de champs avec
// listes éditables (tarifs, FAQ, points). Une page scrollable reste plus
// confortable et autorise le copier-coller multi-écran.

type Tarif = { nom: string; prix: string; features: string }
type FaqItem = { q: string; r: string }
type H2 = { titre: string; contenu_html: string }
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
  en_bref?: string
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
  link_anchors?: LinkAnchor[]
  mot_minimum?: number
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
  const [msg, setMsg] = useState<string>('')

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

  // ── Styles partagés (sobres, cohérents avec le reste du dashboard) ──
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }
  const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }
  const sectionStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: 20, marginBottom: 20 }
  const h2Style: React.CSSProperties = { margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#222' }

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
        <div>
          <label style={labelStyle}>Cible visée</label>
          <input style={inputStyle} value={avis.cible || ''} onChange={e => upd({ cible: e.target.value })}
                 placeholder="Ex: indépendants et TPE qui veulent simplifier leur comptabilité" />
        </div>
      </div>

      {/* ── EN BREF + H1 ───────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Hero (titre + résumé)</h2>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Titre H1</label>
          <input style={inputStyle} value={avis.h1 || ''} onChange={e => upd({ h1: e.target.value })}
                 placeholder={`Avis ${avis.marque || 'Marque'} (2026) : ...`} />
        </div>
        <div>
          <label style={labelStyle}>Résumé « En bref »</label>
          <textarea style={textareaStyle} value={avis.en_bref || ''} onChange={e => upd({ en_bref: e.target.value })} />
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

      {/* ── H2 ANALYSE ─────────────────────────────────────────────── */}
      {(['h2_fonctionnalites', 'h2_support', 'h2_qualite_prix', 'h2_avis_clients'] as const).map(key => (
        <div style={sectionStyle} key={key}>
          <h2 style={h2Style}>{({
            h2_fonctionnalites: 'Section : Fonctionnalités',
            h2_support: 'Section : Support client',
            h2_qualite_prix: 'Section : Qualité-prix',
            h2_avis_clients: 'Section : Avis clients',
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

      {/* ── TRUSTPILOT ─────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Preuve sociale (Trustpilot ou autre)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Note externe (/5)</label>
            <input style={inputStyle} type="number" min="0" max="5" step="0.1" value={avis.note_trustpilot ?? ''}
                   onChange={e => upd({ note_trustpilot: e.target.value ? parseFloat(e.target.value) : '' })} />
          </div>
          <div>
            <label style={labelStyle}>Nombre d'avis</label>
            <input style={inputStyle} type="number" min="0" value={avis.nb_avis_trustpilot ?? ''}
                   onChange={e => upd({ nb_avis_trustpilot: e.target.value ? parseInt(e.target.value) : '' })} />
          </div>
          <div>
            <label style={labelStyle}>Plateforme</label>
            <input style={inputStyle} value={avis.plateforme_avis || ''} onChange={e => upd({ plateforme_avis: e.target.value })} placeholder="Trustpilot" />
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
      <div style={{ position: 'sticky', bottom: 0, background: '#fafafa', borderTop: '1px solid #ddd', padding: 16, margin: '20px -24px -24px', display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={save} disabled={saving}
                style={{ background: '#000', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Sauvegarde…' : '💾 Enregistrer'}
        </button>
        <button onClick={remove} style={{ background: 'transparent', color: '#c00', border: '1px solid #c00', padding: '10px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
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
