import { NextRequest, NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────
// generate route — génère les 3 contenus textuels d'une marque codes promo
// en un seul appel Claude (économique, parsing JSON robuste) :
//   1. content_md         : "Comment utiliser un code promo <MARQUE>"
//                           4 étapes (## Étape 1, ## Étape 2, ## Étape 3, ## Étape 4)
//                           ~150-250 mots, persona Sophie
//   2. avis_sophie        : 3-4 phrases, premier degré, mentionne le test à la main
//   3. conseil_sophie     : 1-2 phrases, une astuce pratique
//
// L'appelant reçoit { content_md, avis_sophie, conseil_sophie } et choisit
// quoi appliquer dans le state local de la page édition (pas auto-save).
// ─────────────────────────────────────────────────────────────────────────

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

// Récupère le persona_prompt du site (typiquement la persona Sophie pour cadeauclic)
async function loadPersonaPrompt(siteId: string): Promise<string> {
  const configRaw = await ghGet(`platform/sites/${siteId}/config.yaml`)
  if (!configRaw) return ''
  // Format bloc YAML : `persona_prompt: |\n  ligne1\n  ligne2`
  const blockMatch = configRaw.match(/^persona_prompt:\s*\|\s*\n((?:  .*\n?)+)/m)
  if (blockMatch) {
    return blockMatch[1].split('\n').map(l => l.replace(/^  /, '')).join('\n').trim()
  }
  // Format inline : `persona_prompt: "..."`
  const flatMatch = configRaw.match(/^persona_prompt:\s*["']([^"']+)["']/m)
  if (flatMatch) return flatMatch[1]
  return ''
}

// ─── POST : génère les 3 contenus ─────────────────────────────────────────
// Body : { marque, categorie_marque?, description_marque?, n_codes? }
// Réponse : { content_md, avis_sophie, conseil_sophie, model, usage }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string; marqueSlug: string }> }
) {
  const { siteId, marqueSlug } = await params
  const body = await req.json()
  const marque = String(body.marque || '').trim()
  if (!marque) return NextResponse.json({ error: 'marque requise' }, { status: 400 })

  const categorieMarque = String(body.categorie_marque || '').trim()
  const descriptionMarque = String(body.description_marque || '').trim()
  const nCodes = Number.isFinite(body.n_codes) ? body.n_codes : 0

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquante' }, { status: 500 })

  // ── System prompt = persona du site + consignes spécifiques codes promo
  const persona = await loadPersonaPrompt(siteId)
  const baseSys = `Tu rédiges des contenus pour une page de codes promo d'une marque sur un site français de bons plans.

CONTRAINTES DE FORMAT (impératif) :
- Réponds UNIQUEMENT avec un objet JSON STRICT, sans texte avant/après, sans backticks de code fence
- Structure attendue (les 3 clés sont obligatoires) :
  {
    "comment_utiliser": "<markdown — 4 sections '## Étape 1', '## Étape 2', '## Étape 3', '## Étape 4' suivies chacune d'un paragraphe court de 1-2 phrases>",
    "avis_sophie": "<3 à 4 phrases — premier degré, ton chaleureux, mentionne le test des codes à la main>",
    "conseil_sophie": "<1 à 2 phrases — une astuce pratique pour économiser plus chez cette marque>"
  }

CONTRAINTES ÉDITORIALES (impératif) :
- Tutoie le lecteur ('tu', 'ton', 'ta', 'tes')
- Aucun emoji
- Aucune mention de marque concurrente
- Pas de superlatifs creux ('incroyable', 'révolutionnaire'…)
- Pas d'expressions interdites ('se positionne comme', 'incontournable', 'véritable allié', 'à ne pas manquer')
- Tout titre interrogatif se termine par ' ?' (espace simple avant le ?)
- En français : espace simple avant '?' '!' ':' ';' (pas d'espace insécable)
- Pas de tirets longs — ni –, utilise des virgules
- Pas de bullets unicode • ou ·
- Le markdown du comment_utiliser doit utiliser uniquement : ## titre, **gras**, listes - simples`

  const layers = [persona, baseSys].filter(Boolean)
  const systemPrompt = layers.join('\n\n')

  // ── User prompt
  const ctxLines = [
    `Marque : ${marque}`,
    categorieMarque ? `Catégorie : ${categorieMarque}` : '',
    descriptionMarque ? `Description fournie : ${descriptionMarque}` : '',
    nCodes > 0 ? `Nombre de codes promo actuellement actifs : ${nCodes}` : '',
  ].filter(Boolean).join('\n')

  const userPrompt = `Génère les 3 contenus textuels de la page codes promo de la marque suivante.

${ctxLines}

Précisions :
- "comment_utiliser" doit décrire les 4 étapes pour utiliser un code promo ${marque} sur le site marchand (repérer le code, ajouter au panier, coller dans le champ approprié, valider). Reste générique mais naturel.
- "avis_sophie" est un texte personnel à la première personne, comme si Sophie t'écrivait directement. Elle a rassemblé et testé les codes à la main, elle prévient des éventuels pièges.
- "conseil_sophie" est une astuce concrète et actionnable propre à cette marque (compte fidélité, période promo récurrente, app mobile, etc.).

Réponds avec l'objet JSON uniquement.`

  // ── Appel Claude
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,                    // ~500 mots max, suffit largement pour 3 contenus courts
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    return NextResponse.json({ error: 'Erreur Claude API', details: errText }, { status: 500 })
  }
  const data = await resp.json()
  const rawText: string = (data.content || [])
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('\n')
    .trim()

  // ── Parser le JSON (avec strip défensif des éventuels code fences)
  let parsed: { comment_utiliser?: string; avis_sophie?: string; conseil_sophie?: string } = {}
  let stripped = rawText
  stripped = stripped.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '').trim()
  try {
    parsed = JSON.parse(stripped)
  } catch {
    // Fallback : extraction par regex si le modèle a ajouté du texte autour
    const m = stripped.match(/\{[\s\S]*\}/)
    if (m) {
      try { parsed = JSON.parse(m[0]) } catch { /* echec total */ }
    }
  }

  if (!parsed.comment_utiliser && !parsed.avis_sophie && !parsed.conseil_sophie) {
    return NextResponse.json({
      error: 'Réponse Claude inexploitable (JSON non parseable)',
      raw: rawText.slice(0, 500),
    }, { status: 502 })
  }

  // Construire content_md final avec un H1 cohérent
  let content_md = parsed.comment_utiliser || ''
  // Si l'IA n'a pas commencé par # ..., on préfixe avec le titre attendu
  if (content_md && !/^#\s/m.test(content_md)) {
    content_md = `# Comment utiliser un code promo ${marque}\n\n${content_md}`
  } else if (content_md && !/^# Comment utiliser/i.test(content_md)) {
    // Garder le H1 existant s'il est cohérent, sinon ajouter
    const firstLine = content_md.split('\n')[0]
    if (!firstLine.includes('Comment utiliser')) {
      content_md = `# Comment utiliser un code promo ${marque}\n\n${content_md}`
    }
  }

  return NextResponse.json({
    content_md,
    avis_sophie: (parsed.avis_sophie || '').trim(),
    conseil_sophie: (parsed.conseil_sophie || '').trim(),
    model: 'claude-sonnet-4-20250514',
    usage: data.usage || null,
  })
}
