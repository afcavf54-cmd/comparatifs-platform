import { NextRequest, NextResponse } from 'next/server'
import { getFile } from '../../../../../lib/github'
type Params = { params: Promise<{ siteId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { siteId } = await params
  const formData = await req.formData()
  const file = formData.get('favicon') as File | null
  if (!file) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const ext = file.name.endsWith('.svg') ? 'svg' : file.name.endsWith('.ico') ? 'ico' : 'png'
  const path = `platform/sites/${siteId}/public/favicon.${ext}`

  const existing = await getFile(path)

  const res = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `HUB: Upload favicon for ${siteId}`,
        content: base64,
        ...(existing?.sha ? { sha: existing.sha } : {}),
      }),
    }
  )

  if (!res.ok) {
    const err = await res.json()
    return NextResponse.json({ error: err.message || 'Erreur GitHub' }, { status: 500 })
  }
  return NextResponse.json({ success: true, ext })
}
