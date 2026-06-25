import { NextRequest, NextResponse } from 'next/server'
import { CLAUDE_MODEL } from '../../../lib/ai-model'

export async function POST(req: NextRequest) {
  const { prompt, system, max_tokens = 300 } = await req.json()
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquante' }, { status: 500 })

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens,
      system: system || 'Tu es un expert SEO.',
      messages: [{ role: 'user', content: prompt }]
    })
  })

  const d = await r.json()
  if (!r.ok) return NextResponse.json({ error: d.error?.message || 'Erreur API' }, { status: 500 })
  return NextResponse.json({ text: d.content?.[0]?.text?.trim() || '' })
}
