import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseConfigured } from '../../../../lib/supabase'

// Endpoint PUBLIC : enregistre (ou supprime) une subscription push d'un visiteur.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// POST : { subscription: {endpoint, keys:{p256dh, auth}}, site? }
export async function POST(req: NextRequest) {
  if (!supabaseConfigured) return NextResponse.json({ error: 'Indisponible' }, { status: 503, headers: CORS })
  const body = await req.json().catch(() => ({}))
  const sub = body.subscription || {}
  const endpoint = String(sub.endpoint || '')
  const p256dh = String(sub.keys?.p256dh || '')
  const auth = String(sub.keys?.auth || '')
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Subscription invalide' }, { status: 400, headers: CORS })
  }
  const row = {
    endpoint, p256dh, auth,
    site: String(body.site || '').slice(0, 60),
    user_agent: (req.headers.get('user-agent') || '').slice(0, 300),
  }
  const { error } = await supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })
  return NextResponse.json({ ok: true }, { headers: CORS })
}

// DELETE : { endpoint }  (désabonnement)
export async function DELETE(req: NextRequest) {
  if (!supabaseConfigured) return NextResponse.json({ error: 'Indisponible' }, { status: 503, headers: CORS })
  const body = await req.json().catch(() => ({}))
  const endpoint = String(body.endpoint || '')
  if (!endpoint) return NextResponse.json({ error: 'endpoint requis' }, { status: 400, headers: CORS })
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  return NextResponse.json({ ok: true }, { headers: CORS })
}
