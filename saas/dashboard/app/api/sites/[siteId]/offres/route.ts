import { NextRequest, NextResponse } from 'next/server'
import { mcf, mcfConfigured, slugify, Offre } from '../../../../../lib/mcf'

// Admin des offres du simulateur mon-credit-facile (projet Supabase dédié).
const MCF = 'mon-credit-facile-fr'

function guard(siteId: string) {
  if (siteId !== MCF) return NextResponse.json({ error: 'Non applicable à ce site.' }, { status: 404 })
  if (!mcfConfigured) return NextResponse.json({ error: 'Supabase mon-credit-facile non configuré (MCF_SUPABASE_URL / MCF_SUPABASE_SERVICE_ROLE).' }, { status: 500 })
  return null
}

// GET : liste toutes les offres (actives et inactives) pour l'admin.
export async function GET(_req: NextRequest, { params }: { params: { siteId: string } }) {
  const g = guard(params.siteId); if (g) return g
  const { data, error } = await mcf
    .from('offres').select('*')
    .order('type', { ascending: true })
    .order('ordre', { ascending: true })
    .order('montant_max', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ offers: data || [] })
}

// POST : crée une offre.
export async function POST(req: NextRequest, { params }: { params: { siteId: string } }) {
  const g = guard(params.siteId); if (g) return g
  const body = (await req.json()) as Offre
  if (!body.organisme || !body.url) return NextResponse.json({ error: 'Organisme et lien obligatoires.' }, { status: 400 })
  const type: 'credit' | 'parrainage' = body.type === 'parrainage' ? 'parrainage' : 'credit'
  const row: Offre = {
    type,
    organisme: body.organisme,
    slug: body.slug && body.slug.trim() ? slugify(body.slug) : slugify(body.organisme),
    categorie: body.categorie || null,
    montant_min: body.montant_min ?? null,
    montant_max: body.montant_max ?? null,
    durees: body.durees || null,
    taeg: body.taeg || null,
    prime: body.prime || null,
    depot: body.depot || null,
    description: body.description || null,
    conditions: body.conditions || null,
    logo_url: body.logo_url || null,
    url: body.url,
    mise_en_avant: !!body.mise_en_avant,
    ordre: body.ordre ?? 0,
    valide_du: body.valide_du || null,
    valide_au: body.valide_au || null,
    verifie_le: body.verifie_le || new Date().toISOString().slice(0, 10),
    demo: !!body.demo,
    actif: body.actif === undefined ? true : !!body.actif,
  }
  const { data, error } = await mcf.from('offres').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ offer: data })
}
