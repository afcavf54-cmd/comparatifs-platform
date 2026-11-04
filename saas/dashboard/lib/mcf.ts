import { createClient } from '@supabase/supabase-js'

// ────────────────────────────────────────────────────────────────────────
// Client Supabase du PROJET DÉDIÉ mon-credit-facile — SERVEUR UNIQUEMENT.
// Clé service_role → bypass la RLS (CRUD des offres + réglages du simulateur).
// Ne JAMAIS importer côté client.
//
// Variables d'environnement (Vercel) :
//   MCF_SUPABASE_URL          = https://<ref>.supabase.co
//   MCF_SUPABASE_SERVICE_ROLE = clé service_role du projet mon-credit-facile
// ────────────────────────────────────────────────────────────────────────
const url = process.env.MCF_SUPABASE_URL
const key = process.env.MCF_SUPABASE_SERVICE_ROLE

export const mcfConfigured = Boolean(url && /^https?:\/\//.test(url) && key)

export const mcf = createClient(
  mcfConfigured ? (url as string) : 'https://placeholder.supabase.co',
  key || 'placeholder',
  { auth: { persistSession: false, autoRefreshToken: false } },
)

export type Offre = {
  id?: string
  type: 'credit' | 'parrainage'
  organisme: string
  slug?: string | null
  categorie?: string | null
  montant_min?: number | null
  montant_max?: number | null
  durees?: string | null
  taeg?: string | null
  prime?: string | null
  depot?: string | null
  description?: string | null
  conditions?: string | null
  logo_url?: string | null
  url: string
  mise_en_avant?: boolean
  ordre?: number
  valide_du?: string | null
  valide_au?: string | null
  verifie_le?: string | null
  demo?: boolean
  actif?: boolean
}

export function slugify(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
