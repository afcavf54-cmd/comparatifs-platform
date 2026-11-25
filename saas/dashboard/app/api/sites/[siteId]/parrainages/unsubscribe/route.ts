import { NextRequest, NextResponse } from 'next/server'
import { captain, captainConfigured } from '../../../../../../lib/captain'

// Lien « Se désabonner » des newsletters captain-parrainage.
// id = identifiant (uuid) du membre dans profiles → newsletter_opt_in = false.
const CAPTAIN = 'captain-parrainage'
const SITE = 'https://www.captain-parrainage.com'

function page(title: string, text: string) {
  return new NextResponse(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;background:#f4f5f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#000921">
<div style="max-width:480px;margin:80px auto;background:#fff;border-radius:14px;padding:32px;text-align:center">
<h1 style="font-size:20px;margin:0 0 10px">${title}</h1><p style="color:#5B6B84;font-size:15px;line-height:1.6;margin:0 0 20px">${text}</p>
<a href="${SITE}/" style="color:#000921;font-weight:600">Retour à Captain Parrainage</a></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function GET(req: NextRequest, { params }: { params: { siteId: string } }) {
  if (params.siteId !== CAPTAIN || !captainConfigured) return page('Lien invalide', "Ce lien de désinscription n'est pas valide.")
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return page('Lien invalide', "Ce lien de désinscription n'est pas valide.")
  const { error } = await captain.from('profiles').update({ newsletter_opt_in: false }).eq('id', id)
  if (error) return page('Oups', 'La désinscription a échoué, réessaie un peu plus tard.')
  return page('Vous êtes désinscrit', 'Vous ne recevrez plus la newsletter Captain Parrainage. Vous pouvez la réactiver à tout moment depuis votre espace membre.')
}
