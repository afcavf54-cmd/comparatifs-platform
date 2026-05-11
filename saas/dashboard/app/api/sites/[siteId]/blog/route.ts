import { NextRequest, NextResponse } from 'next/server'
import { parseFrontmatter, serializePost, slugify, addRandomPrefix } from '../../../../../lib/blog'

const BASE = 'https://api.github.com'
const headers = {
  'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

function repoPath() {
  return `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`
}

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

// ─── GET : liste tous les articles du blog ────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const dir = `platform/sites/${siteId}/blog/posts`
  const files = await ghList(dir)
  if (!files) return NextResponse.json({ posts: [] })

  const posts: any[] = []
  for (const f of files) {
    if (!f.name.endsWith('.md')) continue
    const file = await ghGet(f.path)
    if (!file) continue
    const parsed = parseFrontmatter(file.content)
    if (!parsed) continue
    posts.push({
      ...parsed.fm,
      filename: f.name,
      excerpt: (parsed.body || '').replace(/[#*_`>\-]/g, '').replace(/\s+/g, ' ').slice(0, 150),
    })
  }
  posts.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  return NextResponse.json({ posts })
}

// ─── POST : créer un nouveau post (squelette vide ou avec contenu IA) ─────
export async function POST(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const body = await req.json()
  const { title, categorie, content_md, meta_title, meta_description, featured_image, status, schedule_date } = body
  if (!title || !categorie) {
    return NextResponse.json({ error: 'title et categorie requis' }, { status: 400 })
  }

  // Lister les slugs existants pour éviter les collisions
  const dir = `platform/sites/${siteId}/blog/posts`
  const files = await ghList(dir) || []
  const existing = new Set(files.map(f => f.name.replace(/\.md$/, '')))

  const baseSlug = slugify(title)
  const slug = addRandomPrefix(baseSlug, existing)
  const now = new Date()
  const dateStr = (schedule_date || now.toISOString().replace(/\.\d+Z$/, '')).replace('Z', '')

  const post = {
    title,
    slug,
    date: dateStr,
    categorie,
    meta_title: meta_title || title,
    meta_description: meta_description || '',
    featured_image: featured_image || '',
    status: status || (schedule_date ? 'scheduled' : 'published'),
    content_md: content_md || `# ${title}\n\n_À rédiger…_\n`,
  }
  const raw = serializePost(post as any)
  const path = `${dir}/${slug}.md`
  const ok = await ghPut(path, raw, `HUB: New blog post — ${title}`)
  if (!ok) return NextResponse.json({ error: 'Erreur GitHub (création)' }, { status: 500 })
  return NextResponse.json({ ok: true, slug, post })
}
