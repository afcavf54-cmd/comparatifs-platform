import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseConfigured } from '../../../../lib/supabase'
import { wrapEmail, resendBatch } from '../../../../lib/newsletter-send'

// ────────────────────────────────────────────────────────────────────────
// CRON : envoie le lot du jour pour chaque campagne échelonnée en cours.
// Protégé par un secret (header Authorization: Bearer <CRON_SECRET>).
// Appelé quotidiennement par la GitHub Action newsletter-drip.yml.
// ────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  if (!supabaseConfigured) return NextResponse.json({ error: 'Supabase non configuré' }, { status: 503 })

  const origin = req.nextUrl.origin
  const unsub = (id: string) => `${origin}/api/newsletter/unsubscribe?id=${id}`
  const nowIso = new Date().toISOString()

  // ════════════════════════════════════════════════════════════════════
  // 1) Newsletters PROGRAMMÉES arrivées à échéance (scheduled_at <= maintenant)
  // ════════════════════════════════════════════════════════════════════
  const schedReport: any[] = []
  const { data: scheduled } = await supabase
    .from('newsletters')
    .select('id,subject,html,target_tags')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
  for (const nl of scheduled || []) {
    // Verrou anti double-envoi : on ne traite que si c'est encore 'scheduled'
    const { data: locked } = await supabase.from('newsletters')
      .update({ status: 'sending' }).eq('id', nl.id).eq('status', 'scheduled').select('id')
    if (!locked || !locked.length) continue

    // Résoudre les destinataires depuis les tags (ou tous les actifs si aucun tag)
    const tags: string[] = Array.isArray(nl.target_tags) ? nl.target_tags : []
    let ids: string[] | null = null
    if (tags.length) {
      const { data: st } = await supabase.from('subscriber_tags').select('subscriber_id').in('tag_id', tags)
      ids = Array.from(new Set((st || []).map((x: any) => x.subscriber_id)))
      if (!ids.length) {
        await supabase.from('newsletters').update({ status: 'sent', sent_at: nowIso, sent_count: 0, error: 'Aucun abonné pour ces tags' }).eq('id', nl.id)
        schedReport.push({ id: nl.id, sent: 0, note: 'aucun abonné' }); continue
      }
    }
    let q = supabase.from('subscribers').select('id,email').eq('status', 'active')
    if (ids) q = q.in('id', ids)
    const { data: recipients } = await q
    const list = recipients || []
    const items = list.map((r: any) => ({ to: r.email, subject: nl.subject, html: wrapEmail(nl.html, unsub(r.id)) }))
    const { sent, failed } = await resendBatch(items)
    await supabase.from('newsletters').update({
      status: 'sent', sent_at: nowIso, sent_count: sent, fail_count: failed,
      error: failed ? `${failed} échec(s)` : null,
    }).eq('id', nl.id)
    schedReport.push({ id: nl.id, sent, failed })
  }

  // ════════════════════════════════════════════════════════════════════
  // 2) Campagnes ÉCHELONNÉES (drip) — lot suivant
  // ════════════════════════════════════════════════════════════════════
  const cutoff = new Date(Date.now() - 20 * 3600 * 1000).toISOString()
  const { data: campaigns, error } = await supabase
    .from('newsletters')
    .select('id,subject,html,drip_per_day,last_batch_at,sent_count,fail_count')
    .eq('status', 'sending')
    .gt('drip_per_day', 0)
    .or(`last_batch_at.is.null,last_batch_at.lt.${cutoff}`)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const report: any[] = []
  for (const c of campaigns || []) {
    // Prochain lot de destinataires en attente
    const { data: pend } = await supabase
      .from('newsletter_recipients')
      .select('subscriber_id,email')
      .eq('newsletter_id', c.id).eq('status', 'pending')
      .limit(c.drip_per_day)
    const batch = pend || []

    if (!batch.length) {
      // Plus rien à envoyer → campagne terminée
      await supabase.from('newsletters').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', c.id)
      report.push({ id: c.id, done: true })
      continue
    }

    const items = batch.map(r => ({ to: r.email, subject: c.subject, html: wrapEmail(c.html, unsub(r.subscriber_id)) }))
    const { sent, failed } = await resendBatch(items)
    const ids = batch.map(r => r.subscriber_id)
    await supabase.from('newsletter_recipients')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('newsletter_id', c.id).in('subscriber_id', ids)

    // Reste-t-il des destinataires en attente ?
    const { count: remaining } = await supabase
      .from('newsletter_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('newsletter_id', c.id).eq('status', 'pending')

    await supabase.from('newsletters').update({
      last_batch_at: new Date().toISOString(),
      sent_count: (c.sent_count || 0) + sent,
      fail_count: (c.fail_count || 0) + failed,
      ...(remaining === 0 ? { status: 'sent', sent_at: new Date().toISOString() } : {}),
    }).eq('id', c.id)

    report.push({ id: c.id, sent, failed, remaining })
  }

  return NextResponse.json({ ok: true, scheduled: schedReport.length, drip: report.length, schedReport, report })
}
