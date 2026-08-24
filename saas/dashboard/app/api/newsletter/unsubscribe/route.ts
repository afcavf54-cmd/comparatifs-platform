import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'

// GET public : désinscription en un clic depuis l'email (?id=<subscriber_id>)
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const page = (msg: string) => new NextResponse(
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Désinscription</title></head>
     <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f8;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center">
     <div style="background:#fff;padding:40px 32px;border-radius:14px;max-width:460px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.08)">
     <div style="font-size:40px;margin-bottom:12px">✅</div>${msg}</div></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } })

  if (!id || id === 'test') return page('<h2 style="color:#000921;margin:0 0 8px">C\'est noté</h2><p style="color:#5b6478">Vous ne recevrez plus la newsletter.</p>')
  const { error } = await supabase.from('subscribers').update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() }).eq('id', id)
  if (error) return page('<h2 style="color:#000921">Une erreur est survenue</h2><p style="color:#5b6478">Réessayez plus tard.</p>')
  return page('<h2 style="color:#000921;margin:0 0 8px">Vous êtes désinscrit</h2><p style="color:#5b6478">Vous ne recevrez plus la newsletter Monelor. À bientôt !</p>')
}
