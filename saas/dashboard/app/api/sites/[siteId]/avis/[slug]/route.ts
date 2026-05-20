import { NextRequest, NextResponse } from 'next/server'
import yaml from 'js-yaml'

// ─── Endpoint d'édition d'un avis individuel ──────────────────────────────
// GET    /api/sites/<siteId>/avis/<slug>  → frontmatter + body du .md
// PUT    /api/sites/<siteId>/avis/<slug>  → réécrit le .md complet
// DELETE /api/sites/<siteId>/avis/<slug>  → supprime le .md ET nettoie
//                                            schedule_processed.json
//
// Le `slug` URL correspond au nom de fichier sans extension (`avis-legalplace`).

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
  const body: any = { message, content: Buffer.from(content, 'utf-8').toString('base64') }
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

function parseAvisMd(raw: string): { fm: any; body: string } | null {
  if (!raw.startsWith('---')) return null
  const idx1 = raw.indexOf('---')
  const idx2 = raw.indexOf('---', idx1 + 3)
  if (idx1 < 0 || idx2 < 0) return null
  try {
    const fm = yaml.load(raw.slice(idx1 + 3, idx2)) as any
    const body = raw.slice(idx2 + 3).replace(/^\n/, '')
    return { fm: fm || {}, body }
  } catch (e) {
    return null
  }
}

function serializeAvisMd(fm: any, body: string): string {
  const fmYaml = yaml.dump(fm, { lineWidth: 100000, noRefs: true, sortKeys: false })
  return `---\n${fmYaml}---\n${body || ''}`
}

// ─── Cleanup tracker après suppression d'un avis ─────────────────────────
// Quand on supprime un .md, on doit aussi retirer les traces de cette marque
// des fichiers de tracking, sinon :
//   - schedule_processed.json garde la clé → le dashboard filtre la ligne sheet
//     (croit qu'elle est "dismissed") → impossible de la réimporter
//   - _drafts.json peut garder un prompt orphelin
async function cleanupTracker(siteId: string, slug: string): Promise<void> {
  // Le slug du fichier est typiquement "avis-legalplace" → marque slugifiée = "legalplace"
  const marqueSlug = slug.startsWith('avis-') ? slug.slice('avis-'.length) : slug

  // 1) schedule_processed.json : retirer toute clé qui commence par "<marqueSlug>|"
  //    (format de la clé côté Python : slugify(marque) + "|" + date_publication)
  const processedPath = `platform/sites/${siteId}/posts_avis/schedule_processed.json`
  const processedFile = await ghGet(processedPath)
  if (processedFile) {
    try {
      const arr = JSON.parse(processedFile.content)
      if (Array.isArray(arr)) {
        const filtered = arr.filter((k: any) => {
          const s = String(k)
          return !s.startsWith(`${marqueSlug}|`) && s !== marqueSlug
        })
        if (filtered.length !== arr.length) {
          await ghPut(
            processedPath,
            JSON.stringify(filtered, null, 2) + '\n',
            `HUB: Cleanup schedule_processed après suppression ${slug}`,
            processedFile.sha
          )
        }
      }
    } catch {
      // JSON invalide : on laisse en l'état pour éviter d'écraser
    }
  }

  // 2) _drafts.json : retirer l'entrée du slug supprimé (au cas où un prompt
  //    custom y traînait — pas critique mais évite des orphelins).
  const draftsPath = `platform/sites/${siteId}/posts_avis/_drafts.json`
  const draftsFile = await ghGet(draftsPath)
  if (draftsFile) {
    try {
      const obj = JSON.parse(draftsFile.content)
      if (obj && typeof obj === 'object' && !Array.isArray(obj) && obj[slug]) {
        delete obj[slug]
        await ghPut(
          draftsPath,
          JSON.stringify(obj, null, 2) + '\n',
          `HUB: Cleanup _drafts.json après suppression ${slug}`,
          draftsFile.sha
        )
      }
    } catch {
      // idem : on laisse
    }
  }
}

type Params = { params: Promise<{ siteId: string; slug: string }> }

// ─── GET : récupère un avis ───────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { siteId, slug } = await params
  const path = `platform/sites/${siteId}/posts_avis/${slug}.md`
  const file = await ghGet(path)
  if (!file) return NextResponse.json({ error: 'Avis introuvable' }, { status: 404 })
  const parsed = parseAvisMd(file.content)
  if (!parsed) return NextResponse.json({ error: 'Frontmatter invalide' }, { status: 500 })
  let domain = ''
  const cfg = await ghGet(`platform/sites/${siteId}/config.yaml`)
  if (cfg) {
    const m = cfg.content.match(/^[ ]*domain:\s*["']?(.+?)["']?\s*$/m)
    if (m) domain = m[1].trim().replace(/^["']|["']$/g, '').replace(/\/$/, '')
  }
  return NextResponse.json({ avis: parsed.fm, body: parsed.body, sha: file.sha, site: { domain } })
}

// ─── PUT : remplace l'avis ────────────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: Params) {
  const { siteId, slug } = await params
  const payload = await req.json()
  const { avis, body, sha } = payload
  if (!avis || typeof avis !== 'object') {
    return NextResponse.json({ error: 'Champ `avis` (frontmatter) requis' }, { status: 400 })
  }
  avis.slug = slug
  avis.updated = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

  const path = `platform/sites/${siteId}/posts_avis/${slug}.md`
  const raw = serializeAvisMd(avis, typeof body === 'string' ? body : '')
  const ok = await ghPut(path, raw, `HUB: Update avis — ${avis.marque || slug}`, sha)
  if (!ok) return NextResponse.json({ error: 'Erreur sauvegarde GitHub' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ─── DELETE : supprime l'avis + cleanup tracker ───────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { siteId, slug } = await params
  const path = `platform/sites/${siteId}/posts_avis/${slug}.md`
  const file = await ghGet(path)
  if (!file) return NextResponse.json({ error: 'Avis introuvable' }, { status: 404 })
  const ok = await ghDelete(path, file.sha, `HUB: Delete avis ${slug}`)
  if (!ok) return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 })
  // Nettoyage des fichiers de tracking pour permettre la réimportation
  // de la ligne sheet dans le dashboard. Erreurs ici non-bloquantes (best effort).
  try {
    await cleanupTracker(siteId, slug)
  } catch (e) {
    console.error('[avis DELETE cleanup]', e)
  }
  return NextResponse.json({ ok: true })
}
