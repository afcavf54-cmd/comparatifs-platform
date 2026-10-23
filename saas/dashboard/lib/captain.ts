import { createClient } from '@supabase/supabase-js'

// ────────────────────────────────────────────────────────────────────────
// Client Supabase du PROJET DÉDIÉ captain-parrainage — SERVEUR UNIQUEMENT.
// Utilise la clé service_role → bypass la RLS (CRUD des offres, lecture des
// membres pour la newsletter). Ne JAMAIS importer côté client.
//
// Variables d'environnement (Vercel) :
//   CAPTAIN_SUPABASE_URL          = https://<ref>.supabase.co
//   CAPTAIN_SUPABASE_SERVICE_ROLE = clé service_role du projet captain
// ────────────────────────────────────────────────────────────────────────
const url = process.env.CAPTAIN_SUPABASE_URL
const key = process.env.CAPTAIN_SUPABASE_SERVICE_ROLE

export const captainConfigured = Boolean(url && /^https?:\/\//.test(url) && key)

export const captain = createClient(
  captainConfigured ? (url as string) : 'https://placeholder.supabase.co',
  key || 'placeholder',
  { auth: { persistSession: false, autoRefreshToken: false } },
)

export type Parrainage = {
  id?: string
  marque: string
  slug: string
  categorie?: string | null
  type_prime?: string | null
  montant?: number | null
  sans_depot?: boolean
  montant_sans_depot?: number | null
  conditions?: string | null
  lien: string
  code_parrainage?: string | null
  logo_url?: string | null
  couleur?: string | null
  nouveau?: boolean
  en_avant?: boolean
  acces_libre?: boolean
  ordre?: number
  actif?: boolean
  verifie_le?: string | null
}

export function slugify(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
