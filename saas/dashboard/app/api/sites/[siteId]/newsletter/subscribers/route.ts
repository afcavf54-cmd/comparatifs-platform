import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseConfigured } from '../../../../../../lib/supabase'

// ─── GET : liste des abonnés + leurs tags ───────────────────────────────
export async function GET() {
  if (!supabaseConfigured) return NextResponse.json({ error: 'Supabase non configuré : vérifie SUPABASE_URL et SUPABASE_SERVICE_ROLE dans Vercel, puis redéploie.' }, { status: 503 })

  const { data: subs, error } = await supabase
    .from('subscribers')
    .select('id,email,name,status,source,created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: links } = await supabase.from('subscriber_tags').select('subscriber_id,tag_id')
  const { data: tags } = await supabase.from('tags').select('id,name,color')
  const tagById: Record<string, any> = Object.fromEntries((tags || []).map(t => [t.id, t]))
  const bySub: Record<string, any[]> = {}
  ;(links || []).forEach(l => { (bySub[l.subscriber_id] ||= []).push(tagById[l.tag_id]) })

  const subscribers = (subs || []).map(s => ({ ...s, tags: (bySub[s.id] || []).filter(Boolean) }))
  const active = subscribers.filter(s => s.status === 'active').length
  return NextResponse.json({ subscribers, count: subscribers.length, active })
}

// ─── POST : import en masse (ou ajout unique) ───────────────────────────
// body = { subscribers: [{email,name,tags?:[names]}], defaultTags?:[names] }
export async function POST(req: NextRequest) {
  if (!supabaseConfigured) return NextResponse.json({ error: 'Supabase non configuré : vérifie SUPABASE_URL et SUPABASE_SERVICE_ROLE dans Vercel, puis redéploie.' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const rows: any[] = Array.isArray(body.subscribers) ? body.subscribers : [body]
  const defaultTags: string[] = Array.isArray(body.defaultTags) ? body.defaultTags : []

  // Normalisation + dédup (par email, insensible à la casse)
  const clean: { email: string; name: string; status: string; source: string; created_at: string; _tags: string[] }[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const email = String(r?.email || '').trim().toLowerCase()
    if (!email || !email.includes('@') || seen.has(email)) continue
    seen.add(email)
    const rowTags = Array.isArray(r?.tags) ? r.tags : (r?.tags ? String(r.tags).split(/[;,|]/) : [])
    const st = String(r?.status || '').trim().toLowerCase()
    clean.push({
      email, name: String(r?.name || '').trim(),
      status: st === 'unsubscribed' ? 'unsubscribed' : 'active',
      source: String(r?.source || 'import'),
      created_at: String(r?.created_at || '').trim(),
      _tags: [...defaultTags, ...rowTags].map((t: string) => String(t).trim()).filter(Boolean),
    })
  }
  if (!clean.length) return NextResponse.json({ error: 'Aucun email valide trouvé' }, { status: 400 })

  // Dédup contre l'existant
  const emails = clean.map(c => c.email)
  const { data: existing } = await supabase.from('subscribers').select('id,email').in('email', emails)
  const existingByEmail: Record<string, string> = Object.fromEntries((existing || []).map(e => [e.email.toLowerCase(), e.id]))
  const toInsert = clean.filter(c => !existingByEmail[c.email])

  let insertedIds: Record<string, string> = {}
  if (toInsert.length) {
    const { data: ins, error } = await supabase
      .from('subscribers')
      .insert(toInsert.map(c => ({ email: c.email, name: c.name, status: c.status, source: c.source, ...(c.created_at ? { created_at: c.created_at } : {}) })))
      .select('id,email')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    insertedIds = Object.fromEntries((ins || []).map(e => [e.email.toLowerCase(), e.id]))
  }

  // Résoudre / créer les tags nécessaires
  const allTagNames = [...new Set(clean.flatMap(c => c._tags))]
  const tagIdByName: Record<string, string> = {}
  if (allTagNames.length) {
    const { data: existTags } = await supabase.from('tags').select('id,name')
    ;(existTags || []).forEach(t => { tagIdByName[t.name.toLowerCase()] = t.id })
    const missing = allTagNames.filter(n => !tagIdByName[n.toLowerCase()])
    if (missing.length) {
      const palette = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899']
      const { data: newTags } = await supabase
        .from('tags')
        .insert(missing.map((n, i) => ({ name: n, color: palette[i % palette.length] })))
        .select('id,name')
      ;(newTags || []).forEach(t => { tagIdByName[t.name.toLowerCase()] = t.id })
    }
  }

  // Associer les tags aux abonnés (nouveaux + existants)
  const linkRows: { subscriber_id: string; tag_id: string }[] = []
  for (const c of clean) {
    const subId = insertedIds[c.email] || existingByEmail[c.email]
    if (!subId) continue
    for (const tn of c._tags) {
      const tid = tagIdByName[tn.toLowerCase()]
      if (tid) linkRows.push({ subscriber_id: subId, tag_id: tid })
    }
  }
  if (linkRows.length) {
    await supabase.from('subscriber_tags').upsert(linkRows, { onConflict: 'subscriber_id,tag_id', ignoreDuplicates: true })
  }

  return NextResponse.json({
    imported: toInsert.length,
    skipped: clean.length - toInsert.length,
    total: clean.length,
  })
}

// ─── PATCH : modifier le statut d'un abonné ─────────────────────────────
export async function PATCH(req: NextRequest) {
  if (!supabaseConfigured) return NextResponse.json({ error: 'Supabase non configuré : vérifie SUPABASE_URL et SUPABASE_SERVICE_ROLE dans Vercel, puis redéploie.' }, { status: 503 })

  const { id, status } = await req.json().catch(() => ({}))
  if (!id || !status) return NextResponse.json({ error: 'id + status requis' }, { status: 400 })
  const patch: any = { status }
  if (status === 'unsubscribed') patch.unsubscribed_at = new Date().toISOString()
  const { error } = await supabase.from('subscribers').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ─── DELETE : supprimer un abonné ───────────────────────────────────────
export async function DELETE(req: NextRequest) {
  if (!supabaseConfigured) return NextResponse.json({ error: 'Supabase non configuré : vérifie SUPABASE_URL et SUPABASE_SERVICE_ROLE dans Vercel, puis redéploie.' }, { status: 503 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const { error } = await supabase.from('subscribers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
