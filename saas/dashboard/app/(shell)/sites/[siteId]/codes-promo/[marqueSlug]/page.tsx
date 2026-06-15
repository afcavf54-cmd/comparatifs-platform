'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'

// ───────────────────────────────────────────────────────────────────────
// Types (dupliqués de lib/codes-promo.ts pour éviter import client)
// ───────────────────────────────────────────────────────────────────────
type CodePromoType = 'code' | 'offer'
type CodePromoUnite = '%' | '€' | ''
interface CodePromo {
  id: string; type: CodePromoType; valeur: number | null; unite: CodePromoUnite
  sous_type: string; accroche: string; code: string; detail: string
  expire_le: string; nb_utilisations: number; teste_par_sophie: string
  meilleure_remise: boolean; expired: boolean
}
interface BrandFaq { question: string; reponse: string }
interface BrandHistoryMonth { mois: string; valeur: number }
interface BrandRating { value: number; count: number }
interface Brand {
  marque: string; slug: string; categorie_marque?: string
  url_marchand?: string; url_affiliation?: string; logo_url?: string
  description_marque?: string; avis_sophie?: string; conseil_sophie?: string
  rating?: BrandRating; codes?: CodePromo[]; faq?: BrandFaq[]
  historique_12_mois?: BrandHistoryMonth[]; related_brands?: string[]
  status?: 'draft' | 'published'; meta_title?: string; meta_description?: string
  date_creation?: string; date_maj?: string; content_md: string; sha?: string
}
interface OtherBrandSummary { marque: string; slug: string; categorie_marque?: string }

const SOUS_TYPES = ['Code promo', 'Bon plan', 'Cashback', 'Livraison gratuite', 'Code étudiant', 'Première commande', 'Autre']
const MONTHS_FR = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

// ───────────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────────
const S = {
  shell: { padding: '0 0 80px', maxWidth: 1200, margin: '0 auto', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' } as React.CSSProperties,
  topBar: { position: 'sticky' as const, top: 0, background: '#fff', borderBottom: '1px solid #eee', padding: '14px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, zIndex: 50, flexWrap: 'wrap' as const },
  bcrumb: { fontSize: 13, color: '#666', display: 'flex', alignItems: 'center', gap: 8 },
  bcrumbLink: { color: '#666', textDecoration: 'none', cursor: 'pointer' },
  bcrumbCurrent: { color: '#1a1a1a', fontWeight: 600 },
  actions: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const },
  btn: { padding: '9px 16px', borderRadius: 8, border: '0', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 },
  btnPrimary: { background: '#00D4AA', color: '#fff' },
  btnGhost: { background: 'transparent', color: '#666', border: '1px solid #ddd' },
  btnDanger: { background: 'transparent', color: '#c00', border: '1px solid #fbb' },
  btnPub: { background: '#1a1a1a', color: '#fff' },
  badge: { display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.04em' },
  badgePub: { background: '#e6f7ef', color: '#16a065' },
  badgeDraft: { background: '#fff4e0', color: '#a76b00' },

  content: { padding: '32px 40px' } as React.CSSProperties,
  section: { background: '#fff', borderRadius: 12, padding: '24px 28px', marginBottom: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' } as React.CSSProperties,
  sectionTitle: { fontSize: 16, fontWeight: 700, marginBottom: 14, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 8 },
  sectionSub: { fontSize: 13, color: '#888', marginBottom: 16 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } as React.CSSProperties,
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 } as React.CSSProperties,
  field: { display: 'flex', flexDirection: 'column' as const, gap: 5 },
  label: { fontSize: 12, color: '#555', fontWeight: 600 },
  input: { padding: '9px 12px', border: '1px solid #ddd', borderRadius: 7, fontSize: 14, outline: 'none', fontFamily: 'inherit' } as React.CSSProperties,
  textarea: { padding: '10px 12px', border: '1px solid #ddd', borderRadius: 7, fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'vertical' as const, minHeight: 80 },
  select: { padding: '9px 12px', border: '1px solid #ddd', borderRadius: 7, fontSize: 14, outline: 'none', background: '#fff', cursor: 'pointer' },

  // Codes promo
  codeRow: { background: '#fafafa', border: '1px solid #eee', borderRadius: 10, padding: 14, marginBottom: 10 },
  codeRowExp: { opacity: 0.5 },
  codeRowBest: { borderColor: '#ffb1cc', background: '#fff8fb' },
  codeRowHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  codeRowMain: { display: 'grid', gridTemplateColumns: '90px 110px 140px 1fr 130px', gap: 10 } as React.CSSProperties,
  iconBtn: { background: 'transparent', border: '0', cursor: 'pointer', color: '#888', padding: 4, fontSize: 16, lineHeight: 1 },
  chipBtn: { padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, border: '1px solid #ddd', cursor: 'pointer', background: '#fff', color: '#666' },
  chipBtnActive: { background: '#1a1a1a', color: '#fff', borderColor: '#1a1a1a' },

  // FAQ
  faqRow: { background: '#fafafa', border: '1px solid #eee', borderRadius: 10, padding: 12, marginBottom: 8, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'flex-start' } as React.CSSProperties,

  // Historique
  historyGrid: { display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 8 } as React.CSSProperties,
  histCell: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4 },
  histInput: { width: '100%', padding: '6px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, textAlign: 'center' as const, outline: 'none' },

  // Related brands
  chipsRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 6, padding: 6, border: '1px solid #ddd', borderRadius: 7, minHeight: 38, alignItems: 'center' },
  chip: { background: '#fff5f8', color: '#cf2c61', padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 },
  chipX: { background: 'transparent', border: 0, cursor: 'pointer', color: '#cf2c61', fontWeight: 700, padding: 0, fontSize: 14, lineHeight: 1 },
  chipInput: { border: 0, outline: 'none', padding: '4px 6px', fontSize: 13, minWidth: 100, fontFamily: 'inherit', flex: 1 },
  suggList: { marginTop: 6, border: '1px solid #eee', borderRadius: 7, background: '#fff', maxHeight: 180, overflowY: 'auto' as const },
  suggItem: { padding: '7px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f5f5f5' },

  // Save bar (sticky bottom on dirty)
  saveBar: { position: 'fixed' as const, bottom: 0, left: 0, right: 0, background: '#1a1a1a', color: '#fff', padding: '14px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 20px rgba(0,0,0,0.15)', zIndex: 40 },

  errorBox: { background: '#fff5f5', color: '#c00', padding: '10px 14px', borderRadius: 8, border: '1px solid #fbb', fontSize: 13, marginBottom: 14 },
  successBox: { background: '#e6f7ef', color: '#16a065', padding: '10px 14px', borderRadius: 8, border: '1px solid #b8e6cd', fontSize: 13, marginBottom: 14 },

  empty: { textAlign: 'center' as const, padding: 60, color: '#888' },
}

// ───────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────
export default function CodesPromoEditPage() {
  const params = useParams<{ siteId: string; marqueSlug: string }>()
  const router = useRouter()
  const { siteId, marqueSlug } = params

  const [brand, setBrand] = useState<Brand | null>(null)
  const [original, setOriginal] = useState<string>('')   // snapshot JSON pour détecter dirty
  const [allBrands, setAllBrands] = useState<OtherBrandSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [siteDomain, setSiteDomain] = useState<string>('')

  // ── Load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [rBrand, rAll] = await Promise.all([
          fetch(`/api/sites/${siteId}/codes-promo/${marqueSlug}`, { cache: 'no-store' }),
          fetch(`/api/sites/${siteId}/codes-promo`, { cache: 'no-store' }),
        ])
        if (!rBrand.ok) {
          const e = await rBrand.json().catch(() => ({}))
          throw new Error(e.error || `HTTP ${rBrand.status}`)
        }
        const data = await rBrand.json()
        const all = rAll.ok ? await rAll.json() : { brands: [] }
        if (cancelled) return
        setBrand(data.brand)
        setOriginal(JSON.stringify(data.brand))
        setSiteDomain((data.site?.domain || '').trim())
        setAllBrands(Array.isArray(all.brands)
          ? all.brands.filter((b: any) => b.slug !== marqueSlug).map((b: any) => ({
              marque: b.marque, slug: b.slug, categorie_marque: b.categorie_marque || ''
            }))
          : [])
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Chargement échoué')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [siteId, marqueSlug])

  const dirty = brand !== null && JSON.stringify(brand) !== original

  // ── Helpers de mutation (immutables) ─────────────────────────────────
  function update<K extends keyof Brand>(key: K, value: Brand[K]) {
    if (!brand) return
    setBrand({ ...brand, [key]: value })
  }
  function updateCode(idx: number, patch: Partial<CodePromo>) {
    if (!brand) return
    const codes = [...(brand.codes || [])]
    codes[idx] = { ...codes[idx], ...patch }
    setBrand({ ...brand, codes })
  }
  function addCode(type: CodePromoType = 'code') {
    if (!brand) return
    const newCode: CodePromo = {
      id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      type, valeur: null, unite: '%',
      sous_type: type === 'code' ? 'Code promo' : 'Bon plan',
      accroche: '', code: '', detail: '',
      expire_le: '', nb_utilisations: 0, teste_par_sophie: '',
      meilleure_remise: false, expired: false,
    }
    setBrand({ ...brand, codes: [...(brand.codes || []), newCode] })
  }
  function removeCode(idx: number) {
    if (!brand) return
    if (!confirm('Supprimer ce code ?')) return
    const codes = [...(brand.codes || [])]
    codes.splice(idx, 1)
    setBrand({ ...brand, codes })
  }
  function moveCode(idx: number, dir: -1 | 1) {
    if (!brand) return
    const codes = [...(brand.codes || [])]
    const j = idx + dir
    if (j < 0 || j >= codes.length) return
    ;[codes[idx], codes[j]] = [codes[j], codes[idx]]
    setBrand({ ...brand, codes })
  }
  function updateFaq(idx: number, patch: Partial<BrandFaq>) {
    if (!brand) return
    const faq = [...(brand.faq || [])]
    faq[idx] = { ...faq[idx], ...patch }
    setBrand({ ...brand, faq })
  }
  function addFaq() {
    if (!brand) return
    setBrand({ ...brand, faq: [...(brand.faq || []), { question: '', reponse: '' }] })
  }
  function removeFaq(idx: number) {
    if (!brand) return
    const faq = [...(brand.faq || [])]
    faq.splice(idx, 1)
    setBrand({ ...brand, faq })
  }
  function updateHistory(idx: number, valeur: number) {
    if (!brand) return
    const hist = [...(brand.historique_12_mois || [])]
    if (hist[idx]) hist[idx] = { ...hist[idx], valeur }
    setBrand({ ...brand, historique_12_mois: hist })
  }

  // ── Related brands chips ─────────────────────────────────────────────
  const [relInput, setRelInput] = useState('')
  function addRelated(slug: string) {
    if (!brand) return
    if ((brand.related_brands || []).includes(slug)) return
    setBrand({ ...brand, related_brands: [...(brand.related_brands || []), slug] })
    setRelInput('')
  }
  function removeRelated(slug: string) {
    if (!brand) return
    setBrand({ ...brand, related_brands: (brand.related_brands || []).filter(s => s !== slug) })
  }
  const relSuggestions = allBrands
    .filter(b => !(brand?.related_brands || []).includes(b.slug))
    .filter(b => !relInput.trim() || b.marque.toLowerCase().includes(relInput.toLowerCase().trim()))
    .slice(0, 8)

  // ── Save ─────────────────────────────────────────────────────────────
  async function save(newStatus?: 'draft' | 'published') {
    if (!brand) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(null)
    const body = { ...brand }
    if (newStatus) body.status = newStatus
    try {
      const r = await fetch(`/api/sites/${siteId}/codes-promo/${marqueSlug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
      setBrand(body)
      setOriginal(JSON.stringify(body))
      setSaveSuccess(newStatus === 'published' ? 'Marque publiée ✓'
                  : newStatus === 'draft' ? 'Marque dépubliée ✓'
                  : 'Modifications enregistrées ✓')
      // Si le slug a changé, rediriger
      if (data.slug && data.slug !== marqueSlug) {
        router.replace(`/sites/${siteId}/codes-promo/${data.slug}`)
      }
      setTimeout(() => setSaveSuccess(null), 3000)
    } catch (e: any) {
      setSaveError(e?.message || 'Sauvegarde échouée')
    } finally {
      setSaving(false)
    }
  }

  async function doDelete() {
    if (!brand) return
    if (!confirm(`Supprimer définitivement la marque "${brand.marque}" ?\nCette action est irréversible.`)) return
    setSaving(true)
    try {
      const r = await fetch(`/api/sites/${siteId}/codes-promo/${marqueSlug}`, { method: 'DELETE' })
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        throw new Error(e.error || `HTTP ${r.status}`)
      }
      router.push(`/sites/${siteId}/codes-promo`)
    } catch (e: any) {
      setSaveError(e?.message || 'Suppression échouée')
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────
  if (loading) return <div style={S.empty}>Chargement…</div>
  if (error) return <div style={S.empty}><div style={{ color: '#c00' }}>⚠ {error}</div></div>
  if (!brand) return <div style={S.empty}>Marque introuvable.</div>

  const previewUrl = siteDomain ? `https://${siteDomain}/codes-promo/${brand.slug}/` : ''

  return (
    <div style={S.shell}>
      {/* ── Top bar sticky ──────────────────────────────────────────── */}
      <div style={S.topBar}>
        <div style={S.bcrumb}>
          <span style={S.bcrumbLink} onClick={() => router.push(`/sites/${siteId}`)}>{siteId}</span>
          <span>›</span>
          <span style={S.bcrumbLink} onClick={() => router.push(`/sites/${siteId}/codes-promo`)}>Codes promo</span>
          <span>›</span>
          <span style={S.bcrumbCurrent}>{brand.marque}</span>
          <span style={{ ...S.badge, marginLeft: 10, ...(brand.status === 'published' ? S.badgePub : S.badgeDraft) }}>
            {brand.status === 'published' ? 'Publié' : 'Brouillon'}
          </span>
        </div>
        <div style={S.actions}>
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ ...S.btn, ...S.btnGhost, textDecoration: 'none' }}>
              ↗ Voir en ligne
            </a>
          )}
          <button
            style={{ ...S.btn, ...S.btnGhost, opacity: 0.6 }}
            title="Disponible en vague C (génération IA)"
            disabled
          >
            ✨ Générer le contenu
          </button>
          {brand.status === 'draft' ? (
            <button style={{ ...S.btn, ...S.btnPub }} onClick={() => save('published')} disabled={saving}>
              Publier
            </button>
          ) : (
            <button style={{ ...S.btn, ...S.btnGhost }} onClick={() => save('draft')} disabled={saving}>
              Dépublier
            </button>
          )}
          <button style={{ ...S.btn, ...S.btnPrimary, opacity: dirty ? 1 : 0.5 }} onClick={() => save()} disabled={!dirty || saving}>
            {saving ? 'Sauvegarde…' : 'Enregistrer'}
          </button>
          <button style={{ ...S.btn, ...S.btnDanger }} onClick={doDelete} disabled={saving}>
            🗑
          </button>
        </div>
      </div>

      <div style={S.content}>
        {saveError && <div style={S.errorBox}>⚠ {saveError}</div>}
        {saveSuccess && <div style={S.successBox}>{saveSuccess}</div>}

        {/* ── INFOS GÉNÉRALES ──────────────────────────────────────── */}
        <div style={S.section}>
          <div style={S.sectionTitle}>📋 Infos générales</div>
          <div style={S.grid2}>
            <div style={S.field}>
              <label style={S.label}>Nom de la marque *</label>
              <input style={S.input} value={brand.marque} onChange={e => update('marque', e.target.value)} />
            </div>
            <div style={S.field}>
              <label style={S.label}>Slug (URL : /codes-promo/<b>{brand.slug}</b>/)</label>
              <input style={S.input} value={brand.slug} onChange={e => update('slug', e.target.value)} />
            </div>
            <div style={S.field}>
              <label style={S.label}>Catégorie de marque</label>
              <input style={S.input} value={brand.categorie_marque || ''} onChange={e => update('categorie_marque', e.target.value)} placeholder="Mode, Beauté, Tech, Voyage…" />
            </div>
            <div style={S.field}>
              <label style={S.label}>URL marchand (sans affiliation)</label>
              <input style={S.input} value={brand.url_marchand || ''} onChange={e => update('url_marchand', e.target.value)} placeholder="https://www.shein.com" />
            </div>
            <div style={{ ...S.field, gridColumn: 'span 2' }}>
              <label style={S.label}>URL d'affiliation (utilisée par tous les CTAs)</label>
              <input style={S.input} value={brand.url_affiliation || ''} onChange={e => update('url_affiliation', e.target.value)} placeholder="https://www.shein.com/?ref=…" />
            </div>
            <div style={{ ...S.field, gridColumn: 'span 2' }}>
              <label style={S.label}>URL du logo</label>
              <input style={S.input} value={brand.logo_url || ''} onChange={e => update('logo_url', e.target.value)} placeholder="/codes-promo/shein/logo.png ou https://…" />
            </div>
            <div style={{ ...S.field, gridColumn: 'span 2' }}>
              <label style={S.label}>Description de la marque (sidebar "Qu'est-ce que…")</label>
              <textarea style={S.textarea} rows={3} value={brand.description_marque || ''} onChange={e => update('description_marque', e.target.value)} placeholder="Présente la marque en 2-3 phrases." />
            </div>
            <div style={S.field}>
              <label style={S.label}>Meta title (SEO)</label>
              <input style={S.input} value={brand.meta_title || ''} onChange={e => update('meta_title', e.target.value)} placeholder={`Codes promo ${brand.marque} — <mois> | <site>`} />
            </div>
            <div style={S.field}>
              <label style={S.label}>Meta description (SEO)</label>
              <input style={S.input} value={brand.meta_description || ''} onChange={e => update('meta_description', e.target.value)} placeholder="Résumé de la page pour Google." />
            </div>
          </div>
        </div>

        {/* ── RATING ────────────────────────────────────────────────── */}
        <div style={S.section}>
          <div style={S.sectionTitle}>⭐ Note globale (AggregateRating)</div>
          <div style={S.sectionSub}>Note affichée dans la bannière rating et envoyée à Google pour les étoiles dans les SERP.</div>
          <div style={S.grid2}>
            <div style={S.field}>
              <label style={S.label}>Note sur 5</label>
              <input type="number" min={0} max={5} step={0.1} style={S.input}
                value={brand.rating?.value ?? 0}
                onChange={e => update('rating', { ...(brand.rating || { value: 0, count: 0 }), value: parseFloat(e.target.value) || 0 })} />
            </div>
            <div style={S.field}>
              <label style={S.label}>Nombre de votes</label>
              <input type="number" min={0} step={1} style={S.input}
                value={brand.rating?.count ?? 0}
                onChange={e => update('rating', { ...(brand.rating || { value: 0, count: 0 }), count: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
        </div>

        {/* ── CODES PROMO ───────────────────────────────────────────── */}
        <div style={S.section}>
          <div style={S.sectionTitle}>🏷️ Codes promo & offres</div>
          <div style={S.sectionSub}>
            Chaque code/offre apparaît dans une card sur la page. Les codes expirés sont déplacés dans une section dédiée en bas de la page.
          </div>

          {(brand.codes || []).map((c, idx) => (
            <div key={c.id || idx} style={{
              ...S.codeRow,
              ...(c.expired ? S.codeRowExp : {}),
              ...(c.meilleure_remise ? S.codeRowBest : {}),
            }}>
              <div style={S.codeRowHeader}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button style={{ ...S.chipBtn, ...(c.type === 'code' ? S.chipBtnActive : {}) }} onClick={() => updateCode(idx, { type: 'code' })}>Code promo</button>
                  <button style={{ ...S.chipBtn, ...(c.type === 'offer' ? S.chipBtnActive : {}) }} onClick={() => updateCode(idx, { type: 'offer', code: '' })}>Offre (sans code)</button>
                  <label style={{ marginLeft: 12, fontSize: 12, color: '#666', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={c.meilleure_remise} onChange={e => updateCode(idx, { meilleure_remise: e.target.checked })} />
                    Meilleure remise
                  </label>
                  <label style={{ marginLeft: 12, fontSize: 12, color: '#666', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={c.expired} onChange={e => updateCode(idx, { expired: e.target.checked })} />
                    Expiré
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={S.iconBtn} onClick={() => moveCode(idx, -1)} disabled={idx === 0} title="Monter">↑</button>
                  <button style={S.iconBtn} onClick={() => moveCode(idx, 1)} disabled={idx === (brand.codes || []).length - 1} title="Descendre">↓</button>
                  <button style={{ ...S.iconBtn, color: '#c00' }} onClick={() => removeCode(idx)} title="Supprimer">🗑</button>
                </div>
              </div>
              <div style={S.codeRowMain}>
                <div style={S.field}>
                  <label style={S.label}>Valeur</label>
                  <input type="number" step="any" style={S.input}
                    value={c.valeur ?? ''}
                    onChange={e => updateCode(idx, { valeur: e.target.value === '' ? null : parseFloat(e.target.value) })} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Unité</label>
                  <select style={S.select} value={c.unite} onChange={e => updateCode(idx, { unite: e.target.value as CodePromoUnite })}>
                    <option value="%">%</option>
                    <option value="€">€</option>
                    <option value="">(aucune)</option>
                  </select>
                </div>
                <div style={S.field}>
                  <label style={S.label}>Type d'offre</label>
                  <select style={S.select} value={c.sous_type} onChange={e => updateCode(idx, { sous_type: e.target.value })}>
                    {SOUS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={S.field}>
                  <label style={S.label}>Accroche (titre de la card) *</label>
                  <input style={S.input} value={c.accroche} onChange={e => updateCode(idx, { accroche: e.target.value })} placeholder="30% de réduction dès 65€ d'achat" />
                </div>
                <div style={S.field}>
                  <label style={S.label}>{c.type === 'code' ? 'Code à révéler *' : 'Code (vide pour offre)'}</label>
                  <input style={S.input} value={c.code} onChange={e => updateCode(idx, { code: e.target.value.toUpperCase() })} placeholder={c.type === 'code' ? 'GIFT30' : ''} disabled={c.type === 'offer'} />
                </div>
              </div>
              <div style={{ ...S.field, marginTop: 10 }}>
                <label style={S.label}>Détail (texte de l'accordéon "Afficher le détail")</label>
                <textarea style={{ ...S.textarea, minHeight: 60 }} rows={3} value={c.detail} onChange={e => updateCode(idx, { detail: e.target.value })} placeholder="Conditions, montant min, exclusions… Une ligne par bullet précédée d'un tiret." />
              </div>
              <div style={{ ...S.grid3, marginTop: 10 }}>
                <div style={S.field}>
                  <label style={S.label}>Date d'expiration</label>
                  <input type="date" style={S.input} value={c.expire_le} onChange={e => updateCode(idx, { expire_le: e.target.value })} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Nb d'utilisations (affiché)</label>
                  <input type="number" min={0} style={S.input} value={c.nb_utilisations} onChange={e => updateCode(idx, { nb_utilisations: parseInt(e.target.value) || 0 })} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Testé par {brand.marque} (optionnel)</label>
                  <input style={S.input} value={c.teste_par_sophie} onChange={e => updateCode(idx, { teste_par_sophie: e.target.value })} placeholder="Testé par Sophie le 15 juin 2026 sur un panier de 72€" />
                </div>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={{ ...S.btn, ...S.btnGhost }} onClick={() => addCode('code')}>+ Ajouter un code promo</button>
            <button style={{ ...S.btn, ...S.btnGhost }} onClick={() => addCode('offer')}>+ Ajouter une offre (sans code)</button>
          </div>
        </div>

        {/* ── AVIS & CONSEIL DE SOPHIE ──────────────────────────────── */}
        <div style={S.section}>
          <div style={S.sectionTitle}>📝 L'avis & le conseil de Sophie</div>
          <div style={S.sectionSub}>L'avis apparaît dans la sidebar avec la photo. Le conseil dans une 2ème card "💡 Le conseil de Sophie".</div>
          <div style={S.field}>
            <label style={S.label}>Avis de Sophie</label>
            <textarea style={S.textarea} rows={4} value={brand.avis_sophie || ''} onChange={e => update('avis_sophie', e.target.value)} placeholder={`J'ai rassemblé et testé pour toi les meilleurs codes promo ${brand.marque}…`} />
          </div>
          <div style={{ ...S.field, marginTop: 12 }}>
            <label style={S.label}>Conseil de Sophie (astuce)</label>
            <textarea style={S.textarea} rows={3} value={brand.conseil_sophie || ''} onChange={e => update('conseil_sophie', e.target.value)} placeholder="Un conseil pour économiser plus, un timing à connaître, etc." />
          </div>
        </div>

        {/* ── FAQ ────────────────────────────────────────────────────── */}
        <div style={S.section}>
          <div style={S.sectionTitle}>❓ Foire aux questions</div>
          <div style={S.sectionSub}>Au moins 2 questions pour générer le schéma FAQPage (étoiles SERP).</div>
          {(brand.faq || []).map((q, idx) => (
            <div key={idx} style={S.faqRow}>
              <input style={S.input} value={q.question} onChange={e => updateFaq(idx, { question: e.target.value })} placeholder="Question" />
              <textarea style={{ ...S.textarea, minHeight: 38 }} rows={2} value={q.reponse} onChange={e => updateFaq(idx, { reponse: e.target.value })} placeholder="Réponse" />
              <button style={{ ...S.iconBtn, color: '#c00' }} onClick={() => removeFaq(idx)}>🗑</button>
            </div>
          ))}
          <button style={{ ...S.btn, ...S.btnGhost, marginTop: 8 }} onClick={addFaq}>+ Ajouter une question</button>
        </div>

        {/* ── HISTORIQUE 12 MOIS ──────────────────────────────────── */}
        <div style={S.section}>
          <div style={S.sectionTitle}>📊 Historique des remises (12 derniers mois)</div>
          <div style={S.sectionSub}>La meilleure remise disponible chaque mois sur les 12 derniers mois (en %). Utilisé pour le mini-graphique.</div>
          <div style={S.historyGrid}>
            {(brand.historique_12_mois || []).map((h, idx) => {
              const [year, month] = h.mois.split('-')
              const label = `${MONTHS_FR[parseInt(month)]} ${year.slice(2)}`
              return (
                <div key={h.mois} style={S.histCell}>
                  <input
                    type="number" min={0} max={100} step={1}
                    style={S.histInput}
                    value={h.valeur}
                    onChange={e => updateHistory(idx, parseInt(e.target.value) || 0)}
                  />
                  <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── MARQUES SIMILAIRES ──────────────────────────────────── */}
        <div style={S.section}>
          <div style={S.sectionTitle}>🔗 Marques similaires (bandeau bas de page)</div>
          <div style={S.sectionSub}>
            Si vide, on prend automatiquement 8 marques de la même catégorie "{brand.categorie_marque || '<définis une catégorie>'}", figées au 1er rendu.
            Ajoute des marques pour overrider la sélection automatique.
          </div>

          <div style={S.chipsRow}>
            {(brand.related_brands || []).map(slug => {
              const ref = allBrands.find(b => b.slug === slug)
              return (
                <span key={slug} style={S.chip}>
                  {ref ? ref.marque : slug}
                  <button style={S.chipX} onClick={() => removeRelated(slug)}>×</button>
                </span>
              )
            })}
            <input
              style={S.chipInput}
              value={relInput}
              onChange={e => setRelInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const match = relSuggestions[0]
                  if (match) addRelated(match.slug)
                }
              }}
              placeholder={(brand.related_brands || []).length === 0 ? 'Tape pour rechercher une autre marque…' : ''}
            />
          </div>
          {relInput.trim() && relSuggestions.length > 0 && (
            <div style={S.suggList}>
              {relSuggestions.map(b => (
                <div key={b.slug} style={S.suggItem}
                  onClick={() => addRelated(b.slug)}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <b>{b.marque}</b>
                  {b.categorie_marque && <span style={{ color: '#888', marginLeft: 8 }}>· {b.categorie_marque}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── CONTENU RÉDIGÉ ─────────────────────────────────────── */}
        <div style={S.section}>
          <div style={S.sectionTitle}>📄 Contenu rédigé ("Comment utiliser un code promo {brand.marque}")</div>
          <div style={S.sectionSub}>
            Texte affiché entre les codes et l'historique. En vague C ce contenu sera généré par IA. En attendant, tu peux écrire en markdown (## Étape 1, etc.).
          </div>
          <textarea
            style={{ ...S.textarea, minHeight: 280, fontFamily: 'ui-monospace,SFMono-Regular,Consolas,monospace', fontSize: 13 }}
            value={brand.content_md}
            onChange={e => update('content_md', e.target.value)}
            placeholder={`## Étape 1\nRepère le code…\n\n## Étape 2\n…`}
          />
        </div>
      </div>

      {/* ── Save bar sticky bottom (apparaît si dirty) ────────────── */}
      {dirty && (
        <div style={S.saveBar}>
          <span>● Modifications non enregistrées</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={{ ...S.btn, background: 'transparent', color: '#fff', border: '1px solid #555' }}
              onClick={() => {
                if (!confirm('Annuler toutes les modifications non enregistrées ?')) return
                setBrand(JSON.parse(original))
              }}
            >
              Annuler
            </button>
            <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => save()} disabled={saving}>
              {saving ? 'Sauvegarde…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
