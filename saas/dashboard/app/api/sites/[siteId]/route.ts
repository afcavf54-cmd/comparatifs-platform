import { NextRequest, NextResponse } from 'next/server'
import { getFile, putFile } from '../../../../lib/github'

const HUB_CONFIG_PATH = 'hub.config.json'

type Params = { params: Promise<{ siteId: string }> }

export async function GET(_: NextRequest, { params }: Params) {
  const { siteId } = await params
  const file = await getFile(HUB_CONFIG_PATH)
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const config = JSON.parse(file.content)
  const site = config.sites.find((s: any) => s.id === siteId)
  if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(site)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { siteId } = await params
  const body = await req.json()
  const file = await getFile(HUB_CONFIG_PATH)
  if (!file) return NextResponse.json({ error: 'Config not found' }, { status: 404 })
  const config = JSON.parse(file.content)
  const idx = config.sites.findIndex((s: any) => s.id === siteId)
  if (idx === -1) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  config.sites[idx] = { ...config.sites[idx], ...body, id: siteId }
  config.updated_at = new Date().toISOString()
  const saved = await putFile(HUB_CONFIG_PATH, JSON.stringify(config, null, 2), `HUB: Update site ${siteId}`)
  if (!saved) return NextResponse.json({ error: 'Erreur GitHub' }, { status: 500 })
  return NextResponse.json(config.sites[idx])
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const { siteId } = await params
  const file = await getFile(HUB_CONFIG_PATH)
  if (!file) return NextResponse.json({ error: 'Config not found' }, { status: 404 })
  const config = JSON.parse(file.content)
  config.sites = config.sites.filter((s: any) => s.id !== siteId)
  config.updated_at = new Date().toISOString()
  const saved = await putFile(HUB_CONFIG_PATH, JSON.stringify(config, null, 2), `HUB: Delete site ${siteId}`)
  if (!saved) return NextResponse.json({ error: 'Erreur GitHub' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
