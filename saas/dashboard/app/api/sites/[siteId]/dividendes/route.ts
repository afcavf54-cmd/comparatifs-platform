import { NextRequest, NextResponse } from 'next/server'
import { getFile, putFile } from '../../../../../lib/github'

// Actions (titres) du simulateur de dividendes — stockées par site dans le repo.
const filePath = (siteId: string) => `platform/sites/${siteId}/dividendes-actions.json`

type Action = {
  id: string; name: string; ticker: string; logo: string
  country: string; currency: string; price: number; dividend: number; active: boolean
}

function sanitize(a: any, i: number): Action | null {
  const name = String(a?.name || '').trim()
  if (!name) return null
  return {
    id: String(a?.id || '').trim() || 'a' + Date.now().toString(36) + i,
    name,
    ticker: String(a?.ticker || '').trim(),
    logo: String(a?.logo || '').trim(),
    country: String(a?.country || '').trim(),
    currency: String(a?.currency || 'EUR').trim() || 'EUR',
    price: Number(a?.price) || 0,
    dividend: Number(a?.dividend) || 0,
    active: a?.active !== false,
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const file = await getFile(filePath(siteId))
  if (!file) return NextResponse.json({ actions: [] })
  try {
    const data = JSON.parse(file.content)
    return NextResponse.json({ actions: Array.isArray(data.actions) ? data.actions : [] })
  } catch {
    return NextResponse.json({ actions: [] })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const body = await req.json()
  const actions = (Array.isArray(body.actions) ? body.actions : [])
    .map(sanitize)
    .filter(Boolean)
  const content = JSON.stringify({ actions, updated_at: new Date().toISOString() }, null, 2)
  const ok = await putFile(filePath(siteId), content, 'HUB: maj actions simulateur dividendes')
  if (!ok) return NextResponse.json({ error: "Écriture échouée (token GitHub ?)" }, { status: 500 })
  return NextResponse.json({ ok: true, count: actions.length })
}
