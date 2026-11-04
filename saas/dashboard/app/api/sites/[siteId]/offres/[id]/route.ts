import { NextRequest, NextResponse } from 'next/server'
import { mcf, mcfConfigured, slugify, Offre } from '../../../../../../lib/mcf'

const MCF = 'mon-credit-facile-fr'
function guard(siteId: string) {
  if (siteId !== MCF) return NextResponse.json({ error: 'Non applicable.' }, { status: 404 })
  if (!mcfConfigured) return NextResponse.json({ error: 'Supabase mon-credit-facile non configuré.' }, { status: 500 })
  return null
}

// PUT : met à jour une offre.
export async function PUT(req: NextRequest, { params }: { params: { siteId: string; id: string } }) {
  const g = guard(params.siteId); if (g) return g
  const body = (await req.json()) as Offre
  const patch: Partial<Offre> = {}
  const fields: (keyof Offre)[] = ['type', 'organisme', 'categorie', 'montant_min', 'montant_max', 'durees', 'taeg',
    'prime', 'depot', 'description', 'conditions', 'logo_url', 'url', 'mise_en_avant', 'ordre',
    'valide_du', 'valide_au', 'verifie_le', 'demo', 'actif']
  fields.forEach(f => { if (body[f] !== undefined) (patch as any)[f] = body[f] })
  if (body.slug !== undefined) patch.slug = slugify(body.slug || body.organisme || '')
  const { data, error } = await mcf.from('offres').update(patch).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ offer: data })
}

// DELETE : supprime une offre.
export async function DELETE(_req: NextRequest, { params }: { params: { siteId: string; id: string } }) {
  const g = guard(params.siteId); if (g) return g
  const { error } = await mcf.from('offres').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
