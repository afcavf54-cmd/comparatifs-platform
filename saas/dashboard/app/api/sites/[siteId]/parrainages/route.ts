import { NextRequest, NextResponse } from 'next/server'
import { captain, captainConfigured, slugify, Parrainage } from '../../../../../lib/captain'

// Admin des offres de parrainage (site captain-parrainage, projet Supabase dédié).
const CAPTAIN = 'captain-parrainage'

function guard(siteId: string) {
  if (siteId !== CAPTAIN) return NextResponse.json({ error: 'Non applicable à ce site.' }, { status: 404 })
  if (!captainConfigured) return NextResponse.json({ error: 'Supabase captain non configuré (CAPTAIN_SUPABASE_URL / CAPTAIN_SUPABASE_SERVICE_ROLE).' }, { status: 500 })
  return null
}

// GET : liste toutes les offres (actives et inactives) pour l'admin.
export async function GET(_req: NextRequest, { params }: { params: { siteId: string } }) {
  const g = guard(params.siteId); if (g) return g
  const { data, error } = await captain
    .from('parrainages').select('*')
    .order('ordre', { ascending: true }).order('montant', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ offers: data || [] })
}

// POST : crée une offre.
export async function POST(req: NextRequest, { params }: { params: { siteId: string } }) {
  const g = guard(params.siteId); if (g) return g
  const body = (await req.json()) as Parrainage
  if (!body.marque || !body.lien) return NextResponse.json({ error: 'Marque et lien obligatoires.' }, { status: 400 })
  const row: Parrainage = {
    marque: body.marque,
    slug: body.slug && body.slug.trim() ? slugify(body.slug) : slugify(body.marque),
    categorie: body.categorie || null,
    montant: body.montant ?? null,
    // Un montant sans dépôt > 0 implique une offre "sans dépôt" (évite d'avoir
    // à cocher la case en plus de saisir le montant).
    sans_depot: !!body.sans_depot || Number(body.montant_sans_depot) > 0,
    montant_sans_depot: body.montant_sans_depot ?? null,
    conditions: body.conditions || null,
    lien: body.lien,
    code_parrainage: body.code_parrainage || null,
    logo_url: body.logo_url || null,
    couleur: body.couleur || null,
    nouveau: !!body.nouveau,
    en_avant: !!body.en_avant,
    acces_libre: !!body.acces_libre,
    ordre: body.ordre ?? 0,
    actif: body.actif === undefined ? true : !!body.actif,
    verifie_le: body.verifie_le || new Date().toISOString().slice(0, 10),
  }
  const { data, error } = await captain.from('parrainages').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ offer: data })
}
