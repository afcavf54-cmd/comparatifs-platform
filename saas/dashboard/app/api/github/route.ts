import { NextRequest, NextResponse } from 'next/server'
import { getFile, putFile } from '../../../lib/github'

const BASE = 'https://api.github.com'
const headers = {
  'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

export async function POST(req: NextRequest) {
  const { path, content, message } = await req.json()
  if (!path || !content) return NextResponse.json({ error: 'path et content requis' }, { status: 400 })
  const ok = await putFile(path, content, message || `HUB: Update ${path}`)
  if (!ok) return NextResponse.json({ error: 'Erreur GitHub' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const path = url.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path requis' }, { status: 400 })

  const repo = `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`
  const res = await fetch(`${BASE}/repos/${repo}/contents/${path}`, { headers, cache: 'no-store' })
  if (!res.ok) return NextResponse.json({ error: 'Fichier non trouvé' }, { status: 404 })

  const data = await res.json()

  // Tableau = dossier
  if (Array.isArray(data)) return NextResponse.json(data)

  // Fichier unique
  return NextResponse.json({
    content: Buffer.from(data.content, 'base64').toString('utf-8'),
    sha: data.sha,
    name: data.name,
    path: data.path,
  })
}
