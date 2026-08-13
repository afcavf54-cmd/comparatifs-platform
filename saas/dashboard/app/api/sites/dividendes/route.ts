import { NextRequest, NextResponse } from 'next/server'
import { getFile, putFile } from '../../../../../lib/github'

// Actions (titres) du simulateur de dividendes — stockées par site dans le repo.
const filePath = (siteId: string) => `platform/sites/${siteId}/dividendes-actions.json`

type Action = {
  id: string; name: string; ticker: string; isin: string; logo: string
  country: string; currency: string; fmp_symbol: string
  price: number; price_updated_at: string
  dividend: number; dividend_year: string; dividend_updated_at: string
  eligible_pea: boolean; active: boolean
}

function sanitize(a: any, i: number): Action | null {
  const name = String(a?.name || '').trim()
  if (!name) return null
  return {
    id: String(a?.id || '').trim() || 'a' + Date.now().toString(36) + i,
    name,
    ticker: String(a?.ticker || '').trim(),
    isin: String(a?.isin || '').trim(),
    logo: String(a?.logo || '').trim(),
    country: String(a?.country || '').trim(),
    currency: String(a?.currency || 'EUR').trim() || 'EUR',
    // Symbole exact pour l'API de prix (ex. "TTE.PA"). Vide => on tentera le ticker.
    fmp_symbol: String(a?.fmp_symbol || '').trim(),
    price: Number(a?.price) || 0,
    price_updated_at: String(a?.price_updated_at || '').trim(),
    dividend: Number(a?.dividend) || 0,
    dividend_year: String(a?.dividend_year || '').trim(),
    dividend_updated_at: String(a?.dividend_updated_at || '').trim(),
    eligible_pea: a?.eligible_pea === true,
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
