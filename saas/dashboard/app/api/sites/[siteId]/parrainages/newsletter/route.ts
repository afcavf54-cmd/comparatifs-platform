import { NextRequest, NextResponse } from 'next/server'
import { captain, captainConfigured } from '../../../../../../lib/captain'

// ────────────────────────────────────────────────────────────────────────
// Newsletter captain-parrainage (même fonctionnement que la newsletter Monelor).
//   GET  → historique des envois (table newsletter_envois)
//   POST → { mode:'test'|'send', subject, html, offerIds?, test_email? }
// Destinataires : membres (profiles) ayant newsletter_opt_in = true.
// ────────────────────────────────────────────────────────────────────────
const CAPTAIN = 'captain-parrainage'
const RESEND_KEY = process.env.RESEND_API_KEY
const FROM = process.env.CAPTAIN_NL_FROM || 'Captain Parrainage <no-reply@captain-parrainage.com>'
const SITE = 'https://www.captain-parrainage.com'

function guard(siteId: string) {
  if (siteId !== CAPTAIN) return NextResponse.json({ error: 'Non applicable.' }, { status: 404 })
  if (!captainConfigured) return NextResponse.json({ error: 'Supabase captain non configuré (CAPTAIN_SUPABASE_URL / CAPTAIN_SUPABASE_SERVICE_ROLE).' }, { status: 503 })
  return null
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
function eur(n: number | null | undefined) {
  if (n == null) return ''
  return new Intl.NumberFormat('fr-FR').format(Math.round(Number(n))) + ' €'
}

// Bloc « offres » ajouté sous le message (offres cochées dans le composer).
function offersHtml(offers: any[]) {
  if (!offers.length) return ''
  const rows = offers.map(o => {
    const acc = /^#[0-9a-f]{3,8}$/i.test(o.couleur || '') ? o.couleur : '#142B4F'
    const badge = o.sans_depot
      ? '<span style="background:#E3F7F3;color:#0B7F6F;font-size:12px;font-weight:600;padding:3px 9px;border-radius:999px">Sans dépôt</span>'
      : ''
    return `<tr><td style="padding:14px 0;border-bottom:1px solid #eee">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:top"><div style="font-weight:700;color:${acc};font-size:16px">${esc(o.marque)}</div>
            <div style="color:#5B6B84;font-size:13px">${esc(o.conditions || o.categorie || '')}</div></td>
        <td align="right" style="vertical-align:top;white-space:nowrap"><div style="font-weight:800;color:#000921;font-size:19px">${o.montant != null ? 'jusqu\'à ' + eur(o.montant) : ''}</div>${badge}</td>
      </tr></table>
      <a href="${esc(o.lien)}" style="display:inline-block;margin-top:9px;background:#F9BD43;color:#082044;font-weight:700;font-size:13px;text-decoration:none;padding:9px 18px;border-radius:999px">Voir l'offre →</a>
    </td></tr>`
  }).join('')
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px">${rows}</table>
  <p style="margin-top:18px"><a href="${SITE}/membre/" style="color:#000921;font-weight:600">Voir toutes les offres →</a></p>`
}

// Même gabarit que la newsletter Monelor (fond clair, contenu libre, pied de page + désinscription).
function wrapEmail(html: string, offers: any[], unsubUrl: string) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f5f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#fff">
  <div style="padding:28px 32px;color:#000921;font-size:16px;line-height:1.6">${html}${offersHtml(offers)}</div>
  <div style="padding:18px 32px;border-top:1px solid #eee;color:#8a95a8;font-size:12px;line-height:1.5">
    Vous recevez cet email car vous êtes inscrit à la newsletter Captain Parrainage.<br>
    <a href="${unsubUrl}" style="color:#8a95a8">Se désabonner</a>
  </div>
</div></body></html>`
}

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
      if (r.ok) sent += chunk.length; else failed += chunk.length
    } catch { failed += chunk.length }
  }
  return { sent, failed }
}

// ─── GET : historique ───────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: { siteId: string } }) {
  const g = guard(params.siteId); if (g) return g
  const { data, error } = await captain
    .from('newsletter_envois')
    .select('id, sujet, nb_destinataires, parrainage_ids, envoye_le, envoye_par')
    .order('envoye_le', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ newsletters: data || [] })
}

// ─── POST : test / envoi ────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: { siteId: string } }) {
  const g = guard(params.siteId); if (g) return g
  if (!RESEND_KEY) return NextResponse.json({ error: 'RESEND_API_KEY manquante (Vercel)' }, { status: 500 })

  const body = await req.json().catch(() => ({})) as { mode?: string; subject?: string; html?: string; offerIds?: string[]; test_email?: string }
  const mode = body.mode === 'test' ? 'test' : 'send'
  const subject = String(body.subject || '').trim()
  const html = String(body.html || '').trim()
  const offerIds = Array.isArray(body.offerIds) ? body.offerIds : []
  if (!subject) return NextResponse.json({ error: 'Sujet requis' }, { status: 400 })
  if ((!html || html === '<p></p>') && !offerIds.length) return NextResponse.json({ error: 'Contenu ou offre requis' }, { status: 400 })

  // Offres cochées (dans l'ordre d'affichage du site)
  let offers: any[] = []
  if (offerIds.length) {
    const { data, error } = await captain.from('parrainages').select('*').in('id', offerIds)
      .order('en_avant', { ascending: false }).order('montant', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    offers = data || []
  }

  const origin = req.nextUrl.origin
  const unsub = (id: string) => `${origin}/api/sites/${CAPTAIN}/parrainages/unsubscribe?id=${encodeURIComponent(id)}`

  if (mode === 'test') {
    const to = String(body.test_email || '').trim()
    if (!to || !to.includes('@')) return NextResponse.json({ error: 'Email de test requis' }, { status: 400 })
    const { failed } = await resendBatch([{ to, subject: `[TEST] ${subject}`, html: wrapEmail(html, offers, `${SITE}/connexion/`) }])
    if (failed) return NextResponse.json({ error: "Échec de l'envoi test (vérifie la clé Resend / le domaine d'envoi)" }, { status: 500 })
    return NextResponse.json({ ok: true, sent: 1 })
  }

  const { data: profs, error: pErr } = await captain.from('profiles').select('id, email').eq('newsletter_opt_in', true)
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  const recipients = (profs || []).filter((p: any) => p.email)
  if (!recipients.length) return NextResponse.json({ error: 'Aucun membre inscrit à la newsletter' }, { status: 400 })

  const items = recipients.map((p: any) => ({ to: p.email, subject, html: wrapEmail(html, offers, unsub(p.id)) }))
  const { sent, failed } = await resendBatch(items)

  await captain.from('newsletter_envois').insert({
    sujet: subject, contenu: wrapEmail(html, offers, `${SITE}/connexion/`), nb_destinataires: sent,
    parrainage_ids: offers.map(o => o.id), envoye_par: 'dashboard',
  })

  return NextResponse.json({ ok: true, sent, failed, recipient_count: recipients.length })
}
