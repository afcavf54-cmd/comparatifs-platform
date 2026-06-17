/**
 * codes-promo.ts — Helpers pour parser/sérialiser les fichiers marque codes promo.
 *
 * Format attendu :
 *   platform/sites/<site>/codes_promo/<marque-slug>.md
 *   ──────────────────────────────────────────────────
 *   ---
 *   marque: "SHEIN"
 *   slug: "shein"
 *   ...
 *   content_libre: |
 *     <h2>Notre sélection éditoriale</h2>
 *     <p>...</p>
 *   status: "published"
 *   ---
 *
 *   # Comment utiliser un code promo SHEIN
 *   ... (markdown généré par IA, éditable — c'est le content_md du body)
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
  sous_type: string
  accroche: string
  code: string
  detail: string
  expire_le: string
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
  mois: string
  valeur: number
}

export interface BrandRating {
  value: number
  count: number
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
  // H1 personnalisé. Supporte les variables {marque}, {mois}, {annee},
  // {mois_annee}, {n_codes}, {best_remise}, etc. Si vide, le template
  // utilise le H1 hardcodé : "Codes promo <marque> — <mois_annee>".
  h1_custom?: string
  date_creation?: string
  date_maj?: string

  // ─── Bloc libre HTML (affiché sous l'historique sur le site live) ─────
  // Stocké dans le frontmatter YAML, pas dans le body, pour rester sur 1
  // seul "champ markdown" (le body = content_md = section "Comment utiliser").
  // yaml.dump avec lineWidth: -1 gère bien les strings HTML multilignes.
  content_libre?: string
}

export interface Brand extends BrandFrontmatter {
  content_md: string
  filename?: string
  sha?: string
}

// ─── Parser ────────────────────────────────────────────────────────────────

export function parseBrandFile(raw: string): { fm: BrandFrontmatter; body: string } | null {
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
  'content_libre',           // ← bloc libre HTML, juste avant le SEO/statuts
  'status', 'meta_title', 'meta_description', 'h1_custom',
  'date_creation', 'date_maj',
]

export function serializeBrand(brand: Brand): string {
  const ordered: Record<string, any> = {}
  for (const key of FIELD_ORDER) {
    const val = (brand as any)[key]
    if (val === undefined || val === null) continue
    if (Array.isArray(val) && val.length === 0) continue
    if (typeof val === 'string' && val === '' && key !== 'marque' && key !== 'slug') continue
    ordered[key] = val
  }
  const fmYaml = yaml.dump(ordered, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
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
    content_libre: '',         // ← nouveau bloc, vide par défaut
    status: 'draft',
    meta_title: '',
    meta_description: '',
    h1_custom: '',
    date_creation: new Date().toISOString().slice(0, 10),
    date_maj: new Date().toISOString().slice(0, 10),
    content_md: '',
  }
}
