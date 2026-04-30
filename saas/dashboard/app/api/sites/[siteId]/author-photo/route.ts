import { NextRequest, NextResponse } from 'next/server'

const OWNER = process.env.GITHUB_OWNER || 'afcavf54-cmd'
const REPO = process.env.GITHUB_REPO || 'comparatifs-platform'
const TOKEN = process.env.GITHUB_TOKEN!

type Params = { params: Promise<{ siteId: string }> }

async function getFileSha(path: string): Promise<string | null> {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' }
  })
  if (!res.ok) return null
  const d = await res.json()
  return d.sha || null
}

export async function POST(req: NextRequest, { params }: Params) {
  const { siteId } = await params
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const filename = `author-photo.${ext}`
  const path = `platform/sites/${siteId}/public/${filename}`

  const sha = await getFileSha(path)

  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `HUB: Upload author photo for ${siteId}`,
        content: base64,
        ...(sha ? { sha } : {}),
      }),
    }
  )

  if (!res.ok) {
    const err = await res.json()
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  const rawUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${path}`
  return NextResponse.json({ ok: true, path: `/${filename}`, rawUrl })
}
