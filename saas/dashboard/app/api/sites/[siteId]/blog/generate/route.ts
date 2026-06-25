import { NextRequest, NextResponse } from 'next/server'
import { CLAUDE_MODEL } from '../../../../../../lib/ai-model'

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
  const { title, categorie, prompt_custom, min_words } = body
  if (!title) return NextResponse.json({ error: 'title requis' }, { status: 400 })
  const minW = Math.max(300, Math.min(3000, parseInt(min_words, 10) || 750))
  const maxW = Math.round(minW * 1.5)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquante' }, { status: 500 })

  const { globalPrompt, personaPrompt } = await loadPrompts(siteId)

  // System prompt en couches : persona + global + base blog
  const baseSys = `Tu es un rédacteur SEO expérimenté. Tu écris des articles de blog en français.

CONTRAINTES DE FORMAT (impératif) :
- Réponds UNIQUEMENT avec le contenu HTML de l'article, sans préambule, sans backticks de code fence
- Format HTML simple : <h2>, <h3>, <p>, <strong>, <em>, <ul>/<li>, <ol>/<li>, <blockquote>, <a href="...">
- Pas de titre <h1> (le titre est déjà géré ailleurs)
- Structure : 2-4 sous-titres <h2>, parfois <h3>, paragraphes 3-5 lignes dans des <p>
- Utilise les listes <ul>/<li> quand pertinent
- Pas de tirets longs — ni –, utilise des virgules ou points
- Pas de bullets unicode • ou ·
- Pas de markdown ** _ ## etc. : uniquement du HTML
- Pas de <div>, pas de <span>, pas de classes CSS — du HTML sémantique simple uniquement

CONTRAINTES DE PONCTUATION (impératif) :
- Tout titre sous forme de question DOIT se terminer par un point d'interrogation '?'
  (titres commençant par : Comment, Pourquoi, Que, Quel, Quelle, Quels, Quelles, Qui, Où,
  Quand, Combien, Est-ce que, Faut-il, Doit-on, Peut-on, etc.)
- En français : espace insécable avant '?' '!' ':' ';' — utilise ' ?' avec un espace simple`

  const layers = [personaPrompt, globalPrompt, baseSys].filter(Boolean)
  const systemPrompt = layers.join('\n\n')

  // User prompt
  const catLine = categorie ? `\nCatégorie : ${categorie}` : ''
  const customLine = prompt_custom ? `\n\nConsignes spécifiques :\n${prompt_custom}` : ''
  const userPrompt = `Rédige un article de blog complet sur le sujet suivant :

Titre : ${title}${catLine}${customLine}

Longueur cible : ${minW} à ${maxW} mots (minimum ${minW} mots impératif). L'article doit être informatif, structuré, et utile au lecteur cible défini dans ton persona.`

  // Appel Claude
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: Math.min(8000, Math.max(2000, maxW * 4)),  // ~1.3 tokens/word + marge HTML
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
