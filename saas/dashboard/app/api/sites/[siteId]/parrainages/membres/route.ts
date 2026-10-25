import { NextRequest, NextResponse } from 'next/server'
import { captain, captainConfigured } from '../../../../../../lib/captain'

// Liste des membres inscrits (table profiles du projet captain).
const CAPTAIN = 'captain-parrainage'

export async function GET(_req: NextRequest, { params }: { params: { siteId: string } }) {
  if (params.siteId !== CAPTAIN) return NextResponse.json({ error: 'Non applicable.' }, { status: 404 })
  if (!captainConfigured) return NextResponse.json({ error: 'Supabase captain non configuré.' }, { status: 500 })

  const { data, error } = await captain
    .from('profiles')
    .select('email, newsletter_opt_in, consent_at, created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const members = data || []
  const optin = members.filter((m: any) => m.newsletter_opt_in).length
  return NextResponse.json({ members, total: members.length, optin })
}
