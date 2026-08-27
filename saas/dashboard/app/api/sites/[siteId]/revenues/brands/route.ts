import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseConfigured } from '../../../../../../lib/supabase'

const guard = () => NextResponse.json({ error: 'Supabase non configuré' }, { status: 503 })

// POST : ajouter une marque affiliée { name }
export async function POST(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  if (!supabaseConfigured) return guard()
  const { siteId } = await params
  const b = await req.json().catch(() => ({}))
  const name = String(b.name || '').trim().slice(0, 80)
  if (!name) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
  const { error } = await supabase.from('affiliate_brands')
    .upsert({ site: siteId, name }, { onConflict: 'site,name', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE : supprimer une marque (?id=)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  if (!supabaseConfigured) return guard()
  const { siteId } = await params
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const { error } = await supabase.from('affiliate_brands').delete().eq('site', siteId).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
