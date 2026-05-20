import { NextRequest, NextResponse } from 'next/server'

// ─── Brouillons d'avis (prompt custom + questions FAQ imposées) ──────────
// GET  /api/sites/<siteId>/avis/draft/<slug>  → { slug, draft: {prompt_custom, faq_questions, updated} }
// PUT  /api/sites/<siteId>/avis/draft/<slug>  → met à jour prompt + questions FAQ
//
// Stockage : un unique fichier JSON `platform/sites/<siteId>/posts_avis/_drafts.json`
// au format :
//   {
//     "avis-qonto": {
//       "prompt_custom": "Rédige 3 H2 sur...",
//       "faq_questions": ["Est-ce gratuit ?", "Quelle sécurité ?", ...],
//       "updated": "2026-05-..."
//     },
//     ...
//   }
//
// Le script Python `avis_publish_scheduled.py` lit ce fichier au démarrage et :
//   - utilise `prompt_custom` pour générer le bloc HTML des sections H2
//     principales (entre le sommaire et "Retours d'expérience des utilisateurs")
//   - utilise `faq_questions` si non vide pour imposer la liste de questions
//     de la FAQ (Claude ne génère que les réponses, pas les questions). Si la
//     liste est vide, Claude invente questions + réponses comme avant.

const BASE = 'https://api.github.com'
const headers = {
  'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
}
const repoPath = () => `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`

type Params = { params: Promise<{ siteId: string; slug: string }> }

async function loadDrafts(siteId: string): Promise<{ data: Record<string, any>; sha?: string }> {
  const path = `platform/sites/${siteId}/posts_avis/_drafts.json`
  const res = await fetch(`${BASE}/repos/${repoPath()}/contents/${path}`, { headers, cache: 'no-store' })
  if (!res.ok) return { data: {} }
  const j = await res.json()
  if (!j?.content || j.encoding !== 'base64') return { data: {}, sha: j?.sha }
  try {
    const parsed = JSON.parse(Buffer.from(j.content, 'base64').toString('utf-8'))
    return { data: (parsed && typeof parsed === 'object') ? parsed : {}, sha: j.sha }
  } catch {
    return { data: {}, sha: j.sha }
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { siteId, slug } = await params
  const { data } = await loadDrafts(siteId)
  const draft = data[slug] || { prompt_custom: '', faq_questions: [] }
  // Garantit la présence des champs côté client même sur d'anciens drafts
  if (!Array.isArray(draft.faq_questions)) draft.faq_questions = []
  if (typeof draft.prompt_custom !== 'string') draft.prompt_custom = ''
  return NextResponse.json({ slug, draft })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { siteId, slug } = await params
  let body: any
  try { body = await req.json() } catch { body = {} }

  // Validation + nettoyage des entrées
  const prompt_custom: string = typeof body?.prompt_custom === 'string' ? body.prompt_custom : ''
  const rawFaq: any = body?.faq_questions
  // Filtre les entrées non-strings et les questions vides. Trim chaque question.
  const faq_questions: string[] = Array.isArray(rawFaq)
    ? rawFaq.filter(q => typeof q === 'string').map(q => q.trim()).filter(Boolean)
    : []

  const { data, sha } = await loadDrafts(siteId)

  // Si tout est vide (pas de prompt ET pas de questions) → supprime l'entrée
  // pour garder _drafts.json propre. Sinon, écrit l'entrée complète.
  if (!prompt_custom.trim() && faq_questions.length === 0) {
    delete data[slug]
  } else {
    data[slug] = {
      prompt_custom,
      faq_questions,
      updated: new Date().toISOString(),
    }
  }

  const path = `platform/sites/${siteId}/posts_avis/_drafts.json`
  const putBody: any = {
    message: `HUB: Update draft — ${slug}`,
    content: Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf-8').toString('base64'),
  }
  if (sha) putBody.sha = sha
  const r = await fetch(`${BASE}/repos/${repoPath()}/contents/${path}`, {
    method: 'PUT', headers, body: JSON.stringify(putBody),
  })
  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    console.error('[avis/draft PUT]', r.status, txt.slice(0, 300))
    return NextResponse.json({ error: `Erreur GitHub (${r.status})` }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
