'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────
type CodePromoType = 'code' | 'offer'
type CodePromoUnite = '%' | '€' | ''
interface CodePromo {
  id: string; type: CodePromoType; valeur: number | null; unite: CodePromoUnite
  sous_type: string; accroche: string; code: string; detail: string
  expire_le: string; nb_utilisations: number; teste_par_sophie: string
  meilleure_remise: boolean; expired: boolean
  cta_text?: string  // Override du texte du bouton CTA (sinon défaut selon type)
}
interface BrandFaq { question: string; reponse: string }
interface BrandHistoryMonth { mois: string; valeur: number }
interface BrandRating { value: number; count: number }
interface Brand {
  marque: string; slug: string; categorie_marque?: string
  url_marchand?: string; url_affiliation?: string; logo_url?: string
  description_marque?: string; avis_sophie?: string; conseil_sophie?: string
  rating?: BrandRating; codes?: CodePromo[]; faq?: BrandFaq[]
  historique_12_mois?: BrandHistoryMonth[]
  historique_unite?: '%' | '€'   // unité globale du mini-graphique
  related_brands?: string[]
  status?: 'draft' | 'published'; meta_title?: string; meta_description?: string
  h1_custom?: string  // H1 perso supportant les variables {marque}, {mois}, etc.
  date_creation?: string; date_maj?: string
  content_md: string; content_libre?: string  // ← nouveau champ bloc libre HTML
  sha?: string
}
interface OtherBrandSummary { marque: string; slug: string; categorie_marque?: string }

// Config d'un bloc générable côté serveur (récupérée via GET /generate-block)
interface BlockCfg {
  defaultWords: number; minWords: number; maxWords: number
  allowsCustomPrompt: boolean; outputFormat: 'html' | 'prose' | 'json'
}

const SOUS_TYPES = ['Code promo', 'Parrainage', 'Bon plan', 'Cashback', 'Livraison gratuite', 'Code étudiant', 'Première commande', 'Autre']
const MONTHS_FR = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

// Labels humains des blocs (pour la modale, les messages, etc.)
const BLOCK_LABELS: Record<string, string> = {
  description_marque: 'Description de la marque',
  avis_sophie: "L'avis de Sophie",
  conseil_sophie: 'Le conseil de Sophie',
  faq: 'Foire aux questions (4 Q/R)',
  content_md: 'Comment utiliser un code promo (4 étapes)',
  content_libre: 'Contenu libre (sous l\'historique)',
}

// Fallback config si le GET échoue ou n'est pas encore arrivé. Aligné avec
// les valeurs du serveur (cf BLOCKS dans generate-block/route.ts).
const FALLBACK_BLOCK_CFG: Record<string, BlockCfg> = {
  description_marque: { defaultWords: 50, minWords: 30, maxWords: 120, allowsCustomPrompt: false, outputFormat: 'prose' },
  avis_sophie:        { defaultWords: 120, minWords: 80, maxWords: 250, allowsCustomPrompt: false, outputFormat: 'prose' },
  conseil_sophie:     { defaultWords: 50, minWords: 30, maxWords: 120, allowsCustomPrompt: false, outputFormat: 'prose' },
  faq:                { defaultWords: 200, minWords: 120, maxWords: 400, allowsCustomPrompt: false, outputFormat: 'json' },
  content_md:         { defaultWords: 400, minWords: 250, maxWords: 800, allowsCustomPrompt: true, outputFormat: 'html' },
  content_libre:      { defaultWords: 300, minWords: 100, maxWords: 1200, allowsCustomPrompt: true, outputFormat: 'html' },
}

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
  // Label avec slot à droite pour le bouton générer
  labelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } as React.CSSProperties,
  label: { fontSize: 12, color: '#555', fontWeight: 600 },
  input: { padding: '9px 12px', border: '1px solid #ddd', borderRadius: 7, fontSize: 14, outline: 'none', fontFamily: 'inherit' } as React.CSSProperties,
  textarea: { padding: '10px 12px', border: '1px solid #ddd', borderRadius: 7, fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'vertical' as const, minHeight: 80 },
  select: { padding: '9px 12px', border: '1px solid #ddd', borderRadius: 7, fontSize: 14, outline: 'none', background: '#fff', cursor: 'pointer' },
  codeRow: { background: '#fafafa', border: '1px solid #eee', borderRadius: 10, padding: 14, marginBottom: 10 },
  codeRowExp: { opacity: 0.5 },
  codeRowBest: { borderColor: '#ffb1cc', background: '#fff8fb' },
  codeRowHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  codeRowMain: { display: 'grid', gridTemplateColumns: '90px 110px 140px 1fr 130px', gap: 10 } as React.CSSProperties,
  iconBtn: { background: 'transparent', border: '0', cursor: 'pointer', color: '#888', padding: 4, fontSize: 16, lineHeight: 1 },
  chipBtn: { padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, border: '1px solid #ddd', cursor: 'pointer', background: '#fff', color: '#666' },
  chipBtnActive: { background: '#1a1a1a', color: '#fff', borderColor: '#1a1a1a' },
  faqRow: { background: '#fafafa', border: '1px solid #eee', borderRadius: 10, padding: 12, marginBottom: 8, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'flex-start' } as React.CSSProperties,
  historyGrid: { display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 8 } as React.CSSProperties,
  histCell: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4 },
  histInput: { width: '100%', padding: '6px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, textAlign: 'center' as const, outline: 'none' },
  chipsRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 6, padding: 6, border: '1px solid #ddd', borderRadius: 7, minHeight: 38, alignItems: 'center' },
  chip: { background: '#fff5f8', color: '#cf2c61', padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 },
  chipX: { background: 'transparent', border: 0, cursor: 'pointer', color: '#cf2c61', fontWeight: 700, padding: 0, fontSize: 14, lineHeight: 1 },
  chipInput: { border: 0, outline: 'none', padding: '4px 6px', fontSize: 13, minWidth: 100, fontFamily: 'inherit', flex: 1 },
  suggList: { marginTop: 6, border: '1px solid #eee', borderRadius: 7, background: '#fff', maxHeight: 180, overflowY: 'auto' as const },
  suggItem: { padding: '7px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f5f5f5' },
  saveBar: { position: 'fixed' as const, bottom: 0, left: 0, right: 0, background: '#1a1a1a', color: '#fff', padding: '14px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 20px rgba(0,0,0,0.15)', zIndex: 40 },
  errorBox: { background: '#fff5f5', color: '#c00', padding: '10px 14px', borderRadius: 8, border: '1px solid #fbb', fontSize: 13, marginBottom: 14 },
  successBox: { background: '#e6f7ef', color: '#16a065', padding: '10px 14px', borderRadius: 8, border: '1px solid #b8e6cd', fontSize: 13, marginBottom: 14 },
  empty: { textAlign: 'center' as const, padding: 60, color: '#888' },
  // Bouton générer — gradient distinct pour le différencier des autres
  btnGen: { background: 'linear-gradient(135deg, #7C3AED, #00D4AA)', color: '#fff', padding: '6px 12px', borderRadius: 7, border: 0, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 },
  btnGenDisabled: { background: '#ccc', cursor: 'wait' },
  wordsInput: { width: 64, padding: '5px 7px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, textAlign: 'center' as const, outline: 'none' },
}

// ───────────────────────────────────────────────────────────────────────
// Component principal
// ───────────────────────────────────────────────────────────────────────
export default function CodesPromoEditPage() {
  const params = useParams<{ siteId: string; marqueSlug: string }>()
  const router = useRouter()
  const { siteId, marqueSlug } = params

  const [brand, setBrand] = useState<Brand | null>(null)
  const [original, setOriginal] = useState<string>('')
  const [allBrands, setAllBrands] = useState<OtherBrandSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [siteDomain, setSiteDomain] = useState<string>('')

  // ── Upload logo ──────────────────────────────────────────────────────
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // ── Génération bloc par bloc (système V2) ────────────────────────────
  // Chaque bloc éditorial a son propre bouton "✨ Générer" + input mots.
  // Le résultat ouvre une modale d'aperçu qu'on peut appliquer ou régénérer.
  const [blockGenerating, setBlockGenerating] = useState<string | null>(null)
  const [blockGenerateError, setBlockGenerateError] = useState<string | null>(null)
  const [blockModal, setBlockModal] = useState<null | {
    blockType: string
    content: any           // string pour la plupart, array pour faq
    nWords: number
    customPrompt: string
  }>(null)
  const [blockConfig, setBlockConfig] = useState<Record<string, BlockCfg>>(FALLBACK_BLOCK_CFG)

  // Prompts custom (uniquement pour blocs content_md et content_libre).
  // Le custom_prompt N'EST PAS sauvegardé côté serveur — c'est un état local
  // qui sert juste à mémoriser ce que tu as tapé pendant ta session.
  const [customPrompt5, setCustomPrompt5] = useState('')  // content_md
  const [customPrompt6, setCustomPrompt6] = useState('')  // content_libre

  // Nombre de mots configuré par l'utilisateur, par bloc. Init = defaultWords.
  const [wordsByBlock, setWordsByBlock] = useState<Record<string, number>>({})

  // ── Load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const [rBrand, rAll, rCfg] = await Promise.all([
          fetch(`/api/sites/${siteId}/codes-promo/${marqueSlug}`, { cache: 'no-store' }),
          fetch(`/api/sites/${siteId}/codes-promo`, { cache: 'no-store' }),
          // Charge la config des blocs depuis la route (défaultWords/min/max).
          // Si échec, on garde FALLBACK_BLOCK_CFG initialisé en state.
          fetch(`/api/sites/${siteId}/codes-promo/${marqueSlug}/generate-block`, { cache: 'no-store' }).catch(() => null),
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
        // Config blocs (silent fallback si la route répond mal)
        if (rCfg && rCfg.ok) {
          try {
            const cfgData = await rCfg.json()
            if (cfgData?.blocks && typeof cfgData.blocks === 'object') {
              setBlockConfig({ ...FALLBACK_BLOCK_CFG, ...cfgData.blocks })
            }
          } catch { /* fallback déjà en place */ }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Chargement échoué')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [siteId, marqueSlug])

  // Initialiser wordsByBlock dès que blockConfig est chargé
  useEffect(() => {
    setWordsByBlock(prev => {
      const next = { ...prev }
      for (const [k, v] of Object.entries(blockConfig)) {
        if (next[k] === undefined) next[k] = v.defaultWords
      }
      return next
    })
  }, [blockConfig])

  const dirty = brand !== null && JSON.stringify(brand) !== original

  // ── Helpers de mutation ──────────────────────────────────────────────
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
      meilleure_remise: false, expired: false, cta_text: '',
    }
    setBrand({ ...brand, codes: [...(brand.codes || []), newCode] })
  }
  function removeCode(idx: number) {
    if (!brand) return
    if (!confirm('Supprimer ce code ?')) return
    const codes = [...(brand.codes || [])]; codes.splice(idx, 1)
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
    const faq = [...(brand.faq || [])]; faq[idx] = { ...faq[idx], ...patch }
    setBrand({ ...brand, faq })
  }
  function addFaq() {
    if (!brand) return
    setBrand({ ...brand, faq: [...(brand.faq || []), { question: '', reponse: '' }] })
  }
  function removeFaq(idx: number) {
    if (!brand) return
    const faq = [...(brand.faq || [])]; faq.splice(idx, 1)
    setBrand({ ...brand, faq })
  }
  function updateHistory(idx: number, valeur: number) {
    if (!brand) return
    const hist = [...(brand.historique_12_mois || [])]
    if (hist[idx]) hist[idx] = { ...hist[idx], valeur }
    setBrand({ ...brand, historique_12_mois: hist })
  }

  // ── Upload logo ──────────────────────────────────────────────────────
  async function uploadLogo(file: File) {
    if (!file || !brand) return
    setUploadingLogo(true); setSaveError(null); setSaveSuccess(null)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const slug = brand.slug || marqueSlug || 'misc'
      const filename = `logo.${ext}`
      const path = `platform/sites/${siteId}/public/codes-promo/${slug}/${filename}`
      const base64: string = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result).split(',')[1])
        r.onerror = reject
        r.readAsDataURL(file)
      })
      let sha: string | undefined
      try {
        const ex = await fetch(`/api/github?path=${encodeURIComponent(path)}`)
        if (ex.ok) {
          const ed = await ex.json()
          if (ed.sha) sha = ed.sha
        }
      } catch { /* création */ }
      const r = await fetch('/api/github/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path, content: base64, sha,
          message: `HUB: Upload logo ${brand.marque} (${slug})`,
        }),
      })
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        throw new Error(e.error || `HTTP ${r.status}`)
      }
      const publicUrl = `/codes-promo/${slug}/${filename}`
      setBrand({ ...brand, logo_url: publicUrl })
      setSaveSuccess('Logo uploadé ✓ pense à enregistrer la marque.')
      setTimeout(() => setSaveSuccess(null), 4000)
    } catch (e: any) {
      setSaveError(`Upload logo échoué : ${e?.message || 'inconnue'}`)
    } finally {
      setUploadingLogo(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  // ── Génération bloc par bloc ─────────────────────────────────────────
  // Appelle la route /generate-block qui construit le prompt en couches
  // (persona + global éditorial + bloc spécifique + custom) et renvoie le
  // contenu. On l'affiche dans une modale d'aperçu commune à tous les blocs.
  async function generateBlock(blockType: string) {
    if (!brand) return
    const cfg = blockConfig[blockType]
    if (!cfg) {
      setBlockGenerateError(`Bloc inconnu : ${blockType}`)
      return
    }
    const nWords = wordsByBlock[blockType] || cfg.defaultWords
    const customPrompt = blockType === 'content_md' ? customPrompt5
                       : blockType === 'content_libre' ? customPrompt6
                       : ''
    // Garde-fou client : bloc libre exige un prompt non vide
    if (blockType === 'content_libre' && customPrompt.trim().length < 10) {
      setBlockGenerateError('Le bloc "Contenu libre" requiert un prompt personnalisé (au moins 10 caractères). Renseigne-le dans la section en bas de page.')
      return
    }

    setBlockGenerating(blockType)
    setBlockGenerateError(null)
    try {
      const r = await fetch(`/api/sites/${siteId}/codes-promo/${marqueSlug}/generate-block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block_type: blockType,
          n_words: nWords,
          custom_prompt: customPrompt || undefined,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status} (stage: ${data.stage || 'inconnu'})`)
      setBlockModal({
        blockType,
        content: data.content,
        nWords,
        customPrompt,
      })
    } catch (e: any) {
      setBlockGenerateError(`Génération ${BLOCK_LABELS[blockType] || blockType} : ${e?.message || 'erreur'}`)
    } finally {
      setBlockGenerating(null)
    }
  }

  // Applique le contenu de la modale au champ correspondant du brand.
  function applyBlock() {
    if (!brand || !blockModal) return
    const { blockType, content } = blockModal
    const patch: Partial<Brand> = {}
    switch (blockType) {
      case 'description_marque': patch.description_marque = content; break
      case 'avis_sophie':         patch.avis_sophie = content; break
      case 'conseil_sophie':      patch.conseil_sophie = content; break
      case 'faq':                 patch.faq = Array.isArray(content) ? content : []; break
      case 'content_md':          patch.content_md = content; break
      case 'content_libre':       patch.content_libre = content; break
    }
    setBrand({ ...brand, ...patch })
    setBlockModal(null)
    setSaveSuccess(`${BLOCK_LABELS[blockType]} appliqué ✓ pense à enregistrer la marque.`)
    setTimeout(() => setSaveSuccess(null), 4000)
  }

  // ── Related brands ────────────────────────────────────────────────────
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

  // ── Save / Delete ─────────────────────────────────────────────────────
  async function save(newStatus?: 'draft' | 'published') {
    if (!brand) return
    setSaving(true); setSaveError(null); setSaveSuccess(null)
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
      setBrand(body); setOriginal(JSON.stringify(body))
      setSaveSuccess(newStatus === 'published' ? 'Marque publiée ✓'
                  : newStatus === 'draft' ? 'Marque dépubliée ✓'
                  : 'Modifications enregistrées ✓')
      if (data.slug && data.slug !== marqueSlug) {
        router.replace(`/sites/${siteId}/codes-promo/${data.slug}`)
      }
      setTimeout(() => setSaveSuccess(null), 3000)
    } catch (e: any) {
      setSaveError(e?.message || 'Sauvegarde échouée')
    } finally { setSaving(false) }
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
      setSaveError(e?.message || 'Suppression échouée'); setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────
  if (loading) return <div style={S.empty}>Chargement…</div>
  if (error) return <div style={S.empty}><div style={{ color: '#c00' }}>⚠ {error}</div></div>
  if (!brand) return <div style={S.empty}>Marque introuvable.</div>

  function buildPreviewUrl(domain: string, slug: string): string {
    if (!domain) return ''
    const cleaned = domain.replace(/\/+$/, '')
    const withProto = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`
    return `${withProto}/codes-promo/${slug}/`
  }
  const previewUrl = buildPreviewUrl(siteDomain, brand.slug)

  function buildLogoPreviewUrl(logoUrl: string): string {
    if (!logoUrl) return ''
    if (/^https?:\/\//i.test(logoUrl)) return logoUrl
    const owner = process.env.NEXT_PUBLIC_GITHUB_OWNER || 'afcavf54-cmd'
    const repo = process.env.NEXT_PUBLIC_GITHUB_REPO || 'comparatifs-platform'
    const clean = logoUrl.replace(/^\//, '')
    return `https://raw.githubusercontent.com/${owner}/${repo}/main/platform/sites/${siteId}/public/${clean}`
  }
  const logoPreviewSrc = buildLogoPreviewUrl(brand.logo_url || '')

  // ── Composant interne : Bouton "✨ Générer" + input mots ─────────────
  // Affiché à côté de chaque label de champ générable.
  function GenerateBtn({ block, helpText }: { block: string; helpText?: string }) {
    const cfg = blockConfig[block]
    if (!cfg) return null
    const isGen = blockGenerating === block
    const anyGen = blockGenerating !== null
    const nWords = wordsByBlock[block] ?? cfg.defaultWords
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={helpText || `Min ${cfg.minWords} / Max ${cfg.maxWords} mots`}>
        <input
          type="number" min={cfg.minWords} max={cfg.maxWords} step={10}
          value={nWords}
          onChange={e => {
            const v = parseInt(e.target.value, 10)
            const clamped = isNaN(v) ? cfg.defaultWords : Math.max(cfg.minWords, Math.min(cfg.maxWords, v))
            setWordsByBlock({ ...wordsByBlock, [block]: clamped })
          }}
          style={S.wordsInput}
          disabled={anyGen}
        />
        <span style={{ fontSize: 11, color: '#888' }}>mots</span>
        <button
          type="button"
          onClick={() => generateBlock(block)}
          disabled={anyGen}
          style={{ ...S.btnGen, ...(isGen || anyGen ? S.btnGenDisabled : {}) }}
        >
          {isGen ? '⏳ ...' : '✨ Générer'}
        </button>
      </div>
    )
  }

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
          {brand.status === 'draft' ? (
            <button style={{ ...S.btn, ...S.btnPub }} onClick={() => save('published')} disabled={saving}>Publier</button>
          ) : (
            <button style={{ ...S.btn, ...S.btnGhost }} onClick={() => save('draft')} disabled={saving}>Dépublier</button>
          )}
          <button style={{ ...S.btn, ...S.btnPrimary, opacity: dirty ? 1 : 0.5 }} onClick={() => save()} disabled={!dirty || saving}>
            {saving ? 'Sauvegarde…' : 'Enregistrer'}
          </button>
          <button style={{ ...S.btn, ...S.btnDanger }} onClick={doDelete} disabled={saving}>🗑</button>
        </div>
      </div>

      <div style={S.content}>
        {saveError && <div style={S.errorBox}>⚠ {saveError}</div>}
        {blockGenerateError && <div style={S.errorBox}>⚠ {blockGenerateError}</div>}
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

            {/* Logo */}
            <div style={{ ...S.field, gridColumn: 'span 2' }}>
              <label style={S.label}>Logo de la marque</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <input
                  style={{ ...S.input, flex: 1 }}
                  value={brand.logo_url || ''}
                  onChange={e => update('logo_url', e.target.value)}
                  placeholder={`/codes-promo/${brand.slug}/logo.png ou https://…`}
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  style={{
                    ...S.btn,
                    background: uploadingLogo ? '#ccc' : '#1a1a1a',
                    color: '#fff', padding: '0 16px', whiteSpace: 'nowrap',
                    cursor: uploadingLogo ? 'wait' : 'pointer',
                  }}
                >
                  {uploadingLogo ? '⏳ Upload…' : '📤 Upload'}
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/avif"
                  style={{ display: 'none' }}
                  onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])}
                />
              </div>
              {logoPreviewSrc && (
                <div style={{
                  marginTop: 10, padding: 10, background: '#fafafa',
                  borderRadius: 8, border: '1px solid #eee',
                  display: 'flex', alignItems: 'center', gap: 12, maxWidth: 400,
                }}>
                  <img
                    src={logoPreviewSrc}
                    alt="Aperçu logo"
                    style={{ maxHeight: 64, maxWidth: 160, objectFit: 'contain', display: 'block', background: '#fff', borderRadius: 6, padding: 4 }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                  <div style={{ fontSize: 11, color: '#888', wordBreak: 'break-all' }}>{brand.logo_url}</div>
                </div>
              )}
            </div>

            {/* Description marque + bouton générer */}
            <div style={{ ...S.field, gridColumn: 'span 2' }}>
              <div style={S.labelRow}>
                <label style={S.label}>Description de la marque (sidebar "Qu'est-ce que…")</label>
                <GenerateBtn block="description_marque" />
              </div>
              <textarea style={S.textarea} rows={3} value={brand.description_marque || ''} onChange={e => update('description_marque', e.target.value)} placeholder="Présente la marque en 2-3 phrases." />
            </div>

            <div style={S.field}>
              <label style={S.label}>Meta title (SEO)</label>
              <input style={S.input} value={brand.meta_title || ''} onChange={e => update('meta_title', e.target.value)} placeholder={`Codes promo {marque} — {mois_annee} | {site_name}`} />
            </div>
            <div style={S.field}>
              <label style={S.label}>Meta description (SEO)</label>
              <input style={S.input} value={brand.meta_description || ''} onChange={e => update('meta_description', e.target.value)} placeholder="Découvre {n_codes} codes promo {marque} testés en {mois_annee}." />
            </div>

            {/* H1 personnalisé (optionnel) + rappel des variables disponibles.
                Affiché en pleine largeur pour donner de la place au panneau d'aide. */}
            <div style={{ ...S.field, gridColumn: 'span 2' }}>
              <label style={S.label}>H1 personnalisé (optionnel)</label>
              <input
                style={S.input}
                value={brand.h1_custom || ''}
                onChange={e => update('h1_custom', e.target.value)}
                placeholder={`Codes promo {marque} — {mois_annee}    (laisse vide pour le H1 par défaut)`}
              />
              <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                Si vide, le H1 par défaut est utilisé : <em>Codes promo {brand.marque} — {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</em>.
                Dans ton H1, <code>{'{marque}'}</code> est automatiquement coloré en rose.
              </div>
            </div>

            {/* Rappel des variables — panel commun pour les 3 champs ci-dessus */}
            <div style={{ gridColumn: 'span 2', background: '#fafafa', border: '1px solid #eee', borderRadius: 8, padding: '12px 16px', marginTop: 4 }}>
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#555', userSelect: 'none' }}>
                  📌 Variables disponibles dans le H1, meta title et meta description
                </summary>
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 18px', fontSize: 12, color: '#555' }}>
                  {[
                    ['{marque}', brand.marque || 'Octopus Energy'],
                    ['{categorie}', brand.categorie_marque || 'Énergie'],
                    ['{mois}', new Date().toLocaleDateString('fr-FR', { month: 'long' })],
                    ['{annee}', String(new Date().getFullYear())],
                    ['{mois_annee}', new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })],
                    ['{n_codes}', String((brand.codes || []).filter(c => !c.expired).length)],
                    ['{n_codes_promo}', String((brand.codes || []).filter(c => !c.expired && c.type === 'code').length)],
                    ['{best_remise}', (() => {
                      const active = (brand.codes || []).filter(c => !c.expired && c.valeur && (c.unite === '%' || c.unite === '€'))
                      if (!active.length) return '—'
                      const best = active.reduce((a, b) => (a.valeur! > b.valeur! ? a : b))
                      return `${best.valeur}${best.unite}`
                    })()],
                    ['{site_name}', siteDomain || 'cadeauclic.com'],
                  ].map(([v, ex]) => (
                    <div key={v} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <code style={{ background: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 11, color: '#cf2c61', fontFamily: 'ui-monospace,SFMono-Regular,Consolas,monospace', cursor: 'copy' }}
                        onClick={() => navigator.clipboard?.writeText(v as string)}
                        title="Cliquer pour copier"
                      >{v}</code>
                      <span style={{ color: '#888', fontSize: 11 }}>→ {ex}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: '#888', fontStyle: 'italic' }}>
                  Les valeurs ci-dessus sont des exemples calculés à partir des données actuelles de cette marque. Au build, elles seront recalculées avec le mois/année courant et le nombre de codes à ce moment-là.
                </div>
                <div style={{ marginTop: 10, padding: '10px 12px', background: '#fff', border: '1px solid #ffe7ef', borderRadius: 6, fontSize: 11, color: '#555' }}>
                  💡 <b>Astuce casse</b> : la casse du placeholder s'applique à la valeur.
                  <div style={{ marginTop: 6, fontFamily: 'ui-monospace,SFMono-Regular,Consolas,monospace' }}>
                    <code style={{ color: '#cf2c61' }}>{'{mois_annee}'}</code> → juin 2026<br/>
                    <code style={{ color: '#cf2c61' }}>{'{Mois_annee}'}</code> → Juin 2026<br/>
                    <code style={{ color: '#cf2c61' }}>{'{MOIS_ANNEE}'}</code> → JUIN 2026
                  </div>
                  <div style={{ marginTop: 4, color: '#888' }}>
                    Marche pour toutes les variables : <code>{'{Marque}'}</code>, <code>{'{MARQUE}'}</code>, <code>{'{Categorie}'}</code>, etc.
                  </div>
                </div>
              </details>
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
          <div style={S.sectionSub}>Chaque code/offre apparaît dans une card sur la page. Les codes expirés sont déplacés dans une section dédiée en bas.</div>

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
              <div style={{ ...S.field, marginTop: 10 }}>
                <label style={S.label}>Texte du bouton CTA (optionnel)</label>
                <input
                  style={S.input}
                  value={c.cta_text || ''}
                  onChange={e => updateCode(idx, { cta_text: e.target.value })}
                  placeholder={c.type === 'code' ? 'Voir le code 🏷️ (défaut)' : "Profiter de l'offre → (défaut)"}
                />
                <div style={{ fontSize: 11, color: '#999' }}>
                  Laisse vide pour le texte par défaut. Tu peux mettre des emojis.
                </div>
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
            <div style={S.labelRow}>
              <label style={S.label}>Avis de Sophie</label>
              <GenerateBtn block="avis_sophie" helpText={`L'avis intègre automatiquement le nombre de codes actifs (${(brand.codes || []).filter(c => !c.expired).length})`} />
            </div>
            <textarea style={S.textarea} rows={4} value={brand.avis_sophie || ''} onChange={e => update('avis_sophie', e.target.value)} placeholder={`J'ai rassemblé et testé pour toi les meilleurs codes promo ${brand.marque}…`} />
          </div>

          <div style={{ ...S.field, marginTop: 12 }}>
            <div style={S.labelRow}>
              <label style={S.label}>Conseil de Sophie (astuce)</label>
              <GenerateBtn block="conseil_sophie" />
            </div>
            <textarea style={S.textarea} rows={3} value={brand.conseil_sophie || ''} onChange={e => update('conseil_sophie', e.target.value)} placeholder="Un conseil pour économiser plus, un timing à connaître, etc." />
          </div>
        </div>

        {/* ── FAQ ────────────────────────────────────────────────────── */}
        <div style={S.section}>
          <div style={{ ...S.sectionTitle, justifyContent: 'space-between' }}>
            <span>❓ Foire aux questions</span>
            <GenerateBtn block="faq" helpText="Remplace toutes les Q/R par 4 nouvelles questions générées" />
          </div>
          <div style={S.sectionSub}>Au moins 2 questions pour générer le schéma FAQPage (étoiles SERP). ⚠ Une génération remplace TOUTES les Q/R existantes.</div>
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
          <div style={{ ...S.sectionTitle, justifyContent: 'space-between' }}>
            <span>📊 Historique des remises (12 derniers mois)</span>
            {/* Sélecteur d'unité globale pour l'historique. Cohérent pour 99%
                des marques : soit toute l'année en %, soit toute en €. */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#666', fontWeight: 600, marginRight: 6 }}>Unité :</span>
              {(['%', '€'] as const).map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => update('historique_unite', u)}
                  style={{
                    ...S.chipBtn,
                    ...((brand.historique_unite || '%') === u ? S.chipBtnActive : {}),
                    minWidth: 38, justifyContent: 'center',
                  }}
                >{u}</button>
              ))}
            </div>
          </div>
          <div style={S.sectionSub}>
            La meilleure remise disponible chaque mois sur les 12 derniers mois.
            L'unité ({brand.historique_unite || '%'}) s'applique à tous les mois.
          </div>
          <div style={S.historyGrid}>
            {(brand.historique_12_mois || []).map((h, idx) => {
              const [year, month] = h.mois.split('-')
              const label = `${MONTHS_FR[parseInt(month)]} ${year.slice(2)}`
              const unite = brand.historique_unite || '%'
              return (
                <div key={h.mois} style={S.histCell}>
                  <div style={{ position: 'relative', width: '100%' }}>
                    <input
                      type="number"
                      min={0}
                      // Max 100 si %, sinon libre (on borne à 999 € pour rester raisonnable)
                      max={unite === '%' ? 100 : 9999}
                      step={1}
                      style={{ ...S.histInput, paddingRight: 18 }}
                      value={h.valeur}
                      onChange={e => updateHistory(idx, parseInt(e.target.value) || 0)}
                    />
                    <span style={{
                      position: 'absolute', right: 6, top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: 11, color: '#888', pointerEvents: 'none',
                    }}>{unite}</span>
                  </div>
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
            Si vide, on prend automatiquement 8 marques de la même catégorie "{brand.categorie_marque || '<définis une catégorie>'}".
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

        {/* ── CONTENU RÉDIGÉ (bloc 5) ────────────────────────────────
            Section "Comment utiliser un code promo {marque}". Prompt système
            FIXE (4 étapes, HTML) + custom_prompt OPTIONNEL pour ajouter des
            instructions spécifiques à la marque. */}
        <div style={S.section}>
          <div style={{ ...S.sectionTitle, justifyContent: 'space-between' }}>
            <span>📄 Contenu rédigé "Comment utiliser un code promo {brand.marque}"</span>
            <GenerateBtn block="content_md" helpText="4 étapes en HTML. Le prompt custom ci-dessous est OPTIONNEL." />
          </div>
          <div style={S.sectionSub}>Affiché entre les codes et l'historique sur la page. Structure imposée : 4 étapes (h2) avec paragraphes (p) en HTML simple.</div>

          {/* Custom prompt OPTIONNEL */}
          <div style={S.field}>
            <label style={S.label}>Instructions supplémentaires pour la génération (optionnel)</label>
            <textarea
              style={{ ...S.textarea, minHeight: 60 }} rows={2}
              value={customPrompt5}
              onChange={e => setCustomPrompt5(e.target.value)}
              placeholder='Ex : "Mentionne la livraison gratuite dès 65€" ou "Évite de parler du parrainage car suspendu"'
            />
            <div style={{ fontSize: 11, color: '#999' }}>
              Ces instructions s'ajoutent au prompt système (4 étapes + ton de Sophie). Vide = génération standard.
            </div>
          </div>

          {/* HTML résultat */}
          <div style={{ ...S.field, marginTop: 12 }}>
            <label style={S.label}>HTML du contenu (édite directement si besoin)</label>
            <textarea
              style={{ ...S.textarea, minHeight: 280, fontFamily: 'ui-monospace,SFMono-Regular,Consolas,monospace', fontSize: 13 }}
              value={brand.content_md}
              onChange={e => update('content_md', e.target.value)}
              placeholder={`<h2>Étape 1 : Repère le code</h2>\n<p>...</p>\n<h2>Étape 2 : Copie le code</h2>\n<p>...</p>`}
            />
          </div>
        </div>

        {/* ── CONTENU LIBRE (bloc 6) ─────────────────────────────────
            NOUVEAU bloc 100% pilotable par toi. Affiché sous l'historique
            des remises sur le site. Le prompt système est juste persona +
            global éditorial — TOUT le reste vient de ton prompt custom. */}
        <div style={S.section}>
          <div style={{ ...S.sectionTitle, justifyContent: 'space-between' }}>
            <span>✏️ Contenu libre (affiché sous "Historique des remises")</span>
            <GenerateBtn block="content_libre" helpText="Génère un HTML libre à partir du prompt ci-dessous." />
          </div>
          <div style={S.sectionSub}>
            Bloc HTML 100% pilotable par toi. Pas de structure imposée — tu écris le prompt, l'IA génère le contenu. Pratique pour des sections spéciales (sélection éditoriale, comparaison, calendrier événementiel, etc.).
          </div>

          {/* Prompt custom OBLIGATOIRE */}
          <div style={S.field}>
            <label style={S.label}>Ton prompt personnalisé *</label>
            <textarea
              style={{ ...S.textarea, minHeight: 100 }} rows={4}
              value={customPrompt6}
              onChange={e => setCustomPrompt6(e.target.value)}
              placeholder={`Ex : "Rédige une sélection des 3 meilleurs produits ${brand.marque} pour la Saint-Valentin, avec un h3 par produit, une fourchette de prix, et qui l'offrir."`}
            />
            <div style={{ fontSize: 11, color: '#999' }}>
              Obligatoire (min. 10 caractères). Persona Sophie + ton éditorial sont injectés automatiquement.
            </div>
          </div>

          {/* HTML résultat */}
          <div style={{ ...S.field, marginTop: 12 }}>
            <label style={S.label}>HTML généré (édite directement si besoin)</label>
            <textarea
              style={{ ...S.textarea, minHeight: 200, fontFamily: 'ui-monospace,SFMono-Regular,Consolas,monospace', fontSize: 13 }}
              value={brand.content_libre || ''}
              onChange={e => update('content_libre', e.target.value)}
              placeholder={`<h2>Notre sélection éditoriale</h2>\n<p>...</p>`}
            />
            <div style={{ fontSize: 11, color: '#999' }}>
              Le HTML est inséré tel quel dans un &lt;div class="panel content-libre"&gt;.
              Si vide, le bloc n'apparaît pas sur le site.
            </div>
          </div>
        </div>
      </div>

      {/* ── MODALE D'APERÇU DE GÉNÉRATION ─────────────────────────────
          Apparaît dès que blockModal != null. Affiche le contenu généré
          (texte ou FAQ) avec boutons Appliquer / Régénérer / Annuler. */}
      {blockModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
          onClick={() => setBlockModal(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 820, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                ✨ Aperçu : {BLOCK_LABELS[blockModal.blockType] || blockModal.blockType}
              </div>
              <button style={S.iconBtn} onClick={() => setBlockModal(null)} aria-label="Fermer">✕</button>
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 18 }}>
              {blockModal.nWords} mots cibles · marque {brand.marque}
              {blockModal.customPrompt && <> · prompt custom : "{blockModal.customPrompt.slice(0, 60)}{blockModal.customPrompt.length > 60 ? '…' : ''}"</>}
            </div>

            {/* Rendu différent selon le type de bloc */}
            {blockModal.blockType === 'faq' && Array.isArray(blockModal.content) ? (
              <div style={{ background: '#fafafa', borderRadius: 8, padding: 16, border: '1px solid #eee', maxHeight: 400, overflowY: 'auto' }}>
                {blockModal.content.map((q: BrandFaq, i: number) => (
                  <div key={i} style={{ marginBottom: i < blockModal.content.length - 1 ? 16 : 0, paddingBottom: i < blockModal.content.length - 1 ? 16 : 0, borderBottom: i < blockModal.content.length - 1 ? '1px solid #eee' : 'none' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{q.question}</div>
                    <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>{q.reponse}</div>
                  </div>
                ))}
              </div>
            ) : blockModal.blockType === 'content_md' || blockModal.blockType === 'content_libre' ? (
              <div>
                {/* Styles scoped pour l'aperçu HTML rendu. Sans ça, les <h2>,
                    <p>, <li> héritent du gris pâle du dashboard et le contenu
                    devient illisible (cf bug capture 17 juin). */}
                <style>{`
                  .cp-preview-html { color: #1a1a1a; }
                  .cp-preview-html h2 { font-size: 18px; font-weight: 700; color: #1a1a1a; margin: 18px 0 10px; line-height: 1.3; }
                  .cp-preview-html h2:first-child { margin-top: 0; }
                  .cp-preview-html h3 { font-size: 15px; font-weight: 700; color: #1a1a1a; margin: 14px 0 8px; }
                  .cp-preview-html p { color: #333; line-height: 1.65; margin: 0 0 12px; font-size: 14px; }
                  .cp-preview-html p:last-child { margin-bottom: 0; }
                  .cp-preview-html ul, .cp-preview-html ol { color: #333; padding-left: 24px; margin: 0 0 12px; line-height: 1.65; font-size: 14px; }
                  .cp-preview-html li { margin-bottom: 4px; color: #333; }
                  .cp-preview-html strong { color: #1a1a1a; font-weight: 700; }
                  .cp-preview-html em { color: #1a1a1a; }
                  .cp-preview-html a { color: #cf2c61; border-bottom: 1px solid #ffd0e0; text-decoration: none; }
                `}</style>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Aperçu rendu HTML :</div>
                <div
                  className="cp-preview-html"
                  style={{ background: '#fff', borderRadius: 8, padding: 20, border: '1px solid #eee', maxHeight: 360, overflowY: 'auto' }}
                  dangerouslySetInnerHTML={{ __html: String(blockModal.content || '') }}
                />
                <details style={{ marginTop: 10 }}>
                  <summary style={{ fontSize: 11, color: '#888', cursor: 'pointer' }}>Voir le HTML source</summary>
                  <pre style={{ background: '#fafafa', borderRadius: 6, padding: 12, fontSize: 11, color: '#333', fontFamily: 'ui-monospace,SFMono-Regular,Consolas,monospace', overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: 200 }}>
                    {String(blockModal.content || '')}
                  </pre>
                </details>
              </div>
            ) : (
              <div style={{ background: '#fafafa', borderRadius: 8, padding: 16, border: '1px solid #eee', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto' }}>
                {String(blockModal.content || '')}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid #eee' }}>
              <button
                style={{ ...S.btn, ...S.btnGhost }}
                onClick={() => { const bt = blockModal.blockType; setBlockModal(null); generateBlock(bt) }}
                disabled={blockGenerating !== null}
              >
                🔄 Régénérer
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...S.btn, ...S.btnGhost }} onClick={() => setBlockModal(null)}>
                  Annuler
                </button>
                <button style={{ ...S.btn, ...S.btnPrimary }} onClick={applyBlock}>
                  ✓ Appliquer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Save bar sticky bottom ────────────────────────────────── */}
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
            >Annuler</button>
            <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => save()} disabled={saving}>
              {saving ? 'Sauvegarde…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
