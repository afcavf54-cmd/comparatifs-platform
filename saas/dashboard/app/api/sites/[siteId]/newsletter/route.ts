import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../../lib/supabase'

const FROM = 'Monelor <info@monelor.com>'
const RESEND_KEY = process.env.RESEND_API_KEY

// Enrobe le contenu dans un template email simple + lien de désinscription perso.
function wrapEmail(html: string, subject: string, unsubUrl: string) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f5f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#fff">
  <div style="padding:28px 32px;color:#000921;font-size:16px;line-height:1.6">${html}</div>
  <div style="padding:18px 32px;border-top:1px solid #eee;color:#8a95a8;font-size:12px;line-height:1.5">
    Vous recevez cet email car vous êtes inscrit à la newsletter Monelor.<br>
    <a href="${unsubUrl}" style="color:#8a95a8">Se désabonner</a>
  </div>
</div></body></html>`
}

// Envoi par lots de 100 via l'API batch Resend (chaque destinataire = email individuel).
async function resendBatch(items: { to: string; subject: string; html: string }[]) {
  let sent = 0, failed = 0
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100).map(e => ({ from: FROM, to: [e.to], subject: e.subject, html: e.html }))
    try {
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      })
      if (r.ok) sent += chunk.length
      else { failed += chunk.length }
    } catch { failed += chunk.length }
  }
  return { sent, failed }
}

// ─── GET : historique des newsletters ───────────────────────────────────
export async function GET() {
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
    const { sent, failed } = await resendBatch([{ to, subject: `[TEST] ${subject}`, html: wrapEmail(html, subject, unsub('test')) }])
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

  // ── ENVOI IMMÉDIAT ──
  const { data: nl } = await supabase.from('newsletters').insert({
    subject, html, status: 'sending', target_tags: targetTags, recipient_count: recipients.length,
  }).select('id').single()

  const items = recipients.map(r => ({ to: r.email, subject, html: wrapEmail(html, subject, unsub(r.id)) }))
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
