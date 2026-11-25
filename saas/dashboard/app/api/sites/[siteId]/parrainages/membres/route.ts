import { NextRequest, NextResponse } from 'next/server'
import { captain, captainConfigured } from '../../../../../../lib/captain'

// Liste des membres inscrits (table profiles du projet captain).
const CAPTAIN = 'captain-parrainage'

export async function GET(_req: NextRequest, { params }: { params: { siteId: string } }) {
  if (params.siteId !== CAPTAIN) return NextResponse.json({ error: 'Non applicable.' }, { status: 404 })
  if (!captainConfigured) return NextResponse.json({ error: 'Supabase captain non configuré.' }, { status: 500 })

  const { data, error } = await captain
    .from('profiles')
    .select('id, email, newsletter_opt_in, consent_at, created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const members = data || []
  const optin = members.filter((m: any) => m.newsletter_opt_in).length
  return NextResponse.json({ members, total: members.length, optin })
}

// PATCH : active / coupe la newsletter d'un membre. body = { id, newsletter_opt_in }
export async function PATCH(req: NextRequest, { params }: { params: { siteId: string } }) {
  if (params.siteId !== CAPTAIN) return NextResponse.json({ error: 'Non applicable.' }, { status: 404 })
  if (!captainConfigured) return NextResponse.json({ error: 'Supabase captain non configuré.' }, { status: 500 })
  const body = await req.json().catch(() => ({})) as { id?: string; newsletter_opt_in?: boolean }
  if (!body.id || typeof body.newsletter_opt_in !== 'boolean') return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 })
  const { error } = await captain.from('profiles').update({ newsletter_opt_in: body.newsletter_opt_in }).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
