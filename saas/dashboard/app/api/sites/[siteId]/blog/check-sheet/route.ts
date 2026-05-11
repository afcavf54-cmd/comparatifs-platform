import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://api.github.com'
const headers = {
  'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}
const repoPath = () => `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`

/**
 * POST /api/sites/[siteId]/blog/check-sheet
 *
 * Déclenche le workflow `blog-cron.yml` via workflow_dispatch.
 * Le workflow tourne automatiquement toutes les heures via cron, mais ce bouton
 * permet de forcer une vérification immédiate (pour publier des articles dont
 * la date est passée sans attendre le prochain tick).
 *
 * Note : on ne passe PAS de filtre par site car le script traite tous les
 * sites en une seule passe (moins de tokens consommés).
 */
export async function POST(_: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const url = `${BASE}/repos/${repoPath()}/actions/workflows/blog-cron.yml/dispatches`
  const r = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { site: siteId } }),
  })
  if (!r.ok) {
    const errText = await r.text()
    return NextResponse.json({ error: 'Échec déclenchement workflow', details: errText }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
