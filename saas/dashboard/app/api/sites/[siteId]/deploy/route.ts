import { NextRequest, NextResponse } from 'next/server'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!
const REPO = process.env.GITHUB_REPO || 'afcavf54-cmd/comparatifs-platform'

type Params = { params: Promise<{ siteId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { siteId } = await params
  const body = await req.json()
  const skip_enrich = body.skip_enrich ?? true

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/generate-scpi.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          site: siteId,
          skip_enrich: skip_enrich.toString(),
          schedule: ''
        }
      })
    }
  )

  if (res.status === 204) {
    return NextResponse.json({ success: true })
  }

  const data = await res.json().catch(() => ({}))
  return NextResponse.json({ error: data.message || 'Erreur GitHub Actions' }, { status: 500 })
}
