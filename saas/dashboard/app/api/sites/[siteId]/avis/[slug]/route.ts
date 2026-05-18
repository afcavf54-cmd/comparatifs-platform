import { NextRequest, NextResponse } from 'next/server'
import yaml from 'js-yaml'

// ─── Endpoint d'édition d'un avis individuel ──────────────────────────────
// GET    /api/sites/<siteId>/avis/<slug>  → frontmatter + body du .md
// PUT    /api/sites/<siteId>/avis/<slug>  → réécrit le .md complet
// DELETE /api/sites/<siteId>/avis/<slug>  → supprime le .md
//
// Le `slug` URL correspond au nom de fichier sans extension (`avis-legalplace`).
// Le frontmatter est lu/écrit en YAML pour préserver les structures imbriquées
// (tarifs[], faq[], h2_*{titre, contenu_html}) que des regex naïves casseraient.

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
  // Split sur les `---` ; on garde le reste (3e élément et au-delà) comme body
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
  // lineWidth élevé pour éviter que YAML wrap les longues chaînes (contenu_html)
  // noRefs pour ne pas générer d'ancres &x / *x
  const fmYaml = yaml.dump(fm, { lineWidth: 100000, noRefs: true, sortKeys: false })
  return `---\n${fmYaml}---\n${body || ''}`
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
  // On expose aussi le domaine du site pour permettre la preview
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
  // Le slug du fichier doit rester celui de l'URL — éviter qu'un mauvais
  // payload corrompe le mapping URL ↔ fichier
  avis.slug = slug
  // Date de mise à jour technique (utile au tracking + au signal SEO)
  avis.updated = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

  const path = `platform/sites/${siteId}/posts_avis/${slug}.md`
  const raw = serializeAvisMd(avis, typeof body === 'string' ? body : '')
  const ok = await ghPut(path, raw, `HUB: Update avis — ${avis.marque || slug}`, sha)
  if (!ok) return NextResponse.json({ error: 'Erreur sauvegarde GitHub' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ─── DELETE : supprime l'avis ─────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { siteId, slug } = await params
  const path = `platform/sites/${siteId}/posts_avis/${slug}.md`
  const file = await ghGet(path)
  if (!file) return NextResponse.json({ error: 'Avis introuvable' }, { status: 404 })
  const ok = await ghDelete(path, file.sha, `HUB: Delete avis ${slug}`)
  if (!ok) return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
