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

// ─── Helper : normaliser les catégories d'un body de requête ──────────────
// Accepte 3 cas (par ordre de priorité) :
//   1) body.categories : string[] (nouvelle UI multi-select)
//   2) body.categorie  : string   (legacy / fallback client)
//   3) rien            → null (erreur 400 côté caller)
// Retourne { categorie, categories } où categorie === categories[0] (invariant).
function normalizeCategories(body: any): { categorie: string; categories: string[] } | null {
  let cats: string[] = []
  if (Array.isArray(body.categories)) {
    cats = body.categories
      .map((c: any) => (typeof c === 'string' ? c.trim() : ''))
      .filter((c: string) => c.length > 0)
  }
  // Fallback legacy : si pas de categories[] mais un categorie string
  if (cats.length === 0 && typeof body.categorie === 'string' && body.categorie.trim()) {
    cats = [body.categorie.trim()]
  }
  if (cats.length === 0) return null
  // Dédupliquer en conservant l'ordre (la 1ère occurrence reste principale)
  const seen = new Set<string>()
  const unique = cats.filter(c => {
    if (seen.has(c)) return false
    seen.add(c)
    return true
  })
  return { categorie: unique[0], categories: unique }
}

// ─── GET : liste tous les articles du blog ────────────────────────────────
// Optimisation : tous les .md sont fetchés EN PARALLÈLE (chunks de 30).
// Avant : 140 articles = 140 appels GitHub séquentiels ~ 20-40s.
// Après : 140 articles = ~5 chunks de 30 en parallèle ~ 2-5s.
// GitHub API authentifiée : 5000 req/h → 140 req/page = OK même avec
// plusieurs rafraîchissements.
//
// Backward-compat multi-catégories : pour les articles legacy qui n'ont que
// `categorie` (string) dans leur frontmatter, on synthétise `categories: [categorie]`
// à la volée pour que le frontend reçoive toujours une liste à itérer.
export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const dir = `platform/sites/${siteId}/blog/posts`
  const files = await ghList(dir)
  if (!files) return NextResponse.json({ posts: [] })

  const mdFiles = files.filter(f => f.name.endsWith('.md'))

  const CHUNK_SIZE = 30
  const results: any[] = []
  for (let i = 0; i < mdFiles.length; i += CHUNK_SIZE) {
    const chunk = mdFiles.slice(i, i + CHUNK_SIZE)
    const fetched = await Promise.all(chunk.map(async f => {
      const file = await ghGet(f.path)
      if (!file) return null
      const parsed = parseFrontmatter(file.content)
      if (!parsed) return null
      const fm: any = parsed.fm
      // Backward-compat : reconstruire categories[] depuis categorie si absent
      if (!Array.isArray(fm.categories) || fm.categories.length === 0) {
        fm.categories = fm.categorie ? [fm.categorie] : []
      }
      return {
        ...fm,
        filename: f.name,
        excerpt: (parsed.body || '').replace(/[#*_`>\-]/g, '').replace(/\s+/g, ' ').slice(0, 150),
      }
    }))
    for (const p of fetched) if (p) results.push(p)
  }

  results.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  return NextResponse.json({ posts: results })
}

// ─── POST : créer un nouveau post (squelette vide ou avec contenu IA) ─────
export async function POST(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const body = await req.json()
  const { title, content_md, meta_title, meta_description, featured_image, status, schedule_date, min_words, link_anchors } = body

  // Normalisation : accepte body.categories[] (nouvelle UI) ou body.categorie (legacy)
  const cats = normalizeCategories(body)
  if (!title) {
    return NextResponse.json({ error: 'title requis' }, { status: 400 })
  }
  if (!cats) {
    return NextResponse.json({ error: 'Au moins une catégorie est requise' }, { status: 400 })
  }

  // Lister les slugs existants pour éviter les collisions
  const dir = `platform/sites/${siteId}/blog/posts`
  const files = await ghList(dir) || []
  const existing = new Set(files.map(f => f.name.replace(/\.md$/, '')))

  const baseSlug = slugify(title)
  const slug = addRandomPrefix(baseSlug, existing)
  const now = new Date()
  const dateStr = (schedule_date || now.toISOString().replace(/\.\d+Z$/, '')).replace('Z', '')

  const post: any = {
    title,
    slug,
    date: dateStr,
    // Invariant écrit dans le frontmatter : categorie (principale) === categories[0]
    categorie: cats.categorie,
    categories: cats.categories,
    meta_title: meta_title || title,
    meta_description: meta_description || '',
    featured_image: featured_image || '',
    status: status || (schedule_date ? 'scheduled' : 'published'),
    content_md: content_md || `# ${title}\n\n_À rédiger…_\n`,
  }
  if (min_words && Number(min_words) > 0) post.min_words = Number(min_words)
  if (Array.isArray(link_anchors) && link_anchors.length > 0) post.link_anchors = link_anchors
  const raw = serializePost(post as any)
  const path = `${dir}/${slug}.md`
  const ok = await ghPut(path, raw, `HUB: New blog post — ${title}`)
  if (!ok) return NextResponse.json({ error: 'Erreur GitHub (création)' }, { status: 500 })
  return NextResponse.json({ ok: true, slug, post })
}
