import { NextRequest, NextResponse } from 'next/server'
import { getFile, putFile } from '../../../lib/github'

// Suivi des inscriptions aux plateformes de vente de liens + CA par site/plateforme.
// Stocké dans un JSON à la racine du repo (même mécanisme GitHub que le reste).
const PATH = 'link-sales.json'

const DEFAULT = {
  platforms: [] as string[],          // colonnes ajoutées manuellement
  removed_sites: [] as string[],      // ids de sites retirés du tableau
  registrations: {} as Record<string, Record<string, boolean>>, // site -> plateforme -> inscrit
  sales: [] as Array<{ id: string; site: string; platform: string; price_ht: number; date: string; note?: string }>,
}

export async function GET() {
  const file = await getFile(PATH)
  if (!file) return NextResponse.json(DEFAULT)
  try {
    const data = JSON.parse(file.content)
    return NextResponse.json({ ...DEFAULT, ...data })
  } catch {
    return NextResponse.json(DEFAULT)
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const data = {
    platforms: Array.isArray(body.platforms) ? body.platforms.map((p: unknown) => String(p)).filter(Boolean) : [],
    removed_sites: Array.isArray(body.removed_sites) ? body.removed_sites.map((s: unknown) => String(s)) : [],
    registrations: body.registrations && typeof body.registrations === 'object' ? body.registrations : {},
    sales: Array.isArray(body.sales)
      ? body.sales
          .filter((s: any) => s && s.site && s.platform)
          .map((s: any) => ({
            id: String(s.id || Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
            site: String(s.site),
            platform: String(s.platform),
            price_ht: Number(s.price_ht) || 0,
            date: String(s.date || new Date().toISOString().slice(0, 10)),
            note: s.note ? String(s.note) : '',
          }))
      : [],
    updated_at: new Date().toISOString(),
  }
  const ok = await putFile(PATH, JSON.stringify(data, null, 2), 'HUB: maj suivi vente de liens')
  if (!ok) return NextResponse.json({ error: "Écriture échouée (vérifie le token GitHub)" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
