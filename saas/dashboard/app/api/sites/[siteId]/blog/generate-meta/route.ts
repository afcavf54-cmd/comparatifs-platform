import { NextRequest, NextResponse } from 'next/server'
import { CLAUDE_MODEL } from '../../../../../../lib/ai-model'

/**
 * POST /api/sites/[siteId]/blog/generate-meta
 *
 * Génère une meta description SEO courte (~155 caractères) à partir du
 * titre + contenu d'un article. Appelée automatiquement par la page d'édition
 * lors de la sauvegarde si l'utilisateur n'a pas renseigné de meta description.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  await params  // siteId pas utilisé directement, juste pour conformité aux routes [siteId]
  const body = await req.json()
  const { title, content_html } = body
  if (!title) return NextResponse.json({ error: 'title requis' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquante' }, { status: 500 })

  // Strip HTML pour donner du texte propre à l'IA
  const plainText = String(content_html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000)  // suffisant pour résumer

  const systemPrompt = `Tu es un expert SEO. Tu rédiges des meta descriptions optimisées en français.

CONTRAINTES STRICTES :
- Réponds UNIQUEMENT avec le texte de la meta description, rien d'autre
- Pas de guillemets, pas de préambule, pas de balises
- Longueur : 140 à 160 caractères (idéal pour Google)
- Style accrocheur, informatif, donne envie de cliquer
- Inclure idéalement le mot-clé principal du titre
- Pas de tiret long — ni –
- Pas de point d'exclamation`

  const userPrompt = `Rédige une meta description SEO pour cet article :

Titre : ${title}

Contenu (extrait) : ${plainText.slice(0, 1500)}`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    return NextResponse.json({ error: 'Erreur Claude API', details: errText }, { status: 500 })
  }
  const data = await resp.json()
  let text = (data.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ')

  // Nettoyage : strip guillemets éventuels, tronque proprement
  text = text.trim().replace(/^["']|["']$/g, '')
  if (text.length > 165) {
    text = text.slice(0, 162).replace(/\s+\S*$/, '') + '…'
  }
  return NextResponse.json({ meta_description: text })
}
