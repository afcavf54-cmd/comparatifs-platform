import { NextRequest, NextResponse } from 'next/server'
import { getFile, putFile } from '../../../lib/github'

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
  const file = await getFile(path)
  if (!file) return NextResponse.json({ error: 'Fichier non trouvé' }, { status: 404 })
  return NextResponse.json(file)
}
