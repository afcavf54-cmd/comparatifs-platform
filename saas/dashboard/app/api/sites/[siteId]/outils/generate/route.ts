import { NextRequest, NextResponse } from 'next/server'
import { CLAUDE_MODEL } from '../../../../../../lib/ai-model'

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
// }
//
// Modes :
//   - 'content' (défaut) : génère uniquement le HTML rédactionnel
//   - 'faq'             : génère les RÉPONSES aux questions fournies
//                         (les questions saisies par l'utilisateur sont
//                         préservées strictement à l'identique)
//   - 'both'            : génère HTML + réponses FAQ en parallèle
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

    // ── 3) Helpers ───────────────────────────────────────────────
    function buildSystem(specificFormatRules: string): string {
      const layers: string[] = []
      if (globalPrompt)  layers.push(globalPrompt)
      if (personaPrompt) layers.push(personaPrompt)
      layers.push(specificFormatRules)
      return layers.join('\n\n---\n\n')
    }

    async function callClaude(system: string, user: string): Promise<string> {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
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

    // ── 4) Génération HTML (mode 'content' ou 'both') ────────────
    async function generateContent(): Promise<string> {
      const formatRules = `# RÈGLES TECHNIQUES DE FORMAT (à respecter strictement)
- Sortie : HTML uniquement, sans <html>, <head>, <body>, sans <h1> (le H1 est déjà géré par la page).
- Structure : <h2>/<h3> pour les sections, <p> pour les paragraphes, <ul>/<ol> pour les listes, <strong> pour les termes clés.
- Pas de markdown, pas de \`\`\` autour du code, juste le HTML pur.
- Paragraphes courts (3-5 phrases max).
- Ne PAS inclure de bloc FAQ dans le HTML (la FAQ est gérée séparément par le template).
- N'invente pas de chiffres ou de règlementations : reste général ou indique "selon votre situation".

# TABLEAUX (IMPORTANT)
Si tu présentes des données chiffrées comparatives, des correspondances valeur→valeur (ex : salaire brut → net), des listes structurées multi-colonnes, des barèmes, etc. :
- Utilise OBLIGATOIREMENT une vraie balise <table> HTML structurée.
- TOUJOURS encadrer le tableau dans <div class="table-wrap">…</div> (pour le scroll horizontal sur mobile).
- Structure minimale :
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>En-tête colonne 1</th><th>En-tête colonne 2</th></tr>
      </thead>
      <tbody>
        <tr><td>Valeur 1A</td><td>Valeur 1B</td></tr>
        <tr><td>Valeur 2A</td><td>Valeur 2B</td></tr>
      </tbody>
    </table>
  </div>
- Les en-têtes de colonne DOIVENT être dans <thead><tr><th>…</th></tr></thead>, jamais dans <tbody>.
- Les <th> doivent décrire clairement la colonne (ex : "Salaire brut mensuel", "Salaire net estimé"), pas être implicites.
- N'utilise JAMAIS de pseudo-tableau aligné avec des espaces, des <p> en colonnes, ou des <div> flex/grid. C'est <table> ou rien.
- Si le tableau a plus de 8 lignes, ajoute un <caption> en haut décrivant le contenu.`

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

    // ── 5) Génération des RÉPONSES aux questions fournies ────────
    //    Les questions sont saisies par l'utilisateur dans le dashboard
    //    et doivent être préservées strictement à l'identique. Claude ne
    //    génère QUE les réponses, pas les questions.
    async function regenerateAnswers(): Promise<{ question: string; answer: string }[]> {
      // Filtrer : on ne traite que les questions non-vides
      const questions = (faq as any[])
        .filter(f => f && typeof f.question === 'string' && f.question.trim().length > 0)
        .map(f => f.question.trim())

      if (questions.length === 0) {
        return []
      }

      const faqFormatRules = `# RÈGLES TECHNIQUES (à respecter strictement)
- Sortie : JSON pur, AUCUN texte avant ou après, AUCUN bloc \`\`\`json, juste l'objet JSON brut.
- Format exact : { "answers": [ "réponse 1", "réponse 2", ... ] }
- Le tableau "answers" doit contenir EXACTEMENT ${questions.length} éléments, dans le MÊME ORDRE que les questions fournies.
- Chaque réponse : 2 à 4 phrases, en français, ton clair et concret.
- AUCUNE balise HTML, AUCUN markdown, AUCUN guillemet de citation. Texte brut uniquement.
- Réponds à la question telle qu'elle est posée, ne reformule pas la question dans la réponse.
- N'invente pas de chiffres précis ou de règlementations : reste général ou indique "selon votre situation".
- Si une question est ambiguë, donne la réponse la plus utile pour un lecteur qui découvre le sujet.`

      const questionsList = questions
        .map((q, i) => `${i + 1}. ${q}`)
        .join('\n')

      const user = `Tu dois répondre à ${questions.length} questions d'une FAQ pour la page de l'outil "${outil_name}".

Contexte de la page :
${prompt_redaction}

Questions auxquelles tu dois répondre (dans cet ordre exact) :
${questionsList}

Réponds UNIQUEMENT par le JSON au format demandé, avec exactement ${questions.length} réponses dans le même ordre que les questions. Rien d'autre.`

      const raw = await callClaude(buildSystem(faqFormatRules), user)
      const cleaned = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()

      let answers: string[] = []
      try {
        const parsed = JSON.parse(cleaned)
        answers = Array.isArray(parsed?.answers) ? parsed.answers : []
      } catch (e) {
        console.error('[regenerate-answers] JSON parse failed:', e, 'raw:', cleaned.slice(0, 200))
        return []
      }

      // Recombiner questions + réponses dans l'ordre exact, en préservant
      // l'ordre original de `faq` (y compris les questions vides qu'on a
      // sautées plus haut — celles-ci restent telles quelles).
      const result: { question: string; answer: string }[] = []
      let aiIdx = 0
      for (const original of (faq as any[])) {
        const q = (original?.question || '').trim()
        if (q.length === 0) {
          // Question vide : on garde l'item tel quel (au cas où l'utilisateur
          // l'avait laissé vide volontairement, on ne le supprime pas).
          result.push({
            question: original?.question || '',
            answer: original?.answer || '',
          })
        } else {
          // Question non-vide : on réutilise la réponse générée par l'IA
          const generatedAnswer = answers[aiIdx] || original?.answer || ''
          result.push({
            question: q,
            answer: typeof generatedAnswer === 'string' ? generatedAnswer.trim() : String(generatedAnswer || ''),
          })
          aiIdx++
        }
      }

      return result.filter(item => item.question.length > 0 || item.answer.length > 0)
    }

    // ── 6) Dispatch selon le mode ─────────────────────────────────
    const response: any = {
      ok: true,
      global_used: !!globalPrompt,
      persona_used: !!personaPrompt,
      template_id: templateId,
    }

    if (mode === 'content') {
      response.html = await generateContent()
    } else if (mode === 'faq') {
      response.faq = await regenerateAnswers()
    } else if (mode === 'both') {
      // Appels parallèles pour gagner du temps
      const [html, generatedFaq] = await Promise.all([generateContent(), regenerateAnswers()])
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
