// ────────────────────────────────────────────────────────────────────────
// Helpers d'envoi newsletter (Resend) — SERVEUR UNIQUEMENT.
// Partagés entre l'API d'envoi et le cron d'envoi échelonné.
// ────────────────────────────────────────────────────────────────────────
export const NL_FROM = 'Monelor <info@monelor.com>'
const RESEND_KEY = process.env.RESEND_API_KEY

// Enrobe le contenu dans un template email + lien de désinscription personnalisé.
export function wrapEmail(html: string, unsubUrl: string) {
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

// Envoi par lots de 100 via l'API batch Resend. items = [{to, subject, html}].
export async function resendBatch(items: { to: string; subject: string; html: string }[]) {
  let sent = 0, failed = 0
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100).map(e => ({ from: NL_FROM, to: [e.to], subject: e.subject, html: e.html }))
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
