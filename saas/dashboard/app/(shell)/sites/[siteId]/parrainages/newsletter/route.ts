import { NextRequest, NextResponse } from 'next/server'
import { captain, captainConfigured } from '../../../../../../lib/captain'

const CAPTAIN = 'captain-parrainage'
const RESEND_KEY = process.env.RESEND_API_KEY
const FROM = process.env.CAPTAIN_NL_FROM || 'Captain Parrainage <no-reply@captain-parrainage.com>'
const SITE = 'https://www.captain-parrainage.com'

function eur(n: number | null | undefined) {
  if (n == null) return ''
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' €'
}

function offersHtml(offers: any[]) {
  return offers.map(o => {
    const badge = o.sans_depot
      ? '<span style="background:#E3F7F3;color:#0B7F6F;font-size:12px;font-weight:600;padding:3px 9px;border-radius:999px">Sans dépôt</span>'
      : '<span style="background:#FFF3DA;color:#7A5300;font-size:12px;font-weight:600;padding:3px 9px;border-radius:999px">Dépôt requis</span>'
    return `<tr><td style="padding:12px 0;border-bottom:1px solid #eee">
      <table width="100%"><tr>
        <td><div style="font-weight:700;color:#142B4F;font-size:16px">${o.marque}</div>
            <div style="color:#5B6B84;font-size:13px">${o.categorie || ''}</div></td>
        <td align="right"><div style="font-weight:800;color:#142B4F;font-size:20px">${eur(o.montant)}</div>${badge}</td>
      </tr></table>
      <a href="${o.lien}" style="display:inline-block;margin-top:8px;background:#F9BD43;color:#082044;font-weight:700;font-size:13px;text-decoration:none;padding:9px 18px;border-radius:999px">Voir l'offre →</a>
    </td></tr>`
  }).join('')
}

function emailHtml(intro: string, offers: any[]) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#F4F7FB;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden">
  <div style="background:#142B4F;padding:22px 28px;color:#fff;font-size:18px;font-weight:700">Captain Parrainage</div>
  <div style="padding:24px 28px;color:#142B4F;font-size:15px;line-height:1.6">
    ${intro ? `<p>${intro}</p>` : ''}
    <table width="100%" cellpadding="0" cellspacing="0">${offersHtml(offers)}</table>
    <p style="margin-top:20px"><a href="${SITE}/membre/" style="color:#142B4F;font-weight:600">Voir toutes les offres →</a></p>
  </div>
  <div style="padding:16px 28px;border-top:1px solid #eee;color:#8a95a8;font-size:12px;line-height:1.5">
    Vous recevez cet email car vous êtes inscrit à Captain Parrainage.
    <a href="${SITE}/connexion/" style="color:#8a95a8">Gérer mon inscription</a>
  </div>
</div></body></html>`
}

export async function POST(req: NextRequest, { params }: { params: { siteId: string } }) {
  if (params.siteId !== CAPTAIN) return NextResponse.json({ error: 'Non applicable.' }, { status: 404 })
  if (!captainConfigured) return NextResponse.json({ error: 'Supabase captain non configuré.' }, { status: 500 })
  if (!RESEND_KEY) return NextResponse.json({ error: 'RESEND_API_KEY manquant.' }, { status: 500 })

  const body = await req.json().catch(() => ({})) as { subject?: string; intro?: string; offerIds?: string[] }
  const subject = (body.subject || 'Les nouvelles offres de parrainage').trim()

  // Offres à inclure : celles sélectionnées, sinon toutes les offres actives.
  let q = captain.from('parrainages').select('*').eq('actif', true).order('en_avant', { ascending: false }).order('montant', { ascending: false })
  const offersRes = await q
  if (offersRes.error) return NextResponse.json({ error: offersRes.error.message }, { status: 500 })
  let offers = offersRes.data || []
  if (body.offerIds && body.offerIds.length) offers = offers.filter(o => body.offerIds!.includes(o.id))
  if (!offers.length) return NextResponse.json({ error: 'Aucune offre à envoyer.' }, { status: 400 })

  // Destinataires : membres ayant opté pour la newsletter.
  const profRes = await captain.from('profiles').select('email').eq('newsletter_opt_in', true)
  if (profRes.error) return NextResponse.json({ error: profRes.error.message }, { status: 500 })
  const emails = (profRes.data || []).map((p: any) => p.email).filter(Boolean)
  if (!emails.length) return NextResponse.json({ error: 'Aucun membre inscrit à la newsletter.' }, { status: 400 })

  const html = emailHtml(body.intro || '', offers)
  let sent = 0, failed = 0
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100).map((to: string) => ({ from: FROM, to: [to], subject, html }))
    try {
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      })
      if (r.ok) sent += chunk.length; else failed += chunk.length
    } catch { failed += chunk.length }
  }

  await captain.from('newsletter_envois').insert({
    sujet: subject, contenu: html, nb_destinataires: sent,
    parrainage_ids: offers.map(o => o.id), envoye_par: 'dashboard',
  })

  return NextResponse.json({ ok: true, sent, failed, recipients: emails.length })
}
