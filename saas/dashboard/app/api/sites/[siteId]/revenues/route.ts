import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseConfigured } from '../../../../../lib/supabase'

const CATS = ['adsense', 'affiliation', 'sponsoring']
const guard = () => NextResponse.json({ error: 'Supabase non configuré : vérifie SUPABASE_URL et SUPABASE_SERVICE_ROLE dans Vercel, puis redéploie.' }, { status: 503 })

// GET : tous les revenus du site + les marques affiliées
export async function GET(_req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  if (!supabaseConfigured) return guard()
  const { siteId } = await params
  const { data: revenues, error } = await supabase.from('revenues')
    .select('id,category,brand,amount,month,note,created_at')
    .eq('site', siteId)
    .order('month', { ascending: false }).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: brands } = await supabase.from('affiliate_brands')
    .select('id,name').eq('site', siteId).order('name')
  return NextResponse.json({ revenues: revenues || [], brands: brands || [] })
}

// POST : ajouter un revenu { category, brand?, amount, month, note? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  if (!supabaseConfigured) return guard()
  const { siteId } = await params
  const b = await req.json().catch(() => ({}))
  const category = String(b.category || '').trim()
  if (!CATS.includes(category)) return NextResponse.json({ error: 'Catégorie invalide' }, { status: 400 })
  const amount = Number(b.amount)
  if (!isFinite(amount) || amount < 0) return NextResponse.json({ error: 'Montant invalide' }, { status: 400 })
  const month = String(b.month || '').trim()
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Mois invalide (attendu AAAA-MM)' }, { status: 400 })
  const row = {
    site: siteId, category, amount, month,
    brand: category === 'affiliation' ? String(b.brand || '').trim().slice(0, 80) : '',
    note: String(b.note || '').trim().slice(0, 200),
  }
  const { data, error } = await supabase.from('revenues').insert(row).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

// PUT : modifier un revenu { id, category, brand?, amount, month, note? }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  if (!supabaseConfigured) return guard()
  const { siteId } = await params
  const b = await req.json().catch(() => ({}))
  const id = String(b.id || '')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const category = String(b.category || '').trim()
  if (!CATS.includes(category)) return NextResponse.json({ error: 'Catégorie invalide' }, { status: 400 })
  const amount = Number(b.amount)
  if (!isFinite(amount) || amount < 0) return NextResponse.json({ error: 'Montant invalide' }, { status: 400 })
  const month = String(b.month || '').trim()
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Mois invalide (attendu AAAA-MM)' }, { status: 400 })
  const patch = {
    category, amount, month,
    brand: category === 'affiliation' ? String(b.brand || '').trim().slice(0, 80) : '',
    note: String(b.note || '').trim().slice(0, 200),
  }
  const { error } = await supabase.from('revenues').update(patch).eq('site', siteId).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE : supprimer un revenu (?id=)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  if (!supabaseConfigured) return guard()
  const { siteId } = await params
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const { error } = await supabase.from('revenues').delete().eq('site', siteId).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
