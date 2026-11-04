import { NextRequest, NextResponse } from 'next/server'
import { mcf, mcfConfigured } from '../../../../../lib/mcf'

// ────────────────────────────────────────────────────────────────────────
// Liste des leads du simulateur mon-credit-facile (Supabase dédiée).
// Données propres au simulateur : type de crédit, montant, situation pro.
// Les tags / statut d'abonnement viennent de la newsletter centrale et sont
// rapprochés par email côté page (abonnes/page.tsx).
// ────────────────────────────────────────────────────────────────────────
const MCF = 'mon-credit-facile-fr'

export async function GET(_req: NextRequest, { params }: { params: { siteId: string } }) {
  if (params.siteId !== MCF) return NextResponse.json({ error: 'Non applicable.' }, { status: 404 })
  if (!mcfConfigured) return NextResponse.json({ error: 'Supabase mon-credit-facile non configuré (MCF_SUPABASE_URL / MCF_SUPABASE_SERVICE_ROLE sur Vercel).' }, { status: 503 })

  const { data, error } = await mcf
    .from('leads')
    .select('id,email,project,amount,situation,duration,optin,n_simulations,created_at,updated_at')
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data || [], count: (data || []).length })
}
