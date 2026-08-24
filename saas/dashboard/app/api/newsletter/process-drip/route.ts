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

  // Campagnes échelonnées en cours, dont le dernier lot date de >= 20h
  // (garde anti double-envoi si le cron tourne plusieurs fois).
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

  return NextResponse.json({ ok: true, processed: report.length, report })
}
