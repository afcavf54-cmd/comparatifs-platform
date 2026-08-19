import { createClient } from '@supabase/supabase-js'

// ────────────────────────────────────────────────────────────────────────
// Client Supabase — SERVEUR UNIQUEMENT (clé service_role → bypass la RLS).
// Ne JAMAIS importer ce fichier dans un composant client : la clé secrète
// ne doit jamais atteindre le navigateur. Utilisé seulement dans les API routes.
// ────────────────────────────────────────────────────────────────────────
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE

if (!url || !key) {
  // Message clair au build/exécution si une variable manque dans Vercel.
  console.warn('[supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE manquant dans les variables d\'environnement.')
}

export const supabase = createClient(url || '', key || '', {
  auth: { persistSession: false, autoRefreshToken: false },
})
