import { NextRequest, NextResponse } from 'next/server'
import { captain, captainConfigured, slugify } from '../../../../../../lib/captain'

// Upload d'un logo d'offre vers le Storage Supabase du projet captain.
// Renvoie une URL publique immédiate (pas besoin de rebuild du site).
const CAPTAIN = 'captain-parrainage'
const BUCKET = 'offer-logos'

export async function POST(req: NextRequest, { params }: { params: { siteId: string } }) {
  if (params.siteId !== CAPTAIN) return NextResponse.json({ error: 'Non applicable.' }, { status: 404 })
  if (!captainConfigured) return NextResponse.json({ error: 'Supabase captain non configuré.' }, { status: 500 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('logo') as File | null
  if (!file) return NextResponse.json({ error: 'Aucun fichier.' }, { status: 400 })
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: 'Logo trop lourd (max 2 Mo).' }, { status: 400 })

  // Bucket public (créé à la volée si absent).
  try { await captain.storage.createBucket(BUCKET, { public: true }) } catch { /* existe déjà */ }

  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const base = slugify((form?.get('slug') as string) || file.name.replace(/\.[^.]+$/, '') || 'logo') || 'logo'
  const path = `${base}-${Date.now()}.${ext}`
  const buf = Buffer.from(await file.arrayBuffer())

  const up = await captain.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type || 'image/png', upsert: true,
  })
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })

  const { data } = captain.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
