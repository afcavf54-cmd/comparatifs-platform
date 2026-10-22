import { NextRequest, NextResponse } from 'next/server'
import { captain, captainConfigured, slugify, Parrainage } from '../../../../../../lib/captain'

const CAPTAIN = 'captain-parrainage'
function guard(siteId: string) {
  if (siteId !== CAPTAIN) return NextResponse.json({ error: 'Non applicable.' }, { status: 404 })
  if (!captainConfigured) return NextResponse.json({ error: 'Supabase captain non configuré.' }, { status: 500 })
  return null
}

// PUT : met à jour une offre.
export async function PUT(req: NextRequest, { params }: { params: { siteId: string; id: string } }) {
  const g = guard(params.siteId); if (g) return g
  const body = (await req.json()) as Parrainage
  const patch: Partial<Parrainage> = {}
  const fields: (keyof Parrainage)[] = ['marque', 'categorie', 'montant', 'sans_depot', 'montant_sans_depot',
    'conditions', 'lien', 'code_parrainage', 'logo_url', 'couleur', 'nouveau', 'en_avant', 'acces_libre', 'ordre', 'actif', 'verifie_le']
  fields.forEach(f => { if (body[f] !== undefined) (patch as any)[f] = body[f] })
  if (body.slug !== undefined) patch.slug = slugify(body.slug || body.marque || '')
  const { data, error } = await captain.from('parrainages').update(patch).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ offer: data })
}

// DELETE : supprime une offre.
export async function DELETE(_req: NextRequest, { params }: { params: { siteId: string; id: string } }) {
  const g = guard(params.siteId); if (g) return g
  const { error } = await captain.from('parrainages').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
