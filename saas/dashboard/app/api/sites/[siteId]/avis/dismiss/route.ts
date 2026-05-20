import { NextRequest, NextResponse } from 'next/server'

// ─── Endpoint de "suppression" d'un avis en attente ───────────────────────
// POST /api/sites/<siteId>/avis/dismiss  body: { marque, date_publication }
//
// Les lignes "pending" / "scheduled" affichées dans le dashboard viennent
// d'une Google Sheet (lecture seule sans OAuth Google). On ne peut donc pas
// modifier la sheet directement. À la place, on ajoute la clé de la ligne
// dans `posts_avis/schedule_processed.json` — fichier que le script Python
// `avis_publish_scheduled.py` lit pour skipper les avis déjà traités.
//
// Format de la clé (cf. row_key() côté Python) :
//   "slugify(marque)|date_publication_brute"
//
// Effet :
//   - Le cron horaire ne publiera plus cet avis
//   - La preview-sheet de l'UI filtre cette ligne (cf. avis/preview-sheet/route.ts)
//
// Pour "annuler" la suppression : retirer manuellement la clé du fichier JSON.

const BASE = 'https://api.github.com'
const headers = {
  'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
}
const repoPath = () => `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`

function slugify(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  let body: any
  try { body = await req.json() } catch { body = {} }
  const marque: string = (body?.marque || '').trim()
  const date_publication: string = (body?.date_publication || '').trim()
  if (!marque) return NextResponse.json({ error: 'marque requise' }, { status: 400 })

  const path = `platform/sites/${siteId}/posts_avis/schedule_processed.json`

  // 1) Lire le fichier existant (peut ne pas exister encore)
  let processed: string[] = []
  let sha: string | undefined
  const getRes = await fetch(`${BASE}/repos/${repoPath()}/contents/${path}`, { headers, cache: 'no-store' })
  if (getRes.ok) {
    const data = await getRes.json()
    if (data.content && data.encoding === 'base64') {
      try {
        const parsed = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'))
        if (Array.isArray(parsed)) processed = parsed.map(String)
      } catch { processed = [] }
      sha = data.sha
    }
  }

  // 2) Construire la clé au même format que row_key() du script Python
  const key = `${slugify(marque)}|${date_publication}`
  if (!processed.includes(key)) processed.push(key)
  // Dédup + tri pour rester cohérent avec le format Python (json.dumps sorted)
  processed = Array.from(new Set(processed)).sort()

  // 3) Réécrire le fichier
  const putBody: any = {
    message: `HUB: Dismiss avis "${marque}"${date_publication ? ' (' + date_publication + ')' : ''}`,
    content: Buffer.from(JSON.stringify(processed, null, 2) + '\n', 'utf-8').toString('base64'),
  }
  if (sha) putBody.sha = sha
  const putRes = await fetch(`${BASE}/repos/${repoPath()}/contents/${path}`, {
    method: 'PUT', headers, body: JSON.stringify(putBody),
  })
  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => '')
    console.error('[avis/dismiss]', putRes.status, txt.slice(0, 300))
    return NextResponse.json({ error: 'Erreur GitHub (' + putRes.status + ')' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, key })
}
