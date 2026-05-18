import { NextRequest, NextResponse } from 'next/server'

// POST /api/sites/[siteId]/avis/publish-now
// Body : { marques: string[] }  (les marques à forcer, ex ["Qonto", "LegalPlace"])
//
// Déclenche le workflow blog-cron.yml avec l'input force_titles. Le script
// avis_publish_scheduled.py honore la variable d'env FORCE_TITLES (séparateur
// `||`) pour publier immédiatement même si la date programmée n'est pas atteinte.

const BASE = 'https://api.github.com'

function repoPath() {
  return `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }
  const marques: string[] = Array.isArray(body?.marques) ? body.marques.filter(Boolean) : []
  if (marques.length === 0) {
    return NextResponse.json({ error: 'Aucune marque fournie' }, { status: 400 })
  }
  const forceTitles = marques.join('||')

  const res = await fetch(
    `${BASE}/repos/${repoPath()}/actions/workflows/blog-cron.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { force_titles: forceTitles, site: siteId },
      }),
    }
  )

  if (!res.ok) {
    const txt = await res.text()
    return NextResponse.json({ error: `Échec dispatch workflow (HTTP ${res.status}) : ${txt}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    message: `Publication forcée demandée pour ${marques.length} marque(s) : ${marques.join(', ')}. Le workflow blog-cron est en cours.`,
    site: siteId,
    marques,
  })
}
