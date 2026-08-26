import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseConfigured } from '../../../../lib/supabase'

// Endpoint PUBLIC d'inscription à la newsletter (appelé depuis les sites statiques).
// CORS ouvert (formulaire public) ; on ne fait qu'ajouter un email + un tag.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest) {
  if (!supabaseConfigured) {
    return NextResponse.json({ error: 'Service indisponible' }, { status: 503, headers: CORS })
  }
  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const tagName = (String(body.tag || 'Blog').trim() || 'Blog').slice(0, 40)
  // Validation email basique
  if (!email || email.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Adresse email invalide' }, { status: 400, headers: CORS })
  }

  // Abonné : créer s'il n'existe pas (sinon réutiliser)
  const { data: existing } = await supabase.from('subscribers').select('id,status').eq('email', email).maybeSingle()
  let subId = existing?.id as string | undefined
  if (!subId) {
    const { data: ins, error } = await supabase.from('subscribers')
      .insert({ email, name: '', status: 'active', source: 'formulaire' })
      .select('id').single()
    if (error || !ins) return NextResponse.json({ error: 'Erreur enregistrement' }, { status: 500, headers: CORS })
    subId = ins.id
  } else if (existing?.status === 'unsubscribed') {
    // Réabonnement si la personne se réinscrit volontairement
    await supabase.from('subscribers').update({ status: 'active' }).eq('id', subId)
  }

  // Tag : récupérer ou créer
  let tagId: string | undefined
  const { data: t } = await supabase.from('tags').select('id').ilike('name', tagName).maybeSingle()
  tagId = t?.id
  if (!tagId) {
    const { data: nt } = await supabase.from('tags').insert({ name: tagName, color: '#E8410A' }).select('id').single()
    tagId = nt?.id
  }
  if (tagId && subId) {
    await supabase.from('subscriber_tags')
      .upsert({ subscriber_id: subId, tag_id: tagId }, { onConflict: 'subscriber_id,tag_id', ignoreDuplicates: true })
  }

  return NextResponse.json({ ok: true }, { headers: CORS })
}
