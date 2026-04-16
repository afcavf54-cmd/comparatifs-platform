import { NextRequest, NextResponse } from 'next/server'
import { getFile } from '../../../../../lib/github'

type Params = { params: Promise<{ siteId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { siteId } = await params
  const body = await req.json()
  const { templateId, blockId, variables } = body

  if (!templateId || !blockId || !variables) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  }

  // Charger le schema
  const schemaFile = await getFile(`platform/schemas/${templateId}.json`)
  if (!schemaFile) return NextResponse.json({ error: 'Schema introuvable' }, { status: 404 })

  let schema: any
  try { schema = JSON.parse(schemaFile.content) }
  catch { return NextResponse.json({ error: 'Schema invalide' }, { status: 400 }) }

  const block = schema.blocks?.find((b: any) => b.id === blockId)
  if (!block) return NextResponse.json({ error: 'Bloc introuvable' }, { status: 404 })

  // Substituer les variables dans le prompt
  let prompt = block.prompt || ''
  for (const [key, val] of Object.entries(variables)) {
    prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val ?? ''))
  }

  // Appel API Anthropic
  const isListOrFaq = ['list', 'faq'].includes(block.type)
  const systemPrompt = isListOrFaq
    ? 'Tu es un expert rédacteur SEO. Réponds UNIQUEMENT en JSON valide, sans backticks, sans preamble.'
    : 'Tu es un expert rédacteur SEO. Réponds UNIQUEMENT avec le texte demandé, sans preamble ni commentaire.'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  const data = await res.json()
  let text = data.content?.[0]?.text?.trim() || ''

  // Parse JSON si list/faq
  if (isListOrFaq) {
    try {
      text = text.replace(/```json?/g, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(text)
      return NextResponse.json({ success: true, value: parsed, type: block.type })
    } catch {
      return NextResponse.json({ error: 'JSON invalide retourné par le modèle' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, value: text, type: block.type })
}
