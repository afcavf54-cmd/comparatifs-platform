import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://api.github.com'
const headers = {
  'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}
const repoPath = () => `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`

async function ghGet(path: string): Promise<string | null> {
  const res = await fetch(`${BASE}/repos/${repoPath()}/contents/${path}`, { headers, cache: 'no-store' })
  if (!res.ok) return null
  const data = await res.json()
  if (Array.isArray(data)) return null
  return Buffer.from(data.content, 'base64').toString('utf-8')
}

// Récupère le global_prompt + persona_prompt pour construire le system prompt
async function loadPrompts(siteId: string): Promise<{ globalPrompt: string; personaPrompt: string; templateName: string }> {
  let globalPrompt = ''
  let personaPrompt = ''
  let templateName = ''

  // Config du site → persona_prompt + page_types pour identifier le schema
  const configRaw = await ghGet(`platform/sites/${siteId}/config.yaml`)
  if (configRaw) {
    const personaMatch = configRaw.match(/^persona_prompt:\s*\|\s*\n((?:  .*\n?)+)/m)
    if (personaMatch) {
      personaPrompt = personaMatch[1].split('\n').map(l => l.replace(/^  /, '')).join('\n').trim()
    } else {
      const flatMatch = configRaw.match(/^persona_prompt:\s*["']([^"']+)["']/m)
      if (flatMatch) personaPrompt = flatMatch[1]
    }
    const tplMatch = configRaw.match(/classement:\s*(\S+)/)
    if (tplMatch) templateName = tplMatch[1]
  }

  // Schema → global_prompt
  if (templateName) {
    const schemaRaw = await ghGet(`platform/schemas/${templateName}.json`)
    if (schemaRaw) {
      try {
        const schema = JSON.parse(schemaRaw)
        globalPrompt = schema.global_prompt || ''
      } catch { /* ignore */ }
    }
  }
  return { globalPrompt, personaPrompt, templateName }
}

// ─── POST : génère le contenu d'un article via Claude ─────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const body = await req.json()
  const { title, categorie, prompt_custom } = body
  if (!title) return NextResponse.json({ error: 'title requis' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquante' }, { status: 500 })

  const { globalPrompt, personaPrompt } = await loadPrompts(siteId)

  // System prompt en couches : persona + global + base blog
  const baseSys = `Tu es un rédacteur SEO expérimenté. Tu écris des articles de blog en français, en markdown propre.

CONTRAINTES DE FORMAT (impératif) :
- Réponds UNIQUEMENT avec le contenu markdown de l'article, sans préambule, sans backticks de code fence
- Pas de titre H1 # en début (le titre est déjà géré ailleurs)
- Structure : 2-4 sous-titres ## H2, parfois ### H3, paragraphes 3-5 lignes
- Utilise les listes - quand pertinent
- Pas de tirets longs — ni –, utilise des virgules ou points
- Pas de bullets unicode • ou ·
- Aucun markdown imbriqué bizarre, juste du basique : **bold**, *italique*, [liens](url), listes, citations >`

  const layers = [personaPrompt, globalPrompt, baseSys].filter(Boolean)
  const systemPrompt = layers.join('\n\n')

  // User prompt
  const catLine = categorie ? `\nCatégorie : ${categorie}` : ''
  const customLine = prompt_custom ? `\n\nConsignes spécifiques :\n${prompt_custom}` : ''
  const userPrompt = `Rédige un article de blog complet sur le sujet suivant :

Titre : ${title}${catLine}${customLine}

Longueur cible : 800 à 1200 mots. L'article doit être informatif, structuré, et utile au lecteur cible défini dans ton persona.`

  // Appel Claude
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    return NextResponse.json({ error: 'Erreur Claude API', details: errText }, { status: 500 })
  }
  const data = await resp.json()
  const text = (data.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')

  // Strip code fences éventuels (par sécurité)
  let cleaned = (text || '').trim()
  cleaned = cleaned.replace(/^```(?:markdown|md|html)?\s*\n?/i, '')
  cleaned = cleaned.replace(/\n?\s*```\s*$/i, '')
  cleaned = cleaned.trim()

  return NextResponse.json({ content_md: cleaned })
}
