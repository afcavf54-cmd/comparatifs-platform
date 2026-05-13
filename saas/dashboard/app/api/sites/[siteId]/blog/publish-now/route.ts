import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://api.github.com'
const headers = {
  'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}
const repoPath = () => `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`

/**
 * POST /api/sites/[siteId]/blog/publish-now
 * Body: { title: string }
 *
 * Force la publication immédiate d'un article programmé (date future).
 * Déclenche `blog-cron.yml` avec l'input `force_titles=<titre>` qui sera lu
 * par `blog_publish_scheduled.py` pour ignorer la date programmée et publier
 * tout de suite. Le script ne touche pas à la sheet, donc la ligne reste
 * marquée comme "déjà traité" après publication.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const body = await req.json().catch(() => ({})) as { title?: string }
  const title = (body.title || '').trim()
  if (!title) {
    return NextResponse.json({ error: 'title manquant' }, { status: 400 })
  }
  const url = `${BASE}/repos/${repoPath()}/actions/workflows/blog-cron.yml/dispatches`
  const r = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref: 'main',
      inputs: {
        site: siteId,
        force_titles: title,
      },
    }),
  })
  if (!r.ok) {
    const errText = await r.text()
    return NextResponse.json({ error: 'Échec déclenchement workflow', details: errText }, { status: 500 })
  }
  return NextResponse.json({ ok: true, title })
}
