import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseConfigured } from '../../../../../../lib/supabase'
import { mcf, mcfConfigured } from '../../../../../../lib/mcf'

// ────────────────────────────────────────────────────────────────────────
// Édition d'un inscrit du simulateur mon-credit-facile.
//  - action 'email'  : renomme l'email (Supabase centrale + leads mcf)
//  - action 'tags'   : fixe la liste exacte de tags (centrale ; crée l'abonné si absent)
//  - action 'status' : active / désinscrit
//  - action 'delete' : supprime l'abonné central ET le lead mcf
// La clé commune est l'email (en minuscules).
// ────────────────────────────────────────────────────────────────────────
const MCF = 'mon-credit-facile-fr'
const isEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)

async function ensureSubscriber(email: string): Promise<string | null> {
  const { data } = await supabase.from('subscribers').select('id').eq('email', email).maybeSingle()
  if (data?.id) return data.id
  const { data: ins } = await supabase.from('subscribers').insert({ email, status: 'active', source: 'simulateur' }).select('id').single()
  return ins?.id || null
}

export async function PATCH(req: NextRequest, { params }: { params: { siteId: string } }) {
  if (params.siteId !== MCF) return NextResponse.json({ error: 'Non applicable.' }, { status: 404 })
  if (!supabaseConfigured) return NextResponse.json({ error: 'Newsletter centrale non configurée (SUPABASE_URL / SUPABASE_SERVICE_ROLE).' }, { status: 503 })

  const b = await req.json().catch(() => ({}))
  const action = String(b.action || '')
  const email = String(b.email || '').trim().toLowerCase()
  if (!email || !isEmail(email)) return NextResponse.json({ error: 'Email invalide' }, { status: 400 })

  // ── Renommer l'email ──
  if (action === 'email') {
    const newEmail = String(b.newEmail || '').trim().toLowerCase()
    if (!isEmail(newEmail)) return NextResponse.json({ error: 'Nouvel email invalide' }, { status: 400 })
    if (newEmail === email) return NextResponse.json({ ok: true })
    // Refus si le nouvel email existe déjà (centrale ou leads)
    const { data: clashSub } = await supabase.from('subscribers').select('id').eq('email', newEmail).maybeSingle()
    if (clashSub) return NextResponse.json({ error: 'Cet email existe déjà dans les abonnés.' }, { status: 409 })
    if (mcfConfigured) {
      const { data: clashLead } = await mcf.from('leads').select('id').eq('email', newEmail).maybeSingle()
      if (clashLead) return NextResponse.json({ error: 'Cet email existe déjà dans les leads.' }, { status: 409 })
    }
    const { error: e1 } = await supabase.from('subscribers').update({ email: newEmail }).eq('email', email)
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
    if (mcfConfigured) await mcf.from('leads').update({ email: newEmail }).eq('email', email)
    return NextResponse.json({ ok: true })
  }

  // ── Fixer les tags (liste exacte) ──
  if (action === 'tags') {
    const tagIds: string[] = Array.isArray(b.tagIds) ? b.tagIds.map(String) : []
    const subId = await ensureSubscriber(email)
    if (!subId) return NextResponse.json({ error: "Impossible de créer/retrouver l'abonné." }, { status: 500 })
    await supabase.from('subscriber_tags').delete().eq('subscriber_id', subId)
    if (tagIds.length) {
      const { error } = await supabase.from('subscriber_tags').insert(tagIds.map(t => ({ subscriber_id: subId, tag_id: t })))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  // ── Statut ──
  if (action === 'status') {
    const status = b.status === 'unsubscribed' ? 'unsubscribed' : 'active'
    const patch: any = { status }
    if (status === 'unsubscribed') patch.unsubscribed_at = new Date().toISOString()
    const subId = await ensureSubscriber(email)
    if (subId) await supabase.from('subscribers').update(patch).eq('id', subId)
    return NextResponse.json({ ok: true })
  }

  // ── Suppression ──
  if (action === 'delete') {
    await supabase.from('subscribers').delete().eq('email', email)
    if (mcfConfigured) await mcf.from('leads').delete().eq('email', email)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
}
