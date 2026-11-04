import { NextRequest, NextResponse } from 'next/server'
import { mcf, mcfConfigured, Offre } from '../../../../../lib/mcf'

// ────────────────────────────────────────────────────────────────────────
// Email récapitulatif du simulateur mon-credit-facile (transactionnel, Resend).
// Appelé par le site statique /simulation-credit.html après la saisie email.
// Envoie À L'ADRESSE SAISIE la même sélection que celle affichée à l'écran,
// reconstruite côté serveur depuis la table "offres" (même source de données).
//
// Env (Vercel) : RESEND_API_KEY + MCF_RECAP_FROM (optionnel) + MCF_SUPABASE_*.
// ────────────────────────────────────────────────────────────────────────
const MCF = 'mon-credit-facile-fr'
const RESEND_KEY = process.env.RESEND_API_KEY
const FROM = process.env.MCF_RECAP_FROM || 'Mon Crédit Facile <no-reply@mon-credit-facile.fr>'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }) }

const PROJECT_LABEL: Record<string, string> = {
  'sans-justificatif': 'Crédit sans justificatif', personnel: 'Prêt personnel', etudiant: 'Prêt étudiant', auto: 'Crédit auto',
  moto: 'Crédit moto', travaux: 'Crédit travaux', autre: 'Autre projet', regroupement: 'Regroupement de crédits',
}
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')

function offerRow(o: Offre, parrain: boolean) {
  const title = parrain ? (o.prime || '') : (o.categorie || '')
  const sub = parrain ? (o.conditions || '') : (o.description || '')
  const cond = parrain ? (o.depot || '') : (o.taeg ? `TAEG ${o.taeg}` : (o.conditions || 'Conditions à consulter chez le partenaire'))
  const btn = parrain ? 'En profiter' : 'Simuler'
  return `<tr><td style="padding:14px 16px;border:1px solid #E4EADF;border-radius:12px;background:${parrain ? '#FFFDF8' : '#fff'}">
    <div style="font-weight:700;color:#1F2A26;font-size:16px">${esc(o.organisme)}${o.demo ? ' <span style="font-size:11px;color:#8A6A3D">(démo)</span>' : ''}</div>
    <div style="color:#53625B;font-size:13px;margin:2px 0 6px">${esc(title)}</div>
    ${sub ? `<div style="color:#53625B;font-size:13px">${esc(sub)}</div>` : ''}
    <div style="color:#234B3C;font-size:12px;font-weight:700;margin-top:4px">${esc(cond)}</div>
    <a href="${esc(o.url || '#')}" style="display:inline-block;margin-top:10px;background:#FF8A3D;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:9px 18px;border-radius:10px">${btn} →</a>
    <div style="color:#8A95A8;font-size:11px;margin-top:4px">Lien affilié</div>
  </td></tr><tr><td style="height:10px"></td></tr>`
}

function buildEmail(amount: number, project: string, credit: Offre[], parrain: Offre[]) {
  const section = (label: string, rows: string) => `
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#2E6350;margin:22px 0 10px">${label}</div>
    <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`
  const note = (txt: string) => `<p style="color:#53625B;font-size:12px;margin:6px 0 0">${txt}</p>`

  // Seuil 500 € : en dessous, les primes de bienvenue passent en premier.
  const smallAmount = amount < 500

  const creditRows = credit.length ? credit.map(o => offerRow(o, false)).join('') : `<tr><td style="color:#53625B;font-size:13px">Aucune offre de crédit ne correspond à ce montant${smallAmount ? ' : pour un montant aussi faible, un crédit est rarement avantageux.' : ' pour le moment.'}</td></tr>`
  const creditBlock = section('Offres de crédit', creditRows) +
    note("Les offres proviennent de nos partenaires. L'acceptation dépend de l'étude de votre dossier par l'organisme. Ce classement n'est pas un classement des meilleurs taux du marché.")

  let parrainBlock = ''
  if (parrain.length) {
    const label = smallAmount ? 'Recommandé pour vous : offres de bienvenue' : 'À découvrir aussi : offres de bienvenue'
    const intro = smallAmount
      ? "Pour un montant inférieur à 500 €, les primes de bienvenue sont souvent plus avantageuses qu'un crédit : vous récupérez de l'argent sans frais et sans remboursement. Ce ne sont pas des crédits."
      : "En complément de votre crédit, ces primes de bienvenue sont une bonne alternative : carte bancaire souvent gratuite, sans frais, et de l'argent récupérable sans remboursement. Ce ne sont pas des crédits."
    parrainBlock = section(label, parrain.map(o => offerRow(o, true)).join('')) + note(intro)
  }

  const blocks = smallAmount ? (parrainBlock + creditBlock) : (creditBlock + parrainBlock)

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#FAFBF5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#fff">
  <div style="background:#234B3C;padding:20px 28px;color:#fff;font-size:18px;font-weight:800">Mon Crédit<span style="color:#FF8A3D"> Facile</span></div>
  <div style="padding:26px 28px;color:#1F2A26">
    <h1 style="font-size:20px;margin:0 0 6px;color:#234B3C">Votre sélection pour un projet de ${fmt(amount)} €</h1>
    <p style="color:#53625B;font-size:14px;margin:0 0 4px">Projet : ${esc(PROJECT_LABEL[project] || project)}.</p>
    ${blocks}
    <div style="margin-top:22px;padding:14px 16px;background:#FAFBF5;border-radius:10px;color:#53625B;font-size:12px;line-height:1.6">
      Un crédit vous engage et doit être remboursé. Vérifiez vos capacités de remboursement avant de vous engager.
      « Sans justificatif d'utilisation » ne signifie pas sans justificatifs d'identité ou de revenus.
      Les informations sont indicatives et ne constituent pas une offre de crédit.
    </div>
  </div>
  <div style="padding:16px 28px;border-top:1px solid #eee;color:#8A95A8;font-size:12px">
    Vous recevez cet email car vous avez demandé votre sélection sur mon-credit-facile.fr. Éditeur : VISEOWEB.
  </div>
</div></body></html>`
}

export async function POST(req: NextRequest, { params }: { params: { siteId: string } }) {
  if (params.siteId !== MCF) return NextResponse.json({ error: 'Non applicable.' }, { status: 404, headers: CORS })
  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const project = String(body.project || '').trim()
  const amount = Math.round(Number(body.amount) || 0)
  const situation = String(body.situation || '').trim().slice(0, 40) || null
  const duration = String(body.duration || '').trim().slice(0, 40) || null
  const optin = body.optin === true || body.optin === 'true'
  if (!email || email.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400, headers: CORS })
  }
  if (!amount || amount < 1) return NextResponse.json({ error: 'Montant invalide' }, { status: 400, headers: CORS })
  if (!mcfConfigured) return NextResponse.json({ error: 'Supabase non configuré' }, { status: 503, headers: CORS })
  if (!RESEND_KEY) return NextResponse.json({ error: 'Envoi email indisponible' }, { status: 503, headers: CORS })

  // Enregistre / met à jour le lead (type de crédit, montant, situation pro) dans
  // la Supabase dédiée. Best-effort : un échec ici ne doit pas bloquer le récap.
  try {
    await mcf.rpc('upsert_lead', {
      p_email: email, p_project: project || null, p_amount: amount,
      p_situation: situation, p_duration: duration, p_optin: optin,
    })
  } catch { /* non bloquant */ }

  // Reconstruit la sélection côté serveur (même source que la page).
  const { data: offres } = await mcf.from('offres').select('*')
    .eq('actif', true)
    .order('mise_en_avant', { ascending: false }).order('ordre', { ascending: true })
  const all = (offres || []) as Offre[]
  const credit = all.filter(o => o.type === 'credit' && (o.montant_min == null || amount >= o.montant_min) && (o.montant_max == null || amount <= o.montant_max))
  const parrain = all.filter(o => o.type === 'parrainage')

  const html = buildEmail(amount, project, credit, parrain)
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [email], subject: `Votre sélection pour votre projet de ${fmt(amount)} €`, html }),
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      return NextResponse.json({ error: 'Envoi refusé par Resend', detail: t.slice(0, 200) }, { status: 502, headers: CORS })
    }
  } catch {
    return NextResponse.json({ error: 'Envoi email échoué' }, { status: 502, headers: CORS })
  }
  return NextResponse.json({ ok: true }, { headers: CORS })
}
