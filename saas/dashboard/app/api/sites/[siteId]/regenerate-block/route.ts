import { NextRequest, NextResponse } from 'next/server'
import { CLAUDE_MODEL } from '../../../../../lib/ai-model'
import { getFile } from '../../../../../lib/github'

type Params = { params: Promise<{ siteId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { siteId } = await params
  const body = await req.json()
  const { pageType, blockId, variables } = body
  // pageType = 'avis' ou 'vs'

  // Lire page_types depuis config.yaml
  const configFile = await getFile(`platform/sites/${siteId}/config.yaml`)
  if (!configFile) return NextResponse.json({ error: 'Config introuvable' }, { status: 404 })

  const pageTypesMatch = configFile.content.match(/page_types:\s*\n((?:[ ]+\w+:[ ]+\S+\n?)+)/)
  const pageTypes: Record<string, string> = {}
  if (pageTypesMatch) {
    pageTypesMatch[1].split('\n').forEach(line => {
      const m = line.match(/\s+(\w+):\s+(\S+)/)
      if (m) pageTypes[m[1]] = m[2]
    })
  }

  const templateId = pageTypes[pageType]
  if (!templateId) return NextResponse.json({ error: `page_types.${pageType} non défini dans config.yaml` }, { status: 400 })

  // Charger le schema
  const schemaFile = await getFile(`platform/schemas/${templateId}.json`)
  if (!schemaFile) return NextResponse.json({ error: `Schema ${templateId}.json introuvable` }, { status: 404 })

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

  const isListOrFaq = ['list', 'faq'].includes(block.type)
  const systemPrompt = isListOrFaq
    ? 'Tu es un expert rédacteur SEO. Réponds UNIQUEMENT en JSON valide, sans backticks, sans preamble.'
    : 'Tu es un expert rédacteur SEO. Réponds UNIQUEMENT avec le texte demandé, sans preamble ni commentaire.'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  const data = await res.json()
  let text = data.content?.[0]?.text?.trim() || ''

  if (isListOrFaq) {
    try {
      text = text.replace(/```json?/g, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(text)
      return NextResponse.json({ success: true, value: parsed, type: block.type, field: block.field })
    } catch {
      return NextResponse.json({ error: 'JSON invalide retourné par le modèle' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, value: text, type: block.type, field: block.field })
}
