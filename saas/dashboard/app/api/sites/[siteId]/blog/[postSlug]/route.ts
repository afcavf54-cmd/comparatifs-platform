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

// ─── GET : récupère un article ─────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string; postSlug: string }> }) {
  const { siteId, postSlug } = await params
  const path = `platform/sites/${siteId}/blog/posts/${postSlug}.md`
  const file = await ghGet(path)
  if (!file) return NextResponse.json({ error: 'Article introuvable' }, { status: 404 })
  const parsed = parseFrontmatter(file.content)
  if (!parsed) return NextResponse.json({ error: 'Article invalide (frontmatter)' }, { status: 500 })
  return NextResponse.json({
    post: { ...parsed.fm, content_md: parsed.body, sha: file.sha },
  })
}

// ─── PUT : sauvegarde un article (override complet) ───────────────────────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ siteId: string; postSlug: string }> }) {
  const { siteId, postSlug } = await params
  const body = await req.json()
  const { title, slug, date, categorie, meta_title, meta_description, featured_image, status, content_md, related_posts, link_anchors, min_words, sha } = body
  if (!title || !slug) return NextResponse.json({ error: 'title et slug requis' }, { status: 400 })

  // Si le slug change, on supprime l'ancien fichier et on crée le nouveau
  const oldPath = `platform/sites/${siteId}/blog/posts/${postSlug}.md`
  const newPath = `platform/sites/${siteId}/blog/posts/${slug}.md`
  const slugChanged = slug !== postSlug

  const post: any = {
    title, slug, date, categorie,
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
