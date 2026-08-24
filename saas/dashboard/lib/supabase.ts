import { createClient } from '@supabase/supabase-js'

// ────────────────────────────────────────────────────────────────────────
// Client Supabase — SERVEUR UNIQUEMENT (clé service_role → bypass la RLS).
// Ne JAMAIS importer ce fichier dans un composant client.
// ────────────────────────────────────────────────────────────────────────
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE

// Vrai seulement si les 2 variables sont présentes ET l'URL est valide.
export const supabaseConfigured = Boolean(url && /^https?:\/\//.test(url) && key)

// URL de repli VALIDE : évite que createClient() lève une exception à l'import
// (ce qui ferait planter toute la route → réponse HTML → "JSON.parse error").
// Si non configuré, les requêtes échoueront proprement et les routes renvoient
// un message JSON clair grâce au garde `supabaseConfigured`.
export const supabase = createClient(
  supabaseConfigured ? (url as string) : 'https://placeholder.supabase.co',
  key || 'placeholder',
  { auth: { persistSession: false, autoRefreshToken: false } },
)
