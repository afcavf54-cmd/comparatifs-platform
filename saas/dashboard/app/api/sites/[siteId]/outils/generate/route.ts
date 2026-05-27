import { NextRequest, NextResponse } from 'next/server'

// ── API : génération du contenu rédactionnel sous un outil ───────
//
// Empile dans cet ordre dans le system prompt envoyé à Claude :
//   1. Prompt global du TEMPLATE (platform/schemas/<templateId>.json)
//      → règles éditoriales partagées par tous les sites du template
//   2. Persona du SITE (config.yaml → persona_prompt)
//      → identité auteur spécifique à ce site
//   3. Règles de FORMAT (HTML, structure, etc.)
//      → contraintes techniques pour l'intégration dans le template outil
//   4. INSTRUCTION outil (prompt_redaction + FAQ + nb mots)
//      → ce que demande l'utilisateur dans la page Outils
//
// Body attendu :
// {
//   prompt_redaction: string,    // peut/doit contenir le plan Hn
//   faq: { question: string; answer: string }[],
//   nb_mots: number,
//   outil_name: string,
// }
//
// Réponse : { ok: true, html, global_used, persona_used }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params
    const body = await req.json()
    const {
      prompt_redaction = '',
      faq = [],
      nb_mots = 1000,
      outil_name = 'outil',
    } = body || {}

    if (!prompt_redaction.trim()) {
      return NextResponse.json({ ok: false, error: 'Le prompt IA est vide' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY n'est pas configuré sur Vercel" }, { status: 500 })
    }

    const baseUrl = req.nextUrl.origin

    // ── 1) Charger config.yaml du site ──────────────────────────
    let personaPrompt = ''
    let templateId = ''
    try {
      const cfgRes = await fetch(`${baseUrl}/api/sites/${siteId}/config`)
      if (cfgRes.ok) {
        const cfg = await cfgRes.json()
        personaPrompt = (cfg?.persona_prompt || cfg?.site?.persona_prompt || '').trim()
        // Le template est sous `site.template` dans le YAML, mais l'API
        // peut renvoyer en racine selon comment elle parse.
        const tpl: string = (cfg?.template || cfg?.site?.template || '').trim()
        // Ex: "classement-saas.html.j2" → "classement-saas"
        templateId = tpl.replace(/\.html\.j2$/, '').replace(/\.j2$/, '')
      }
    } catch {
      // pas grave, on continue sans persona/template
    }

    // ── 2) Charger le prompt global du template ─────────────────
    let globalPrompt = ''
    if (templateId) {
      try {
        const schemaRes = await fetch(`${baseUrl}/api/schemas/${encodeURIComponent(templateId)}`)
        if (schemaRes.ok) {
          const schemaData = await schemaRes.json()
          globalPrompt = (schemaData?.global_prompt || '').trim()
        }
      } catch {
        // pas grave
      }
    }

    // ── 3) System prompt : empile global → persona → format ─────
    const formatRules = `# RÈGLES TECHNIQUES DE FORMAT (à respecter strictement)
- Sortie : HTML uniquement, sans <html>, <head>, <body>, sans <h1> (le H1 est déjà géré par la page).
- Structure : <h2>/<h3> pour les sections, <p> pour les paragraphes, <ul>/<ol> pour les listes, <strong> pour les termes clés.
- Pas de markdown, pas de \`\`\` autour du code, juste le HTML pur.
- Paragraphes courts (3-5 phrases max).
- Ne PAS inclure de bloc FAQ dans le HTML (la FAQ est gérée séparément par le template).
- N'invente pas de chiffres ou de règlementations : reste général ou indique "selon votre situation".`

    const layers: string[] = []
    if (globalPrompt)  layers.push(globalPrompt)
    if (personaPrompt) layers.push(personaPrompt)
    layers.push(formatRules)
    const system = layers.join('\n\n---\n\n')

    // ── 4) User prompt : instruction + FAQ contextuelle ─────────
    const faqContext = faq.length > 0
      ? `\n\nContexte FAQ (à traiter dans les paragraphes si pertinent, mais NE PAS inclure de bloc FAQ dans le HTML — il est géré séparément) :\n${faq.map((f: any) => `Q: ${f.question}\nR: ${f.answer}`).join('\n\n')}`
      : ''

    const user = `Rédige le contenu rédactionnel pour la page de l'outil "${outil_name}".

Instruction de l'éditeur :
${prompt_redaction}
${faqContext}

Longueur cible : environ ${nb_mots} mots.

Réponds uniquement avec le HTML, sans introduction, sans balises de code, sans markdown.`

    // ── 5) Appel Anthropic ──────────────────────────────────────
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
    html = html.replace(/^```(?:html)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()

    return NextResponse.json({
      ok: true,
      html,
      global_used: !!globalPrompt,
      persona_used: !!personaPrompt,
      template_id: templateId,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
