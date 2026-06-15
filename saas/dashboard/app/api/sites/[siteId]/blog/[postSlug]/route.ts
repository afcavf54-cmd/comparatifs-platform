import { NextRequest, NextResponse } from 'next/server'
import { parseFrontmatter, serializePost } from '../../../../../../lib/blog'

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

// ─── Helper : normaliser les catégories d'un body de requête ──────────────
// Accepte 3 cas (par ordre de priorité) :
//   1) body.categories : string[] (nouvelle UI multi-select)
//   2) body.categorie  : string   (legacy / fallback client)
//   3) rien            → null
// Retourne { categorie, categories } où categorie === categories[0] (invariant).
function normalizeCategories(body: any): { categorie: string; categories: string[] } | null {
  let cats: string[] = []
  if (Array.isArray(body.categories)) {
    cats = body.categories
      .map((c: any) => (typeof c === 'string' ? c.trim() : ''))
      .filter((c: string) => c.length > 0)
  }
  if (cats.length === 0 && typeof body.categorie === 'string' && body.categorie.trim()) {
    cats = [body.categorie.trim()]
  }
  if (cats.length === 0) return null
  const seen = new Set<string>()
  const unique = cats.filter(c => {
    if (seen.has(c)) return false
    seen.add(c)
    return true
  })
  return { categorie: unique[0], categories: unique }
}

// ─── GET : récupère un article ─────────────────────────────────────────────
// Backward-compat : si l'article legacy n'a que `categorie` (string) dans son
// frontmatter, on synthétise `categories: [categorie]` à la volée pour que le
// frontend reçoive toujours une liste exploitable par le multi-select.
export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string; postSlug: string }> }) {
  const { siteId, postSlug } = await params
  const path = `platform/sites/${siteId}/blog/posts/${postSlug}.md`
  const file = await ghGet(path)
  if (!file) return NextResponse.json({ error: 'Article introuvable' }, { status: 404 })
  const parsed = parseFrontmatter(file.content)
  if (!parsed) return NextResponse.json({ error: 'Article invalide (frontmatter)' }, { status: 500 })

  const fm: any = parsed.fm
  // Backward-compat : reconstruire categories[] depuis categorie si absent
  if (!Array.isArray(fm.categories) || fm.categories.length === 0) {
    fm.categories = fm.categorie ? [fm.categorie] : []
  }

  // Récupérer le domaine du site pour construire l'URL publique de prévisualisation
  let domain = ''
  const configFile = await ghGet(`platform/sites/${siteId}/config.yaml`)
  if (configFile) {
    const m = configFile.content.match(/^[ ]*domain:\s*["']?(.+?)["']?\s*$/m)
    if (m) domain = m[1].trim().replace(/^["']|["']$/g, '').replace(/\/$/, '')
  }
  return NextResponse.json({
    post: { ...fm, content_md: parsed.body, sha: file.sha },
    site: { domain },
  })
}

// ─── PUT : sauvegarde un article (override complet) ───────────────────────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ siteId: string; postSlug: string }> }) {
  const { siteId, postSlug } = await params
  const body = await req.json()
  const { title, slug, date, meta_title, meta_description, featured_image, status, content_md, related_posts, link_anchors, min_words, sha } = body
  if (!title || !slug) return NextResponse.json({ error: 'title et slug requis' }, { status: 400 })

  // Normalisation : accepte body.categories[] (nouvelle UI) ou body.categorie (legacy)
  const cats = normalizeCategories(body)
  if (!cats) {
    return NextResponse.json({ error: 'Au moins une catégorie est requise' }, { status: 400 })
  }

  // Si le slug change, on supprime l'ancien fichier et on crée le nouveau
  const oldPath = `platform/sites/${siteId}/blog/posts/${postSlug}.md`
  const newPath = `platform/sites/${siteId}/blog/posts/${slug}.md`
  const slugChanged = slug !== postSlug

  const post: any = {
    title, slug, date,
    // Invariant écrit dans le frontmatter : categorie (principale) === categories[0]
    categorie: cats.categorie,
    categories: cats.categories,
    updated: new Date().toISOString().replace(/\.\d+Z$/, ''),
    meta_title, meta_description, featured_image, status,
    related_posts: Array.isArray(related_posts) ? related_posts : undefined,
    link_anchors: Array.isArray(link_anchors) ? link_anchors : undefined,
    content_md: content_md || '',
  }
  if (min_words && Number(min_words) > 0) post.min_words = Number(min_words)
  const raw = serializePost(post as any)

  if (slugChanged) {
    // Créer le nouveau, supprimer l'ancien
    const okCreate = await ghPut(newPath, raw, `HUB: Rename blog post → ${slug}`)
    if (!okCreate) return NextResponse.json({ error: 'Erreur création (slug changé)' }, { status: 500 })
    const oldFile = await ghGet(oldPath)
    if (oldFile) await ghDelete(oldPath, oldFile.sha, `HUB: Delete old slug ${postSlug}`)
  } else {
    const ok = await ghPut(newPath, raw, `HUB: Update blog post — ${title}`, sha)
    if (!ok) return NextResponse.json({ error: 'Erreur sauvegarde' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, slug })
}

// ─── DELETE : supprime un article ──────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ siteId: string; postSlug: string }> }) {
  const { siteId, postSlug } = await params
  const path = `platform/sites/${siteId}/blog/posts/${postSlug}.md`
  const file = await ghGet(path)
  if (!file) return NextResponse.json({ error: 'Article introuvable' }, { status: 404 })
  const ok = await ghDelete(path, file.sha, `HUB: Delete blog post ${postSlug}`)
  if (!ok) return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
