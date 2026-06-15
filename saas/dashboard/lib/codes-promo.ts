/**
 * codes-promo.ts — Helpers pour parser/sérialiser les fichiers marque codes promo.
 *
 * Format attendu :
 *   platform/sites/<site>/codes_promo/<marque-slug>.md
 *   ──────────────────────────────────────────────────
 *   ---
 *   marque: "SHEIN"
 *   slug: "shein"
 *   categorie_marque: "Mode"
 *   url_marchand: "https://www.shein.com"
 *   url_affiliation: "https://www.shein.com/?ref=cadeauclic"
 *   logo_url: "/codes-promo/shein/logo.png"
 *   description_marque: "..."
 *   avis_sophie: "..."
 *   conseil_sophie: "..."
 *   rating:
 *     value: 4.7
 *     count: 142
 *   codes:
 *     - id: "c1"
 *       type: "code"          # code | offer
 *       valeur: 30
 *       unite: "%"            # % | €
 *       sous_type: "Code promo"
 *       accroche: "..."
 *       code: "GIFT30"
 *       detail: "..."
 *       expire_le: "2026-06-30"
 *       nb_utilisations: 1240
 *       teste_par_sophie: ""
 *       meilleure_remise: false
 *       expired: false
 *   faq:
 *     - question: "..."
 *       reponse: "..."
 *   historique_12_mois:
 *     - { mois: "2025-07", valeur: 25 }
 *     ...
 *   related_brands: ["zalando", "asos"]
 *   status: "published"
 *   ---
 *
 *   # Comment utiliser un code promo SHEIN
 *   ... (markdown généré par IA, éditable)
 */
import yaml from 'js-yaml'

// ─── Types ────────────────────────────────────────────────────────────────

export type CodePromoType = 'code' | 'offer'
export type CodePromoUnite = '%' | '€' | ''
export type BrandStatus = 'draft' | 'published'

export interface CodePromo {
  id: string
  type: CodePromoType
  valeur: number | null
  unite: CodePromoUnite
  sous_type: string                // "Code promo" | "Bon plan" | "Cashback" | "Livraison gratuite" | "Autre"
  accroche: string
  code: string                     // vide si type=offer
  detail: string
  expire_le: string                // YYYY-MM-DD ou vide
  nb_utilisations: number
  teste_par_sophie: string
  meilleure_remise: boolean
  expired: boolean
}

export interface BrandFaq {
  question: string
  reponse: string
}

export interface BrandHistoryMonth {
  mois: string                     // "YYYY-MM"
  valeur: number                   // en %
}

export interface BrandRating {
  value: number                    // 0..5
  count: number                    // nb de votes
}

export interface BrandFrontmatter {
  marque: string
  slug: string
  categorie_marque?: string
  url_marchand?: string
  url_affiliation?: string
  logo_url?: string
  description_marque?: string
  avis_sophie?: string
  conseil_sophie?: string
  rating?: BrandRating
  codes?: CodePromo[]
  faq?: BrandFaq[]
  historique_12_mois?: BrandHistoryMonth[]
  related_brands?: string[]
  status?: BrandStatus
  meta_title?: string
  meta_description?: string
  date_creation?: string
  date_maj?: string
}

export interface Brand extends BrandFrontmatter {
  content_md: string
  filename?: string
  sha?: string
}

// ─── Parser ────────────────────────────────────────────────────────────────

export function parseBrandFile(raw: string): { fm: BrandFrontmatter; body: string } | null {
  // Frontmatter YAML entre --- ... ---
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!m) return null
  try {
    const fm = (yaml.load(m[1]) as BrandFrontmatter) || ({} as BrandFrontmatter)
    if (typeof fm !== 'object' || Array.isArray(fm)) return null
    return { fm, body: m[2] || '' }
  } catch {
    return null
  }
}

// ─── Serializer ────────────────────────────────────────────────────────────

const FIELD_ORDER: (keyof BrandFrontmatter)[] = [
  'marque', 'slug', 'categorie_marque',
  'url_marchand', 'url_affiliation', 'logo_url',
  'description_marque', 'avis_sophie', 'conseil_sophie',
  'rating',
  'codes',
  'faq',
  'historique_12_mois',
  'related_brands',
  'status', 'meta_title', 'meta_description',
  'date_creation', 'date_maj',
]

export function serializeBrand(brand: Brand): string {
  // On reconstruit l'objet dans l'ordre voulu pour avoir un YAML stable
  // (sinon `yaml.dump` ordonne alphabétiquement, ce qui rend les diffs Git illisibles).
  const ordered: Record<string, any> = {}
  for (const key of FIELD_ORDER) {
    const val = (brand as any)[key]
    if (val === undefined || val === null) continue
    // Liste vide → on omet (frontmatter plus propre)
    if (Array.isArray(val) && val.length === 0) continue
    // String vide pour les champs optionnels → on omet
    if (typeof val === 'string' && val === '' && key !== 'marque' && key !== 'slug') continue
    ordered[key] = val
  }
  const fmYaml = yaml.dump(ordered, {
    lineWidth: -1,            // pas de wrap (lignes longues OK)
    noRefs: true,             // pas de références &anchor *ref
    quotingType: '"',         // force double-quotes (cohérent avec le blog)
    forceQuotes: false,       // ne quote que si nécessaire
  })
  const body = brand.content_md || ''
  return `---\n${fmYaml}---\n\n${body}\n`
}

// ─── Slug utils ────────────────────────────────────────────────────────────

export function slugifyMarque(name: string): string {
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'marque'
}

// ─── Helpers pour le dashboard ────────────────────────────────────────────

/** Crée un objet code vide avec un id généré (utilisé dans l'UI "ajouter un code"). */
export function emptyCode(): CodePromo {
  return {
    id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    type: 'code',
    valeur: null,
    unite: '%',
    sous_type: 'Code promo',
    accroche: '',
    code: '',
    detail: '',
    expire_le: '',
    nb_utilisations: 0,
    teste_par_sophie: '',
    meilleure_remise: false,
    expired: false,
  }
}

/** Crée un historique vide pour les 12 derniers mois (mois courant en dernier). */
export function emptyHistory12Months(): BrandHistoryMonth[] {
  const now = new Date()
  const out: BrandHistoryMonth[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    out.push({ mois: `${yyyy}-${mm}`, valeur: 0 })
  }
  return out
}

/** Reconstitue 12 mois en fusionnant l'historique existant avec les 12 mois cibles. */
export function normalizeHistory12Months(existing: BrandHistoryMonth[] | undefined): BrandHistoryMonth[] {
  const target = emptyHistory12Months()
  if (!Array.isArray(existing) || existing.length === 0) return target
  const byMonth = new Map<string, number>()
  for (const h of existing) {
    if (h && typeof h.mois === 'string' && typeof h.valeur === 'number') {
      byMonth.set(h.mois, h.valeur)
    }
  }
  return target.map(t => ({ mois: t.mois, valeur: byMonth.get(t.mois) ?? 0 }))
}

/** Crée une marque "squelette" avec valeurs par défaut. */
export function emptyBrand(marque: string, slug?: string): Brand {
  return {
    marque,
    slug: slug || slugifyMarque(marque),
    categorie_marque: '',
    url_marchand: '',
    url_affiliation: '',
    logo_url: '',
    description_marque: '',
    avis_sophie: '',
    conseil_sophie: '',
    rating: { value: 0, count: 0 },
    codes: [],
    faq: [],
    historique_12_mois: emptyHistory12Months(),
    related_brands: [],
    status: 'draft',
    meta_title: '',
    meta_description: '',
    date_creation: new Date().toISOString().slice(0, 10),
    date_maj: new Date().toISOString().slice(0, 10),
    content_md: '',
  }
}
