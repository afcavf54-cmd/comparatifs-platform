import { NextRequest, NextResponse } from 'next/server'

const GITHUB_TOKEN   = process.env.GITHUB_TOKEN
const GITHUB_OWNER   = process.env.GITHUB_OWNER
const GITHUB_REPO    = process.env.GITHUB_REPO

async function getFileSHA(path: string): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } }
  )
  if (!res.ok) return null
  const data = await res.json()
  return data.sha || null
}

export async function POST(req: NextRequest) {
  try {
    const { path, content, message } = await req.json()

    if (!path || !content) {
      return NextResponse.json({ error: 'path et content requis' }, { status: 400 })
    }

    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      return NextResponse.json({ error: 'Variables GitHub manquantes' }, { status: 500 })
    }

    // Encode en base64
    const encoded = Buffer.from(content, 'utf-8').toString('base64')

    // Récupère le SHA si le fichier existe déjà
    const sha = await getFileSHA(path)

    const body: Record<string, string> = {
      message: message || `Update ${path}`,
      content: encoded,
    }
    if (sha) body.sha = sha

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    )

    if (!res.ok) {
      const err = await res.json()
      return NextResponse.json({ error: err.message }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({
      success: true,
      sha: data.content?.sha,
      commit: data.commit?.html_url,
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const path = searchParams.get('path')

  if (!path) return NextResponse.json({ error: 'path requis' }, { status: 400 })

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } }
  )

  if (!res.ok) return NextResponse.json({ error: 'Fichier introuvable' }, { status: 404 })

  const data = await res.json()
  const content = Buffer.from(data.content, 'base64').toString('utf-8')
  return NextResponse.json({ content, sha: data.sha })
}
