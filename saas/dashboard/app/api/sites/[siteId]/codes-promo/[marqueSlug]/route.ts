import { NextRequest, NextResponse } from 'next/server'
import { parseBrandFile, serializeBrand, Brand, normalizeHistory12Months } from '../../../../../../lib/codes-promo'

const BASE = 'https://api.github.com'
const headers = {
  'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}
const repoPath = () => `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`

async function ghGet(path: string): Promise<{ content: string; sha: string } | null> {
  const res = await fetch(`${BASE}/repos/${repoPath()}/contents/${path}`, { headers, cache: 'no-store' })
  if (!res.ok) return null
  const data = await res.json()
  if (Array.isArray(data)) return null
  return { content: Buffer.from(data.content, 'base64').toString('utf-8'), sha: data.sha }
}

async function ghPut(path: string, content: string, message: string, sha?: string): Promise<boolean> {
  const body: any = {
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
  }
  if (sha) body.sha = sha
  const res = await fetch(`${BASE}/repos/${repoPath()}/contents/${path}`, {
    method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  return res.ok
}

async function ghDelete(path: string, sha: string, message: string): Promise<boolean> {
  const res = await fetch(`${BASE}/repos/${repoPath()}/contents/${path}`, {
    method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha }),
  })
  return res.ok
}

// ─── GET : récupère une marque ─────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string; marqueSlug: string }> }) {
  const { siteId, marqueSlug } = await params
  const path = `platform/sites/${siteId}/codes_promo/${marqueSlug}.md`
  const file = await ghGet(path)
  if (!file) return NextResponse.json({ error: 'Marque introuvable' }, { status: 404 })
  const parsed = parseBrandFile(file.content)
  if (!parsed) return NextResponse.json({ error: 'Frontmatter invalide' }, { status: 500 })

  const brand: Brand = {
    ...(parsed.fm as any),
    content_md: parsed.body,
    sha: file.sha,
  }
  // Normalisation : assurer 12 mois d'historique (fusion avec ce qui existe)
  brand.historique_12_mois = normalizeHistory12Months(brand.historique_12_mois)
  // Assurer rating présent
  if (!brand.rating) brand.rating = { value: 0, count: 0 }
  // Tableaux toujours présents
  brand.codes = brand.codes || []
  brand.faq = brand.faq || []
  brand.related_brands = brand.related_brands || []

  // Domaine du site (pour preview)
  let domain = ''
  const configFile = await ghGet(`platform/sites/${siteId}/config.yaml`)
  if (configFile) {
    const m = configFile.content.match(/^[ ]*domain:\s*["']?(.+?)["']?\s*$/m)
    if (m) domain = m[1].trim().replace(/^["']|["']$/g, '').replace(/\/$/, '')
  }
  return NextResponse.json({ brand, site: { domain } })
}

// ─── PUT : sauvegarde une marque (override complet) ───────────────────────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ siteId: string; marqueSlug: string }> }) {
  const { siteId, marqueSlug } = await params
  const body = await req.json()

  if (!body.marque || !body.slug) {
    return NextResponse.json({ error: 'marque et slug requis' }, { status: 400 })
  }

  // Si le slug a changé, on supprime l'ancien fichier et on crée le nouveau
  const oldPath = `platform/sites/${siteId}/codes_promo/${marqueSlug}.md`
  const newPath = `platform/sites/${siteId}/codes_promo/${body.slug}.md`
  const slugChanged = body.slug !== marqueSlug

  // Reconstruire l'objet brand depuis le body (on filtre les clés autorisées)
  const brand: Brand = {
    marque: String(body.marque).trim(),
    slug: String(body.slug).trim(),
    categorie_marque: body.categorie_marque || '',
    url_marchand: body.url_marchand || '',
    url_affiliation: body.url_affiliation || '',
    logo_url: body.logo_url || '',
    description_marque: body.description_marque || '',
    avis_sophie: body.avis_sophie || '',
    conseil_sophie: body.conseil_sophie || '',
    rating: body.rating || { value: 0, count: 0 },
    codes: Array.isArray(body.codes) ? body.codes : [],
    faq: Array.isArray(body.faq) ? body.faq : [],
    historique_12_mois: normalizeHistory12Months(body.historique_12_mois),
    related_brands: Array.isArray(body.related_brands) ? body.related_brands : [],
    status: body.status === 'published' ? 'published' : 'draft',
    meta_title: body.meta_title || '',
    meta_description: body.meta_description || '',
    date_creation: body.date_creation || new Date().toISOString().slice(0, 10),
    date_maj: new Date().toISOString().slice(0, 10),
    content_md: body.content_md || '',
  }
  const raw = serializeBrand(brand)

  if (slugChanged) {
    const okCreate = await ghPut(newPath, raw, `HUB: Rename brand codes promo → ${brand.slug}`)
    if (!okCreate) return NextResponse.json({ error: 'Erreur création (slug changé)' }, { status: 500 })
    const oldFile = await ghGet(oldPath)
    if (oldFile) await ghDelete(oldPath, oldFile.sha, `HUB: Delete old brand slug ${marqueSlug}`)
  } else {
    const ok = await ghPut(newPath, raw, `HUB: Update brand codes promo — ${brand.marque}`, body.sha)
    if (!ok) return NextResponse.json({ error: 'Erreur sauvegarde' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, slug: brand.slug })
}

// ─── DELETE : supprime une marque ──────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ siteId: string; marqueSlug: string }> }) {
  const { siteId, marqueSlug } = await params
  const path = `platform/sites/${siteId}/codes_promo/${marqueSlug}.md`
  const file = await ghGet(path)
  if (!file) return NextResponse.json({ error: 'Marque introuvable' }, { status: 404 })
  const ok = await ghDelete(path, file.sha, `HUB: Delete brand codes promo ${marqueSlug}`)
  if (!ok) return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
