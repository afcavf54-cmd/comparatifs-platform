import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseConfigured } from '../../../lib/supabase'

// ────────────────────────────────────────────────────────────────────────
// Sauvegarde des listes de souhaits de cadeauclic.com/mes-cadeaux/.
// La page statique appelle cette route en CORS.
//   GET  /api/wishlist?k=<clé>        → { data, updated_at } (data null si vide)
//   POST /api/wishlist  {k, data}     → { ok, updated_at }
// La clé secrète (≥ 24 caractères, générée par la page) fait office d'accès :
// qui ne la connaît pas ne peut ni lire ni écrire.
// Table : saas/supabase/wishlists.sql (projet Supabase principal).
// ────────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
}
const MAX_BYTES = 1_000_000
const validKey = (k: unknown): k is string => typeof k === 'string' && /^[A-Za-z0-9_-]{24,80}$/.test(k)

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: NextRequest) {
  const k = req.nextUrl.searchParams.get('k')
  if (!validKey(k)) return NextResponse.json({ error: 'Clé invalide' }, { status: 400, headers: CORS })
  if (!supabaseConfigured) return NextResponse.json({ error: 'Supabase non configuré' }, { status: 503, headers: CORS })

  const { data, error } = await supabase.from('wishlists').select('data, updated_at').eq('id', k).maybeSingle()
  if (error) return NextResponse.json({ error: 'Lecture impossible', detail: error.message }, { status: 500, headers: CORS })
  return NextResponse.json({ data: data?.data ?? null, updated_at: data?.updated_at ?? null }, { headers: CORS })
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: 'Données trop volumineuses' }, { status: 413, headers: CORS })
  let body: { k?: unknown; data?: unknown }
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400, headers: CORS }) }

  const { k, data } = body
  if (!validKey(k)) return NextResponse.json({ error: 'Clé invalide' }, { status: 400, headers: CORS })
  if (!data || typeof data !== 'object') return NextResponse.json({ error: 'Données manquantes' }, { status: 400, headers: CORS })
  if (!supabaseConfigured) return NextResponse.json({ error: 'Supabase non configuré' }, { status: 503, headers: CORS })

  const updated_at = new Date().toISOString()
  const { error } = await supabase.from('wishlists').upsert({ id: k, data, updated_at }, { onConflict: 'id' })
  if (error) return NextResponse.json({ error: 'Enregistrement impossible', detail: error.message }, { status: 500, headers: CORS })
  return NextResponse.json({ ok: true, updated_at }, { headers: CORS })
}
