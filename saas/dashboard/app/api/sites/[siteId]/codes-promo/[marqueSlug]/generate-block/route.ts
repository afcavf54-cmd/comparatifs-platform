import { NextRequest, NextResponse } from 'next/server'
import { CLAUDE_MODEL } from '../../../../../../../lib/ai-model'

/**
 * POST /api/sites/[siteId]/codes-promo/[marqueSlug]/generate-block
 *
 * Génère le contenu UN seul bloc éditorial pour la page d'une marque codes-promo.
 *
 * Avantages vs l'ancien `/generate` all-in-one :
 *   - L'utilisateur regénère bloc par bloc sans tout recalculer
 *   - Nombre de mots configurable par bloc
 *   - Plus de blocs "oubliés" par le modèle (chaque appel est ciblé)
 *
 * Body attendu :
 *   {
 *     block_type: "description_marque" | "avis_sophie" | "conseil_sophie"
 *               | "faq" | "content_md" | "content_libre",
 *     n_words: 80,                    // nombre de mots cible
 *     custom_prompt?: "Mentionne le bonus de parrainage", // bloc 5 et 6 uniquement
 *   }
 *
 * Réponse :
 *   {
 *     ok: true,
 *     block_type: "...",
 *     content: "...",           // string pour la plupart des blocs
 *                               // OU array [{question, reponse}] pour faq
 *     debug?: { ... }           // optionnel — pour debug
 *   }
 */

// ─── PROMPTS ─────────────────────────────────────────────────────────────
// Tous les prompts sont CENTRALISÉS ici pour faciliter l'itération.
// Placeholders : {marque}, {categorie}, {author_name}, {site_name},
//                {n_words}, {n_codes}, {description_marque}

// Layer 2 : prompt éditorial GLOBAL appliqué à tous les blocs codes-promo.
// Définit le style général attendu (ton, structure, no-no commerciaux).
const GLOBAL_EDITORIAL_PROMPT = `Tu rédiges du contenu éditorial pour {site_name}, un site de codes promo et bons plans.

PRINCIPES ÉDITORIAUX (impératifs) :
- Ton chaleureux, direct, sincère — comme à une amie. JAMAIS commercial ou marketing.
- INTERDIT : "leader", "incontournable", "le top", "imbattable", "la meilleure offre du marché"
- Si tu dois mentionner une faiblesse de la marque, fais-le honnêtement (ça renforce la crédibilité)
- Pas de sur-promesses : pas de "tu vas adorer", "économies garanties"
- Pas de Markdown sauf indication contraire — HTML simple uniquement (<p>, <h2>, <ul>, <li>, <strong>, <em>)
- Pas de bullet points unicode (• · ●), utilise des <ul><li>...</li></ul>
- Pas de tirets longs — ni –, virgules ou points uniquement
- Réponds UNIQUEMENT avec le contenu du bloc demandé, SANS préambule, sans commentaire, sans backticks de code fence`

// Layer 3 : prompts SPÉCIFIQUES à chaque bloc.
type BlockConfig = {
  defaultWords: number
  minWords: number
  maxWords: number
  // Prompt utilisateur (le "user" message envoyé à Claude). Peut référencer
  // tous les placeholders. Le persona + global sont injectés AVANT en system.
  promptTemplate: string
  // Si true, le bloc accepte un prompt custom supplémentaire qui sera
  // appended au prompt après le promptTemplate (pour les blocs 5 et 6).
  allowsCustomPrompt: boolean
  // Si true, on s'attend à du JSON en sortie (le bloc faq notamment)
  expectsJson?: boolean
  // Format de sortie attendu (HTML, prose, json) — pour info / future validation
  outputFormat: 'html' | 'prose' | 'json'
}

const BLOCKS: Record<string, BlockConfig> = {
  description_marque: {
    defaultWords: 50, minWords: 30, maxWords: 120,
    outputFormat: 'prose',
    allowsCustomPrompt: false,
    promptTemplate: `Rédige une description NEUTRE et INFORMATIVE de la marque "{marque}" ({categorie}) en 2-3 phrases (~{n_words} mots).

Présente : ce qu'elle vend/fait, à qui elle s'adresse, son positionnement (premium, low-cost, niche, généraliste, etc.).

INTERDIT :
- Superlatifs marketing ("leader", "incontournable", "référence")
- Toute mention de codes promo, prix, réductions
- Titres, bullet points

Format : prose brute, pas de balise HTML, pas de Markdown.`,
  },

  avis_sophie: {
    defaultWords: 120, minWords: 80, maxWords: 250,
    outputFormat: 'prose',
    allowsCustomPrompt: false,
    promptTemplate: `Rédige TON avis personnel sur "{marque}" en tant que {author_name}, en 2-3 paragraphes (~{n_words} mots).

À la 1ère personne ("je", "j'ai testé", "ce que j'aime").

CONTEXTE : {n_codes} code(s) promo actif(s) sur cette marque en ce moment. Tu peux le mentionner naturellement ("j'ai sélectionné {n_codes} codes ce mois-ci", "parmi les {n_codes} offres que j'ai vérifiées…") MAIS sans en faire un argument commercial — c'est juste un détail concret qui ancre ton avis dans le réel.

Mentionne :
- Pourquoi tu aimes (ou pas) cette marque
- 1-2 cas d'usage concrets (occasions, types d'achats, profils)
- 1 conseil pratique en fin

INTERDIT :
- "Top du top", superlatifs commerciaux
- Sur-promesses ("tu vas adorer")
- Bullet points (prose uniquement)

Format : prose, 2-3 paragraphes séparés par double saut de ligne. Pas de balise HTML, pas de Markdown.`,
  },

  conseil_sophie: {
    defaultWords: 50, minWords: 30, maxWords: 120,
    outputFormat: 'prose',
    allowsCustomPrompt: false,
    promptTemplate: `Rédige UN conseil pratique de {author_name} pour économiser sur "{marque}" (~{n_words} mots).

Quelque chose de CONCRET et ACTIONNABLE :
- Un timing (soldes, Black Friday, fin de saison)
- Une technique (cumul cashback, parrainage, panier abandonné)
- Une période où les promos sont fortes
- Un combo gagnant (newsletter + premier achat + parrainage)

Commence par un verbe d'action ("Surveille...", "Empile...", "Profite de...").

Ton de copine qui partage un tuyau. 1 seul paragraphe court. Pas de bullets. Pas de balise HTML.`,
  },

  faq: {
    defaultWords: 200, minWords: 120, maxWords: 400,
    outputFormat: 'json',
    expectsJson: true,
    allowsCustomPrompt: false,
    promptTemplate: `Génère 4 questions/réponses FAQ sur les codes promo "{marque}" (~{n_words} mots au total, donc ~50 mots par réponse).

Couvre OBLIGATOIREMENT ces 4 angles dans cet ordre :
1. Comment utiliser un code promo {marque} ? (étapes au panier)
2. Les codes promo {marque} sont-ils cumulables (entre eux, avec cashback, avec autres offres) ?
3. {marque} propose-t-elle un code de parrainage / étudiant / nouveau client ?
4. Que faire si mon code promo {marque} ne fonctionne pas ?

Réponses factuelles, utiles, NON commerciales.

RÉPONDS UNIQUEMENT EN JSON VALIDE, sans backticks, sans préambule :
[{"question": "...", "reponse": "..."}, ...]

Pas de balise HTML dans les réponses, juste du texte. Pas de Markdown.`,
  },

  // Bloc 5 — Section "Comment utiliser un code promo {marque}"
  // Prompt système FIXE mais accepte un prompt custom supplémentaire.
  content_md: {
    defaultWords: 400, minWords: 250, maxWords: 800,
    outputFormat: 'html',
    allowsCustomPrompt: true,
    promptTemplate: `Rédige une section "Comment utiliser un code promo {marque}" en HTML simple.

STRUCTURE OBLIGATOIRE :
- 4 étapes, chacune avec un <h2>Étape 1 : titre court</h2>, <h2>Étape 2 : ...</h2>, etc.
- Chaque étape = 1 ou 2 paragraphes <p> de 80-120 mots
- Cible totale : ~{n_words} mots

CONTENU :
- Étape 1 : repérer / choisir le bon code parmi ceux affichés
- Étape 2 : cliquer / copier (mention du flow réel sur {marque})
- Étape 3 : appliquer dans le panier sur {marque} (où exactement, à quelle étape)
- Étape 4 : vérifier / finaliser (vérifier la remise appliquée avant paiement)

Ton de {author_name} qui guide. Pratico-pratique, exemples concrets, valeurs réalistes.

INTERDICTION ABSOLUE : pas de balise <a href> à l'intérieur d'un <h2>.

Format : HTML simple uniquement. Pas de <div>, pas de classes CSS, pas de Markdown.`,
  },

  // Bloc 6 — Contenu LIBRE affiché sous l'historique. Prompt 100% custom.
  // Le seul prompt fixe = global éditorial + persona. Tout le reste vient de
  // l'utilisateur via custom_prompt.
  content_libre: {
    defaultWords: 300, minWords: 100, maxWords: 1200,
    outputFormat: 'html',
    allowsCustomPrompt: true,
    promptTemplate: `Rédige un contenu HTML pour la page de la marque "{marque}" ({categorie}), selon les instructions précises ci-dessous.

Cible : ~{n_words} mots.

INSTRUCTIONS SPÉCIFIQUES DE L'AUTEUR (à respecter scrupuleusement) :
{custom_prompt}

Format : HTML simple uniquement (<h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>). Pas de <div>, pas de classes CSS, pas de Markdown.
INTERDICTION : pas de balise <a> à l'intérieur d'un <h2>, <h3>, etc.
Si l'auteur ne demande pas de structure, fais une rédaction continue en paragraphes.`,
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────
const BASE = 'https://api.github.com'
const ghHeaders = {
  'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}
const repoPath = () => `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`

async function ghGet(path: string): Promise<string | null> {
  const res = await fetch(`${BASE}/repos/${repoPath()}/contents/${path}`, {
    headers: ghHeaders, cache: 'no-store',
  })
  if (!res.ok) return null
  const data = await res.json()
  if (Array.isArray(data)) return null
  return Buffer.from(data.content, 'base64').toString('utf-8')
}

/** Récupère le persona_prompt et le nom de l'auteur depuis config.yaml. */
async function loadSiteContext(siteId: string): Promise<{
  persona_prompt: string
  author_name: string
  site_name: string
}> {
  const yaml = await ghGet(`platform/sites/${siteId}/config.yaml`)
  if (!yaml) return { persona_prompt: '', author_name: 'Sophie', site_name: siteId }

  // Parsing ligne par ligne (regex multilignes en YAML sont peu fiables, cf
  // backlog technique persistant Viseoweb).
  let persona = ''
  let authorName = 'Sophie'
  let siteName = siteId
  let inAuthor = false
  let inPersona = false
  let personaIndent = -1
  const lines = yaml.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const stripped = line.trim()

    // site.name
    const sn = line.match(/^name:\s*["']?(.+?)["']?\s*$/)
    if (sn && !line.startsWith(' ')) siteName = sn[1]

    // author.name (sous-objet)
    if (/^author:\s*$/.test(stripped)) { inAuthor = true; continue }
    if (inAuthor && /^\S/.test(line)) inAuthor = false  // sortie du bloc author
    if (inAuthor) {
      const an = stripped.match(/^name:\s*["']?(.+?)["']?$/)
      if (an) authorName = an[1]
    }

    // persona_prompt: peut être inline ("...") ou multilignes (| ou >)
    if (/^persona_prompt:\s*(\|[\-+]?|>[\-+]?)\s*$/.test(stripped)) {
      inPersona = true
      personaIndent = -1
      continue
    }
    const personaInline = stripped.match(/^persona_prompt:\s*["'](.+)["']\s*$/)
    if (personaInline) { persona = personaInline[1]; continue }

    if (inPersona) {
      // Détection fin du bloc multiligne : ligne non-indentée ou ligne à
      // indentation < indent du bloc.
      const indent = line.match(/^(\s*)/)?.[1].length || 0
      if (stripped === '') { persona += '\n'; continue }
      if (personaIndent < 0) personaIndent = indent
      if (indent < personaIndent && stripped !== '') {
        inPersona = false
      } else {
        persona += (persona ? '\n' : '') + line.slice(personaIndent)
      }
    }
  }
  return {
    persona_prompt: persona.trim(),
    author_name: authorName,
    site_name: siteName,
  }
}

/** Récupère le frontmatter brand pour avoir les valeurs courantes (marque,
 * categorie, description, n_codes actifs). */
async function loadBrandContext(siteId: string, marqueSlug: string): Promise<{
  marque: string; categorie: string; description: string; n_codes: number
}> {
  const md = await ghGet(`platform/sites/${siteId}/codes_promo/${marqueSlug}.md`)
  if (!md) return { marque: marqueSlug, categorie: '', description: '', n_codes: 0 }

  // Front-matter parsing minimal (ligne par ligne)
  let marque = marqueSlug
  let categorie = ''
  let description = ''
  let nCodes = 0
  let inCodes = false
  const lines = md.split('\n')
  let inFm = false
  for (const line of lines) {
    if (line === '---') { inFm = !inFm; if (!inFm) break; continue }
    if (!inFm) continue
    const m1 = line.match(/^marque:\s*["']?(.+?)["']?$/)
    if (m1) marque = m1[1]
    const m2 = line.match(/^categorie_marque:\s*["']?(.+?)["']?$/)
    if (m2) categorie = m2[1]
    const m3 = line.match(/^description_marque:\s*["']?(.+?)["']?$/)
    if (m3) description = m3[1]
    if (/^codes:\s*$/.test(line.trim())) inCodes = true
    if (inCodes && /^\s*-\s*id:/.test(line)) nCodes++
    // Sortie du bloc codes quand on retombe à indent 0 sur autre clé
    if (inCodes && /^\S/.test(line) && !/^codes:\s*$/.test(line)) inCodes = false
  }
  // Approximation : compter aussi les `expired: true` pour soustraire
  // (pas critique, c'est juste pour le prompt)
  const expired = (md.match(/expired:\s*true/g) || []).length
  nCodes = Math.max(0, nCodes - expired)

  return { marque, categorie, description, n_codes: nCodes }
}

/** Remplace {placeholders} dans un template. */
function fillTemplate(template: string, vars: Record<string, string | number>): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
  }
  return out
}

// ─── Anthropic API call ──────────────────────────────────────────────────
async function callClaude(system: string, user: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquante côté serveur')
  // Alias non daté pour éviter les futures dépréciations modèle (cf incident
  // Sonnet 4 du 15 juin 2026).
  const model = CLAUDE_MODEL
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => 'inconnu')
    throw new Error(`Anthropic API ${res.status} : ${err.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = (data.content || []).map((b: any) => b.text || '').join('').trim()
  return text
}

/** Strip d'éventuels code fences ```html ... ``` ou ```json ... ```. */
function stripCodeFences(s: string): string {
  return s
    .replace(/^```(?:html|json|markdown|md|text)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()
}

/** Strip les <a> à l'intérieur des <hN>. Defensive vu le bug récurrent. */
function stripLinksFromHeadings(html: string): string {
  return html.replace(
    /<h[1-6]\b[^>]*>.*?<\/h[1-6]>/gis,
    (m) => m.replace(/<a\b[^>]*>(.*?)<\/a>/gis, '$1')
  )
}

// ─── Handler ─────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string; marqueSlug: string }> },
) {
  let stage = 'init'
  try {
    const { siteId, marqueSlug } = await params

    stage = 'parse body'
    const body = await req.json()
    const blockType: string = body.block_type
    const nWords: number = parseInt(body.n_words, 10) || 0
    const customPrompt: string = (body.custom_prompt || '').trim()

    stage = 'validate block_type'
    const cfg = BLOCKS[blockType]
    if (!cfg) {
      return NextResponse.json({
        error: `Bloc inconnu : "${blockType}". Valides : ${Object.keys(BLOCKS).join(', ')}`,
      }, { status: 400 })
    }

    stage = 'clamp n_words'
    const words = Math.max(cfg.minWords, Math.min(cfg.maxWords, nWords || cfg.defaultWords))

    stage = 'validate custom_prompt (block 6)'
    // Le bloc content_libre EXIGE un prompt custom (sinon Claude ne sait pas
    // quoi écrire). Pour le bloc 5, le custom est optionnel.
    if (blockType === 'content_libre' && customPrompt.length < 10) {
      return NextResponse.json({
        error: 'Le bloc "Contenu libre" requiert un prompt personnalisé (au moins 10 caractères).',
      }, { status: 400 })
    }

    stage = 'load context'
    const [siteCtx, brandCtx] = await Promise.all([
      loadSiteContext(siteId),
      loadBrandContext(siteId, marqueSlug),
    ])

    stage = 'build system prompt (layers 1 + 2)'
    const layer1Persona = siteCtx.persona_prompt
      ? `PERSONA DE L'AUTEUR :\n${siteCtx.persona_prompt}`
      : ''
    const layer2Global = fillTemplate(GLOBAL_EDITORIAL_PROMPT, {
      site_name: siteCtx.site_name,
    })
    const systemPrompt = [layer1Persona, layer2Global].filter(Boolean).join('\n\n')

    stage = 'build user prompt (layer 3 + 4)'
    let userPrompt = fillTemplate(cfg.promptTemplate, {
      marque: brandCtx.marque,
      categorie: brandCtx.categorie || 'non catégorisée',
      description_marque: brandCtx.description,
      author_name: siteCtx.author_name,
      site_name: siteCtx.site_name,
      n_words: words,
      n_codes: brandCtx.n_codes,
      custom_prompt: customPrompt || '(aucune instruction supplémentaire)',
    })
    // Pour le bloc 5 (content_md), on append le custom_prompt après si fourni.
    // Le bloc 6 (content_libre) intègre déjà custom_prompt via le placeholder.
    if (blockType === 'content_md' && customPrompt) {
      userPrompt += `\n\nINSTRUCTIONS SPÉCIFIQUES POUR CETTE MARQUE :\n${customPrompt}`
    }

    stage = 'call Claude'
    // max_tokens approx : 1 mot ≈ 2 tokens, on prend 4× pour marge.
    const maxTokens = Math.min(8000, Math.max(800, words * 4))
    let result = await callClaude(systemPrompt, userPrompt, maxTokens)
    result = stripCodeFences(result)

    stage = 'post-process'
    let content: any = result
    if (cfg.expectsJson) {
      // Parse en JSON pour les FAQ
      try {
        const parsed = JSON.parse(result)
        if (!Array.isArray(parsed)) throw new Error('JSON doit être un array')
        content = parsed.filter((q: any) => q?.question && q?.reponse)
      } catch (e: any) {
        console.error(`[generate-block ${blockType}] JSON parse fail :`, e?.message, result.slice(0, 200))
        return NextResponse.json({
          error: `Le modèle n'a pas renvoyé du JSON valide. Réessaie. (${e?.message || 'parse'})`,
          raw: result.slice(0, 500),
        }, { status: 500 })
      }
    } else if (cfg.outputFormat === 'html') {
      // Strip défensif des liens dans les titres (cf bug récurrent)
      content = stripLinksFromHeadings(result)
    }

    return NextResponse.json({
      ok: true,
      block_type: blockType,
      content,
      debug: {
        n_words_target: words,
        n_codes_used: brandCtx.n_codes,
        persona_loaded: siteCtx.persona_prompt.length > 0,
      },
    })
  } catch (e: any) {
    const msg = e?.message || String(e) || 'inconnue'
    console.error(`[generate-block] crash @ stage="${stage}" : ${msg}\n${e?.stack || ''}`)
    return NextResponse.json({
      error: `Crash interne (${stage}) : ${msg}`,
      stage,
    }, { status: 500 })
  }
}

// ─── GET : retourne la config des blocs (pour le client) ─────────────────
// Utilisé par la page d'édition pour savoir defaultWords/minWords/maxWords
// de chaque bloc sans dupliquer ces constantes côté client.
export async function GET() {
  const cfg = Object.fromEntries(
    Object.entries(BLOCKS).map(([k, v]) => [k, {
      defaultWords: v.defaultWords,
      minWords: v.minWords,
      maxWords: v.maxWords,
      allowsCustomPrompt: v.allowsCustomPrompt,
      outputFormat: v.outputFormat,
    }])
  )
  return NextResponse.json({ blocks: cfg })
}
