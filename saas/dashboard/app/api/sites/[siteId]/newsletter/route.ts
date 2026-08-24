import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseConfigured } from '../../../../../lib/supabase'
import { wrapEmail, resendBatch } from '../../../../../lib/newsletter-send'

const RESEND_KEY = process.env.RESEND_API_KEY

// ─── GET : historique des newsletters ───────────────────────────────────
export async function GET() {
  if (!supabaseConfigured) return NextResponse.json({ error: 'Supabase non configuré : vérifie SUPABASE_URL et SUPABASE_SERVICE_ROLE dans Vercel, puis redéploie.' }, { status: 503 })

  const { data, error } = await supabase
    .from('newsletters')
    .select('id,subject,status,target_tags,recipient_count,sent_count,fail_count,scheduled_at,sent_at,error,created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ newsletters: data || [] })
}

// ─── POST : test / envoi / programmation ────────────────────────────────
// body = { mode: 'test'|'send'|'schedule', subject, html, target_tags?:[ids], test_email?, scheduled_at? }
export async function POST(req: NextRequest) {
  if (!supabaseConfigured) return NextResponse.json({ error: 'Supabase non configuré : vérifie SUPABASE_URL et SUPABASE_SERVICE_ROLE dans Vercel, puis redéploie.' }, { status: 503 })

  if (!RESEND_KEY) return NextResponse.json({ error: 'RESEND_API_KEY manquante (Vercel)' }, { status: 500 })
  const body = await req.json().catch(() => ({}))
  const mode = body.mode || 'send'
  const subject = String(body.subject || '').trim()
  const html = String(body.html || '').trim()
  const targetTags: string[] = Array.isArray(body.target_tags) ? body.target_tags : []
  if (!subject) return NextResponse.json({ error: 'Sujet requis' }, { status: 400 })
  if (!html) return NextResponse.json({ error: 'Contenu requis' }, { status: 400 })

  const origin = req.nextUrl.origin
  const unsub = (id: string) => `${origin}/api/newsletter/unsubscribe?id=${id}`

  // ── TEST : envoi à une seule adresse ──
  if (mode === 'test') {
    const to = String(body.test_email || '').trim()
    if (!to) return NextResponse.json({ error: 'Email de test requis' }, { status: 400 })
    const { sent, failed } = await resendBatch([{ to, subject: `[TEST] ${subject}`, html: wrapEmail(html, unsub('test')) }])
    if (failed) return NextResponse.json({ error: 'Échec de l\'envoi test (vérifie la clé Resend / le domaine)' }, { status: 500 })
    return NextResponse.json({ ok: true, sent })
  }

  // ── Résoudre les destinataires (actifs, filtrés par tags si fournis) ──
  let subIds: string[] | null = null
  if (targetTags.length) {
    const { data: links } = await supabase.from('subscriber_tags').select('subscriber_id').in('tag_id', targetTags)
    subIds = [...new Set((links || []).map(l => l.subscriber_id))]
    if (!subIds.length) return NextResponse.json({ error: 'Aucun abonné pour ces tags' }, { status: 400 })
  }
  let q = supabase.from('subscribers').select('id,email').eq('status', 'active')
  if (subIds) q = q.in('id', subIds)
  const { data: recips, error: rErr } = await q
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })
  const recipients = recips || []
  if (!recipients.length) return NextResponse.json({ error: 'Aucun destinataire actif' }, { status: 400 })

  // ── PROGRAMMATION : on enregistre sans envoyer ──
  if (mode === 'schedule') {
    const scheduled_at = body.scheduled_at
    if (!scheduled_at) return NextResponse.json({ error: 'Date de programmation requise' }, { status: 400 })
    const { data, error } = await supabase.from('newsletters').insert({
      subject, html, status: 'scheduled', target_tags: targetTags,
      recipient_count: recipients.length, scheduled_at,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, scheduled: true, id: data.id, recipient_count: recipients.length })
  }

  // ── ENVOI IMMÉDIAT ou ÉCHELONNÉ (drip) ──
  const dripPerDay = Math.max(0, parseInt(body.drip_per_day, 10) || 0)

  // Envoi échelonné : on prépare la campagne + la liste, on envoie le 1er lot,
  // le cron quotidien enverra les lots suivants.
  if (dripPerDay > 0) {
    const { data: nl, error: nlErr } = await supabase.from('newsletters').insert({
      subject, html, status: 'sending', target_tags: targetTags,
      recipient_count: recipients.length, drip_per_day: dripPerDay,
      last_batch_at: new Date().toISOString(),
    }).select('id').single()
    if (nlErr || !nl) return NextResponse.json({ error: nlErr?.message || 'Création campagne KO' }, { status: 500 })

    // Liste des destinataires (tous en attente)
    const rows = recipients.map(r => ({ newsletter_id: nl.id, subscriber_id: r.id, email: r.email, status: 'pending' }))
    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from('newsletter_recipients').insert(rows.slice(i, i + 500))
    }

    // 1er lot tout de suite
    const firstBatch = recipients.slice(0, dripPerDay)
    const items = firstBatch.map(r => ({ to: r.email, subject, html: wrapEmail(html, unsub(r.id)) }))
    const { sent, failed } = await resendBatch(items)
    const ids = firstBatch.map(r => r.id)
    await supabase.from('newsletter_recipients').update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('newsletter_id', nl.id).in('subscriber_id', ids)
    await supabase.from('newsletters').update({ sent_count: sent, fail_count: failed }).eq('id', nl.id)

    return NextResponse.json({ ok: true, drip: true, per_day: dripPerDay, first_batch: sent, total: recipients.length })
  }

  // ── ENVOI IMMÉDIAT (tout d'un coup) ──
  const { data: nl } = await supabase.from('newsletters').insert({
    subject, html, status: 'sending', target_tags: targetTags, recipient_count: recipients.length,
  }).select('id').single()

  const items = recipients.map(r => ({ to: r.email, subject, html: wrapEmail(html, unsub(r.id)) }))
  const { sent, failed } = await resendBatch(items)

  const status = failed === 0 ? 'sent' : (sent === 0 ? 'failed' : 'sent')
  if (nl?.id) {
    await supabase.from('newsletters').update({
      status, sent_count: sent, fail_count: failed, sent_at: new Date().toISOString(),
      error: failed ? `${failed} échec(s)` : null,
    }).eq('id', nl.id)
  }
  return NextResponse.json({ ok: true, sent, failed, recipient_count: recipients.length })
}
