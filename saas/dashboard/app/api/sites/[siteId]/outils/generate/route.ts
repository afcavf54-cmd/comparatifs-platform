import { NextRequest, NextResponse } from 'next/server'

// ── API : génération du contenu rédactionnel sous un outil ───────
//
// Appelle l'API Anthropic avec le prompt utilisateur enrichi du plan H2,
// de la FAQ, et du nombre de mots cible. Retourne du HTML prêt à coller
// dans `outil.contenu_genere`.
//
// Body attendu :
// {
//   prompt_redaction: string,
//   plan_h2: string[],
//   faq: { question: string; answer: string }[],
//   nb_mots: number,
//   outil_name: string  (ex: "Convertisseur HT / TTC", pour contextualiser)
// }
//
// Réponse : { ok: true, html: "<p>...</p>" } | { ok: false, error: "..." }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      prompt_redaction = '',
      plan_h2 = [],
      faq = [],
      nb_mots = 1000,
      outil_name = 'outil',
    } = body || {}

    if (!prompt_redaction.trim()) {
      return NextResponse.json({ ok: false, error: 'prompt_redaction est vide' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY n'est pas configuré sur Vercel" }, { status: 500 })
    }

    // Construire le system + user prompts
    const system = `Tu es un rédacteur web expert en SEO et en pédagogie. Tu rédiges du contenu HTML pour un site comparatif/utilitaire. Tes textes sont clairs, factuels, structurés, sans jargon inutile.

Règles strictes de rédaction :
- Sortie : HTML uniquement, sans <html>, <head>, <body>, sans <h1> (le H1 est déjà géré par la page).
- Structure : utilise <h2> pour les sections principales, <h3> pour les sous-sections, <p> pour les paragraphes, <ul>/<ol> pour les listes, <strong> pour les termes clés.
- N'utilise PAS <h1>, ne mets PAS de bloc FAQ (la FAQ est gérée séparément par le template).
- Pas de markdown, pas de \`\`\` autour du code, juste le HTML pur.
- Paragraphes courts (3-5 phrases max).
- Ton vouvoiement, accessible à un dirigeant TPE/PME.
- N'invente pas de chiffres ou règlementations : reste général ou indique "selon votre situation".`

    const planSection = plan_h2.length > 0
      ? `\n\nPlan obligatoire à suivre (un <h2> par item, dans cet ordre) :\n${plan_h2.map((h: string, i: number) => `${i + 1}. ${h}`).join('\n')}`
      : ''

    const faqContext = faq.length > 0
      ? `\n\nContexte FAQ (informatif, ne pas inclure dans le HTML, mais traiter les sujets dans les paragraphes si pertinent) :\n${faq.map((f: any) => `Q: ${f.question}\nR: ${f.answer}`).join('\n\n')}`
      : ''

    const user = `Rédige le contenu rédactionnel pour la page de l'outil "${outil_name}".

Instruction de l'éditeur :
${prompt_redaction}
${planSection}
${faqContext}

Longueur cible : environ ${nb_mots} mots.

Réponds uniquement avec le HTML, sans introduction, sans balises de code, sans markdown.`

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })

    if (!r.ok) {
      const errText = await r.text()
      return NextResponse.json({ ok: false, error: `Anthropic API HTTP ${r.status}: ${errText.slice(0, 300)}` }, { status: 500 })
    }

    const data = await r.json()
    let html = ''
    if (Array.isArray(data?.content)) {
      for (const block of data.content) {
        if (block.type === 'text' && block.text) html += block.text
      }
    }
    html = html.trim()

    // Nettoyage : retirer un éventuel ```html ... ``` que Claude ajouterait
    html = html.replace(/^```(?:html)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()

    return NextResponse.json({ ok: true, html })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
