import { NextRequest, NextResponse } from 'next/server'
import { parseBrandFile, serializeBrand, slugifyMarque, emptyBrand, Brand } from '../../../../../lib/codes-promo'

const BASE = 'https://api.github.com'
const headers = {
  'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}
const repoPath = () => `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`

async function ghList(path: string): Promise<any[] | null> {
  const res = await fetch(`${BASE}/repos/${repoPath()}/contents/${path}`, { headers, cache: 'no-store' })
  if (!res.ok) return null
  const data = await res.json()
  return Array.isArray(data) ? data : null
}

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

// ─── GET : liste toutes les marques codes promo du site ───────────────────
// Optimisation : tous les .md sont fetchés EN PARALLÈLE (chunks de 30) comme
// pour le blog. La liste retournée contient le frontmatter + un résumé pour
// l'affichage (n_codes, n_offres, best_offer_label).
export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const dir = `platform/sites/${siteId}/codes_promo`
  const files = await ghList(dir)
  if (!files) return NextResponse.json({ brands: [] })

  const mdFiles = files.filter(f => f.name.endsWith('.md'))

  const CHUNK_SIZE = 30
  const results: any[] = []
  for (let i = 0; i < mdFiles.length; i += CHUNK_SIZE) {
    const chunk = mdFiles.slice(i, i + CHUNK_SIZE)
    const fetched = await Promise.all(chunk.map(async f => {
      const file = await ghGet(f.path)
      if (!file) return null
      const parsed = parseBrandFile(file.content)
      if (!parsed) return null
      const fm: any = parsed.fm
      // Calculs dérivés pour la liste
      const codes = Array.isArray(fm.codes) ? fm.codes : []
      const codes_actifs = codes.filter((c: any) => !c.expired)
      const n_codes = codes_actifs.filter((c: any) => c.type === 'code').length
      const n_offres = codes_actifs.filter((c: any) => c.type === 'offer').length
      const n_total = n_codes + n_offres
      // best_offer_label : meilleure_remise prioritaire, sinon max % parmi codes actifs
      let best_offer_label = ''
      const best = codes_actifs.find((c: any) => c.meilleure_remise)
        || [...codes_actifs].sort((a: any, b: any) => (b.valeur || 0) - (a.valeur || 0))[0]
      if (best) {
        const sous = (best.sous_type || '').toLowerCase()
        if (sous.includes('livraison')) best_offer_label = 'Livraison offerte'
        else if (best.valeur && best.unite === '%') best_offer_label = `Jusqu'à -${Math.round(best.valeur)}%`
        else if (best.valeur && best.unite === '€') best_offer_label = `${Math.round(best.valeur)}€ offerts`
        else best_offer_label = best.sous_type || ''
      }
      return {
        marque: fm.marque,
        slug: fm.slug || f.name.replace(/\.md$/, ''),
        categorie_marque: fm.categorie_marque || '',
        logo_url: fm.logo_url || '',
        status: fm.status || 'draft',
        date_maj: fm.date_maj || fm.date_creation || '',
        n_codes, n_offres, n_total,
        best_offer_label,
        filename: f.name,
      }
    }))
    for (const b of fetched) if (b) results.push(b)
  }

  // Tri : drafts en haut (à compléter), puis published triés par date_maj desc
  results.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'draft' ? -1 : 1
    return String(b.date_maj || '').localeCompare(String(a.date_maj || ''))
  })
  return NextResponse.json({ brands: results })
}

// ─── POST : crée une nouvelle marque (squelette vide) ─────────────────────
// Body : { marque: string, url_affiliation?: string }
// Le slug est dérivé du nom. Le reste se remplit dans le dashboard.
export async function POST(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const body = await req.json()
  const marque = String(body.marque || '').trim()
  if (!marque) return NextResponse.json({ error: 'marque requise' }, { status: 400 })

  // Lister les slugs existants pour éviter la collision
  const dir = `platform/sites/${siteId}/codes_promo`
  const files = await ghList(dir) || []
  const existing = new Set(files.map((f: any) => f.name.replace(/\.md$/, '')))

  let slug = slugifyMarque(marque)
  if (existing.has(slug)) {
    return NextResponse.json({ error: `Une marque avec le slug "${slug}" existe déjà` }, { status: 409 })
  }

  const brand: Brand = emptyBrand(marque, slug)
  if (typeof body.url_affiliation === 'string' && body.url_affiliation.trim()) {
    brand.url_affiliation = body.url_affiliation.trim()
  }
  if (typeof body.categorie_marque === 'string' && body.categorie_marque.trim()) {
    brand.categorie_marque = body.categorie_marque.trim()
  }
  if (typeof body.url_marchand === 'string' && body.url_marchand.trim()) {
    brand.url_marchand = body.url_marchand.trim()
  }
  if (typeof body.logo_url === 'string' && body.logo_url.trim()) {
    brand.logo_url = body.logo_url.trim()
  }

  const raw = serializeBrand(brand)
  const path = `${dir}/${slug}.md`
  const ok = await ghPut(path, raw, `HUB: New brand codes promo — ${marque}`)
  if (!ok) return NextResponse.json({ error: 'Erreur GitHub (création)' }, { status: 500 })
  return NextResponse.json({ ok: true, slug, brand })
}
