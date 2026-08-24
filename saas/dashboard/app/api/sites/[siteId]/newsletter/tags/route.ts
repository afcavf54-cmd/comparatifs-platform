import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseConfigured } from '../../../../../../lib/supabase'

// ─── GET : liste des tags + nb d'abonnés par tag ────────────────────────
export async function GET() {
  if (!supabaseConfigured) return NextResponse.json({ error: 'Supabase non configuré : vérifie SUPABASE_URL et SUPABASE_SERVICE_ROLE dans Vercel, puis redéploie.' }, { status: 503 })

  const { data: tags, error } = await supabase.from('tags').select('id,name,color').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: links } = await supabase.from('subscriber_tags').select('tag_id')
  const counts: Record<string, number> = {}
  ;(links || []).forEach(l => { counts[l.tag_id] = (counts[l.tag_id] || 0) + 1 })
  return NextResponse.json({ tags: (tags || []).map(t => ({ ...t, count: counts[t.id] || 0 })) })
}

// ─── POST : créer un tag ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!supabaseConfigured) return NextResponse.json({ error: 'Supabase non configuré : vérifie SUPABASE_URL et SUPABASE_SERVICE_ROLE dans Vercel, puis redéploie.' }, { status: 503 })

  const { name, color } = await req.json().catch(() => ({}))
  const nm = String(name || '').trim()
  if (!nm) return NextResponse.json({ error: 'nom requis' }, { status: 400 })
  const { data, error } = await supabase
    .from('tags')
    .insert({ name: nm, color: String(color || '#3b82f6') })
    .select('id,name,color')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tag: { ...data, count: 0 } })
}

// ─── DELETE : supprimer un tag (les liaisons partent en cascade) ─────────
export async function DELETE(req: NextRequest) {
  if (!supabaseConfigured) return NextResponse.json({ error: 'Supabase non configuré : vérifie SUPABASE_URL et SUPABASE_SERVICE_ROLE dans Vercel, puis redéploie.' }, { status: 503 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const { error } = await supabase.from('tags').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
