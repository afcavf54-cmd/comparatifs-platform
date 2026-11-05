import { NextRequest, NextResponse } from 'next/server'
import { getFile, putFile, triggerWorkflow } from '../../../../../lib/github'

// ────────────────────────────────────────────────────────────────────────
// Landing pages sur-mesure (ads) — éditables : slug, seo_title, meta_description, active.
// Le template de chaque page (key) est développé dans le repo ; ici on n'édite
// que les métadonnées, stockées dans platform/sites/<site>/landings.json.
// ────────────────────────────────────────────────────────────────────────

type Landing = { key: string; slug: string; seo_title?: string; meta_description?: string; active?: boolean }

const filePath = (siteId: string) => `platform/sites/${siteId}/landings.json`

const RESERVED = new Set([
  'index', 'sitemap', 'robots', '404', 'blog', 'avis', 'contact',
  'mentions-legales', 'politique-confidentialite', 'plan-du-site',
  'nos-comparateurs', 'comparatifs-scpi', 'avis-scpi', 'a-propos',
  'auteur', 'simulation-credit', 'simulation-rachat-de-credit',
])

function slugify(s: string): string {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const f = await getFile(filePath(siteId))
  if (!f) return NextResponse.json({ landings: [], exists: false })
  try {
    const data = JSON.parse(f.content)
    return NextResponse.json({ landings: Array.isArray(data.landings) ? data.landings : [], exists: true })
  } catch {
    return NextResponse.json({ error: 'landings.json illisible', landings: [], exists: true }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const body = await req.json().catch(() => ({}))
  const incoming: Landing[] = Array.isArray(body.landings) ? body.landings : []

  // On repart du fichier existant pour préserver les entrées/clés et ne modifier
  // que les champs éditables (le template `key` n'est jamais modifiable ici).
  const existingFile = await getFile(filePath(siteId))
  if (!existingFile) return NextResponse.json({ error: 'Aucune landing pour ce site (landings.json absent).' }, { status: 404 })
  let doc: any
  try { doc = JSON.parse(existingFile.content) } catch { return NextResponse.json({ error: 'landings.json illisible' }, { status: 500 }) }
  const current: Landing[] = Array.isArray(doc.landings) ? doc.landings : []

  const byKey = new Map(current.map(l => [l.key, l]))
  const seenSlugs = new Set<string>()
  for (const edit of incoming) {
    const base = byKey.get(edit.key)
    if (!base) continue // pas de création de template depuis le dashboard
    const slug = slugify(edit.slug || base.slug)
    if (!slug) return NextResponse.json({ error: `Slug vide pour « ${edit.key} ».` }, { status: 400 })
    if (RESERVED.has(slug)) return NextResponse.json({ error: `Slug réservé : « ${slug} ».` }, { status: 400 })
    if (seenSlugs.has(slug)) return NextResponse.json({ error: `Slug en double : « ${slug} ».` }, { status: 400 })
    seenSlugs.add(slug)
    base.slug = slug
    base.seo_title = String(edit.seo_title ?? base.seo_title ?? '').slice(0, 180)
    base.meta_description = String(edit.meta_description ?? base.meta_description ?? '').slice(0, 320)
    base.active = edit.active !== false
  }

  const ok = await putFile(filePath(siteId), JSON.stringify(doc, null, 2) + '\n',
    `landings(${siteId}): mise à jour slug/SEO depuis le dashboard`)
  if (!ok) return NextResponse.json({ error: 'Échec de l’enregistrement (GitHub).' }, { status: 502 })

  const deployed = await triggerWorkflow('generate-site.yml', { site: siteId })
  return NextResponse.json({ ok: true, landings: current, deployed })
}
