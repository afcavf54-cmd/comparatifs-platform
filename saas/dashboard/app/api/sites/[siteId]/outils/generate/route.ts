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
//   mode?: 'content' | 'faq' | 'both',  // défaut 'content' (rétrocompat)
//   faq_count?: number,                  // nb de Q/R à générer (défaut 6)
// }
//
// Modes :
//   - 'content' (défaut) : génère uniquement le HTML rédactionnel (comportement historique)
//   - 'faq'             : génère uniquement une nouvelle FAQ
//   - 'both'            : génère HTML + FAQ en parallèle (Promise.all)
//
// Réponse :
//   { ok: true, html?, faq?, global_used, persona_used, template_id }

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
      mode = 'content',
      faq_count = 6,
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
        const tpl: string = (cfg?.template || cfg?.site?.template || '').trim()
        templateId = tpl.replace(/\.html\.j2$/, '').replace(/\.j2$/, '')
      }
    } catch {}

    // ── 2) Charger le prompt global du template ─────────────────
    let globalPrompt = ''
    if (templateId) {
      try {
        const schemaRes = await fetch(`${baseUrl}/api/schemas/${encodeURIComponent(templateId)}`)
        if (schemaRes.ok) {
          const schemaData = await schemaRes.json()
          globalPrompt = (schemaData?.global_prompt || '').trim()
        }
      } catch {}
    }

    // ── 3) Helpers pour empiler le system prompt ─────────────────
    function buildSystem(specificFormatRules: string): string {
      const layers: string[] = []
      if (globalPrompt)  layers.push(globalPrompt)
      if (personaPrompt) layers.push(personaPrompt)
      layers.push(specificFormatRules)
      return layers.join('\n\n---\n\n')
    }

    // ── 4) Appel API Anthropic générique ─────────────────────────
    async function callClaude(system: string, user: string): Promise<string> {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey!,
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
        throw new Error(`Anthropic API HTTP ${r.status}: ${errText.slice(0, 300)}`)
      }
      const data = await r.json()
      let txt = ''
      if (Array.isArray(data?.content)) {
        for (const block of data.content) {
          if (block.type === 'text' && block.text) txt += block.text
        }
      }
      return txt.trim()
    }

    // ── 5) Génération HTML (mode 'content' ou 'both') ────────────
    async function generateContent(): Promise<string> {
      const formatRules = `# RÈGLES TECHNIQUES DE FORMAT (à respecter strictement)
- Sortie : HTML uniquement, sans <html>, <head>, <body>, sans <h1> (le H1 est déjà géré par la page).
- Structure : <h2>/<h3> pour les sections, <p> pour les paragraphes, <ul>/<ol> pour les listes, <strong> pour les termes clés.
- Pas de markdown, pas de \`\`\` autour du code, juste le HTML pur.
- Paragraphes courts (3-5 phrases max).
- Ne PAS inclure de bloc FAQ dans le HTML (la FAQ est gérée séparément par le template).
- N'invente pas de chiffres ou de règlementations : reste général ou indique "selon votre situation".`

      const faqContext = faq.length > 0
        ? `\n\nContexte FAQ (à traiter dans les paragraphes si pertinent, mais NE PAS inclure de bloc FAQ dans le HTML — il est géré séparément) :\n${faq.map((f: any) => `Q: ${f.question}\nR: ${f.answer}`).join('\n\n')}`
        : ''

      const user = `Rédige le contenu rédactionnel pour la page de l'outil "${outil_name}".

Instruction de l'éditeur :
${prompt_redaction}
${faqContext}

Longueur cible : environ ${nb_mots} mots.

Réponds uniquement avec le HTML, sans introduction, sans balises de code, sans markdown.`

      let html = await callClaude(buildSystem(formatRules), user)
      html = html.replace(/^```(?:html)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
      return html
    }

    // ── 6) Génération FAQ (mode 'faq' ou 'both') ─────────────────
    async function generateFaq(): Promise<{ question: string; answer: string }[]> {
      const faqFormatRules = `# RÈGLES TECHNIQUES (à respecter strictement)
- Sortie : JSON pur, AUCUN texte avant ou après, AUCUN bloc \`\`\`json, juste l'objet JSON brut.
- Format exact : { "faq": [ { "question": "...", "answer": "..." }, ... ] }
- ${faq_count} entrées de FAQ minimum.
- Questions : tournures naturelles que se posent vraiment les utilisateurs (commencent par Comment, Pourquoi, Est-ce que, Quel(le)…), entre 5 et 12 mots.
- Réponses : 2 à 4 phrases, en français, ton clair et concret, AUCUNE balise HTML, AUCUN markdown. Une seule chaîne par réponse.
- N'invente pas de chiffres précis ou de règlementations : reste général ou indique "selon votre situation".
- Diversifie les angles : usage pratique, cas particuliers, limites, contexte légal/fiscal si pertinent, comparaison.
- Si une FAQ existante est fournie en contexte, traite des sujets DIFFÉRENTS (ne reformule pas).`

      const existingFaqContext = faq.length > 0
        ? `\n\nFAQ existante (à ne PAS dupliquer, génère des questions sur d'autres angles) :\n${faq.map((f: any) => `- ${f.question}`).join('\n')}`
        : ''

      const user = `Génère une FAQ structurée pour la page de l'outil "${outil_name}".

Contexte de la page :
${prompt_redaction}
${existingFaqContext}

Génère exactement ${faq_count} questions/réponses au format JSON demandé. Réponds UNIQUEMENT par le JSON, rien d'autre.`

      const raw = await callClaude(buildSystem(faqFormatRules), user)
      // Nettoyage défensif : si Claude a quand même mis des backticks
      const cleaned = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
      try {
        const parsed = JSON.parse(cleaned)
        const list = Array.isArray(parsed?.faq) ? parsed.faq : []
        // Filtre défensif : ne garde que les paires valides
        return list
          .filter((f: any) => f && typeof f.question === 'string' && typeof f.answer === 'string')
          .map((f: any) => ({ question: f.question.trim(), answer: f.answer.trim() }))
          .filter((f: any) => f.question.length > 0 && f.answer.length > 0)
      } catch (e) {
        // Si le parse plante, retourner une liste vide plutôt que de tout faire péter
        console.error('[generate-faq] JSON parse failed:', e, 'raw:', cleaned.slice(0, 200))
        return []
      }
    }

    // ── 7) Dispatch selon le mode ─────────────────────────────────
    const response: any = {
      ok: true,
      global_used: !!globalPrompt,
      persona_used: !!personaPrompt,
      template_id: templateId,
    }

    if (mode === 'content') {
      response.html = await generateContent()
    } else if (mode === 'faq') {
      response.faq = await generateFaq()
    } else if (mode === 'both') {
      // Appels parallèles pour gagner du temps
      const [html, generatedFaq] = await Promise.all([generateContent(), generateFaq()])
      response.html = html
      response.faq = generatedFaq
    } else {
      return NextResponse.json({ ok: false, error: `Mode inconnu : ${mode}` }, { status: 400 })
    }

    return NextResponse.json(response)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
