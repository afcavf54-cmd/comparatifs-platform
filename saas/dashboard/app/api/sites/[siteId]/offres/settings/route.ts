import { NextRequest, NextResponse } from 'next/server'
import { mcf, mcfConfigured } from '../../../../../../lib/mcf'

// Réglages du simulateur (app_settings) : URL partenaire regroupement, mode démo.
const MCF = 'mon-credit-facile-fr'
function guard(siteId: string) {
  if (siteId !== MCF) return NextResponse.json({ error: 'Non applicable.' }, { status: 404 })
  if (!mcfConfigured) return NextResponse.json({ error: 'Supabase mon-credit-facile non configuré.' }, { status: 500 })
  return null
}

// GET : tous les réglages (clé → valeur).
export async function GET(_req: NextRequest, { params }: { params: { siteId: string } }) {
  const g = guard(params.siteId); if (g) return g
  const { data, error } = await mcf.from('app_settings').select('key,value')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const settings: Record<string, string> = {}
  ;(data || []).forEach((r: { key: string; value: string | null }) => { settings[r.key] = r.value || '' })
  return NextResponse.json({ settings })
}

// PUT : met à jour un ou plusieurs réglages. Body = { [key]: value }.
export async function PUT(req: NextRequest, { params }: { params: { siteId: string } }) {
  const g = guard(params.siteId); if (g) return g
  const body = (await req.json()) as Record<string, string>
  const rows = Object.entries(body).map(([key, value]) => ({ key, value: String(value ?? ''), public: true }))
  if (rows.length === 0) return NextResponse.json({ ok: true })
  const { error } = await mcf.from('app_settings').upsert(rows, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
