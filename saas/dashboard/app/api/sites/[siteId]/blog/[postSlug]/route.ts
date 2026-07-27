import { NextRequest, NextResponse } from 'next/server'
import { parseFrontmatter, serializePost } from '../../../../../../lib/blog'

const BASE = 'https://api.github.com'
const headers = {
  'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}
const repoPath = () => `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`

// ─── Sanitize d'un slug pour usage en chemin de fichier ────────────────────
// PROBLÈME résolu : avant ce sanitize, si l'utilisateur tapait un slug avec
// un slash final (ex. "mon-article/"), le code faisait
//   `${slug}.md` = "mon-article/.md"
// → GitHub interprétait le `/` comme un séparateur et créait un SOUS-DOSSIER
// `mon-article/` contenant un fichier `.md` (juste l'extension, sans nom).
// L'article devenait introuvable dans le dashboard et le site.
//
// Règles de normalisation :
//   1. Lowercase
//   2. Strip ".." (path traversal)
//   3. Convertir / et \ en tirets
//   4. Strip tout caractère non [a-z0-9-]
//   5. Collapse multiples tirets en un seul
//   6. Strip tirets début/fin
//
// Exemples :
//   "mon-article/"             → "mon-article"
//   "mon article/"             → "mon-article"
//   "FOO/BAR"                  → "foo-bar"
//   "../../etc/passwd"         → "etc-passwd"
//   "https://www.x.com/path"   → "https-www-x-com-path"  (toujours casé mais sans dossier)
//   "____"                     → ""        (rejeté car vide)
function sanitizeSlug(rawSlug: any): string {
  if (typeof rawSlug !== 'string') return ''
  return rawSlug.trim().toLowerCase()
    .replace(/\.\.+/g, '')           // strip ".." (path traversal)
    .replace(/[\/\\]+/g, '-')        // convertir slashes/backslashes en tirets
    .replace(/[^a-z0-9-]+/g, '-')   // strip caractères non-slug-friendly
    .replace(/-+/g, '-')             // collapse multiples tirets
    .replace(/^-+|-+$/g, '')         // strip tirets début/fin
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
  const { title, slug: rawSlug, date, meta_title, meta_description, featured_image, status, content_md, related_posts, link_anchors, min_words, sha } = body
  if (!title || !rawSlug) return NextResponse.json({ error: 'title et slug requis' }, { status: 400 })

  // ── Sanitize le slug AVANT toute construction de path. ────────────────
  // Critique : sans ce sanitize, un slash final dans le slug crée un sous-
  // dossier et perd l'article. cf. la fonction sanitizeSlug ci-dessus.
  const slug = sanitizeSlug(rawSlug)
  if (!slug || slug.length < 2) {
    return NextResponse.json({
      error: `Slug invalide après normalisation : "${rawSlug}" → "${slug}". Utilise uniquement des lettres minuscules, chiffres et tirets (ex: "mon-article").`,
    }, { status: 400 })
  }

  // Normalisation : accepte body.categories[] (nouvelle UI) ou body.categorie (legacy)
  const cats = normalizeCategories(body)
  if (!cats) {
    return NextResponse.json({ error: 'Au moins une catégorie est requise' }, { status: 400 })
  }

  // Si le slug change, on supprime l'ancien fichier et on crée le nouveau
  const oldPath = `platform/sites/${siteId}/blog/posts/${postSlug}.md`
  const newPath = `platform/sites/${siteId}/blog/posts/${slug}.md`
  const slugChanged = slug !== postSlug

  // ── Auto-update la date au passage draft → published ──────────────────
  // Bug fix 22 juin 2026 : un article créé en brouillon le 16 juin et
  // publié le 22 gardait la date 16 juin dans son frontmatter → tri par
  // date desc → il se retrouvait en page 2 ou 3 du blog, invisible sur la
  // page 1. Désormais, au passage draft → published (ou nouvel article
  // créé directement publié), la date du frontmatter est mise à jour à
  // l'instant T pour que l'article apparaisse en haut du tri.
  // On garde la date du body si l'article était déjà publié (édition d'un
  // article existant : pas de raison de toucher à sa date d'origine).
  let finalDate = date
  if (status === 'published') {
    const existing = await ghGet(oldPath)
    if (existing) {
      const m = existing.content.match(/^status:\s*['"]?([^'"\n\r]+?)['"]?\s*$/m)
      const oldStatus = m ? m[1].trim() : ''
      if (oldStatus === 'draft' || !oldStatus) {
        const now = new Date()
        // Format ISO compatible avec le parsing Python du blog_engine :
        // "YYYY-MM-DD HH:MM:SS+02:00" (timezone France).
        finalDate = now.toISOString().slice(0, 19).replace('T', ' ') + '+02:00'
      }
    } else {
      // Pas de fichier existant = nouvel article publié directement.
      // Force la date à aujourd'hui même si le body envoie autre chose.
      const now = new Date()
      finalDate = now.toISOString().slice(0, 19).replace('T', ' ') + '+02:00'
    }
  }

  // Si le slug change et que le nouveau path existe déjà → conflit.
  // Sans ce check, on écraserait silencieusement un article existant.
  if (slugChanged) {
    const existing = await ghGet(newPath)
    if (existing) {
      return NextResponse.json({
        error: `Un article existe déjà avec le slug "${slug}". Choisis un autre slug.`,
      }, { status: 409 })
    }
  }

  const post: any = {
    title, slug, date: finalDate,
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

// ─── Helper : retire une entrée de posts-index.json (évite les fantômes) ────
// La liste du dashboard est lue depuis posts-index.json. Si on supprime un .md
// sans mettre l'index à jour, l'article reste affiché → re-suppression → 404.
// Ce helper retire l'entrée du slug et réécrit l'index. No-op si index absent
// ou entrée déjà absente.
async function removeFromBlogIndex(siteId: string, slug: string): Promise<void> {
  const indexPath = `platform/sites/${siteId}/blog/posts-index.json`
  const file = await ghGet(indexPath)
  if (!file) return
  let data: any
  try { data = JSON.parse(file.content) } catch { return }
  if (!Array.isArray(data?.posts)) return
  const before = data.posts.length
  data.posts = data.posts.filter((p: any) => p?.slug !== slug)
  if (data.posts.length === before) return   // rien à retirer
  if (typeof data.count === 'number') data.count = data.posts.length
  data.updated_at = new Date().toISOString()
  await ghPut(indexPath, JSON.stringify(data, null, 2), `HUB: Sync index (retrait ${slug})`, file.sha)
}

// ─── DELETE : supprime un article (idempotent + resync index) ───────────────
// ─── Blacklist : empêche le cron de republier un article supprimé ───────────
// La sheet reste la source du programmé ; supprimer un .md ne l'en retire pas,
// donc le cron le republierait. On ajoute le TITRE de l'article supprimé à
// blog/schedule_blacklist.json ; le cron ignore les titres qui y figurent.
function extractMdTitle(md: string): string {
  if (!md.startsWith('---')) return ''
  const end = md.indexOf('---', 3)
  if (end < 0) return ''
  for (const line of md.slice(3, end).split('\n')) {
    const s = line.trim()
    if (s.startsWith('title:')) {
      let t = s.slice('title:'.length).trim()
      if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) t = t.slice(1, -1)
      return t
    }
  }
  return ''
}
function normTitle(t: string): string {
  return (t || '').toLowerCase().split(/\s+/).filter(Boolean).join(' ')
}
async function titleFromIndex(siteId: string, slug: string): Promise<string> {
  const f = await ghGet(`platform/sites/${siteId}/blog/posts-index.json`)
  if (!f) return ''
  try {
    const data = JSON.parse(f.content)
    const post = (data?.posts || []).find((p: any) => p?.slug === slug)
    return post?.title || ''
  } catch { return '' }
}
async function addToBlacklist(siteId: string, title: string): Promise<void> {
  const norm = normTitle(title)
  if (!norm) return
  const path = `platform/sites/${siteId}/blog/schedule_blacklist.json`
  const f = await ghGet(path)
  let list: string[] = []
  if (f) { try { list = JSON.parse(f.content) } catch { list = [] } }
  const set = new Set(list.map(normTitle))
  if (set.has(norm)) return
  set.add(norm)
  const merged = Array.from(set).sort()
  await ghPut(path, JSON.stringify(merged, null, 2), `HUB: Blacklist blog "${title.slice(0, 40)}"`, f?.sha)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ siteId: string; postSlug: string }> }) {
  const { siteId, postSlug } = await params
  const path = `platform/sites/${siteId}/blog/posts/${postSlug}.md`

  // 1) Cherche le .md — avec diagnostic auth/rate-limit (repo public : un token
  // manquant/invalide donne 401/403, pas un « fichier absent »).
  const getRes = await fetch(`${BASE}/repos/${repoPath()}/contents/${path}`, { headers, cache: 'no-store' })
  let mdSha: string | null = null
  let mdTitle = ''
  if (getRes.ok) {
    const data = await getRes.json()
    if (!Array.isArray(data)) {
      mdSha = data.sha
      try { mdTitle = extractMdTitle(Buffer.from(data.content || '', 'base64').toString('utf-8')) } catch { /* noop */ }
    }
  } else if (getRes.status !== 404) {
    const rlRemaining = getRes.headers.get('x-ratelimit-remaining')
    const hint =
      getRes.status === 401 ? 'token GitHub invalide ou expiré (Vercel → env GITHUB_TOKEN)' :
      getRes.status === 403 ? (rlRemaining === '0'
          ? 'limite de requêtes GitHub atteinte — token manquant/invalide (60 req/h en anonyme au lieu de 5000). Corrige GITHUB_TOKEN.'
          : 'accès refusé — token sans droit de lecture/écriture') :
      `réponse GitHub inattendue (${getRes.status})`
    return NextResponse.json({ error: `Lecture impossible — ${hint}` }, { status: 502 })
  }
  // getRes.status === 404 (mdSha reste null) => article « fantôme » : le .md
  // n'existe plus, mais il est encore dans l'index. On nettoie juste l'index.

  // 2) Supprime le .md s'il existe encore
  if (mdSha) {
    const res = await fetch(`${BASE}/repos/${repoPath()}/contents/${path}`, {
      method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `HUB: Delete blog post ${postSlug}`, sha: mdSha }),
    })
    if (!res.ok) {
      let detail = ''
      try { const j = await res.json(); detail = j?.message || '' } catch { /* noop */ }
      const hint =
        res.status === 401 ? 'token GitHub invalide ou expiré (Vercel → env GITHUB_TOKEN)' :
        res.status === 403 ? "token sans droit d'écriture (scope repo / Contents: Read and write) ou rate-limit" :
        res.status === 409 ? 'conflit de version (SHA) — recharge la page et réessaie' :
        res.status === 422 ? 'branche protégée : les commits directs sont refusés' : ''
      return NextResponse.json({
        error: `Erreur suppression — GitHub ${res.status}${hint ? ` (${hint})` : ''}${detail ? ` : ${detail}` : ''}`,
      }, { status: 500 })
    }
  }

  // 3) Récupère le titre pour le blacklist AVANT de retirer l'entrée d'index.
  let titleForBlacklist = mdTitle
  if (!titleForBlacklist) {
    try { titleForBlacklist = await titleFromIndex(siteId, postSlug) } catch { /* noop */ }
  }

  // 4) Resync l'index (retire l'entrée) — que le .md ait existé ou non.
  //    C'est ce qui évite que l'article « fantôme » reste affiché.
  try { await removeFromBlogIndex(siteId, postSlug) } catch { /* best-effort */ }

  // 5) Blacklist le titre : le cron ne republiera plus cet article depuis la
  //    Google Sheet (sinon il revenait en brouillon avec une date passée).
  try { if (titleForBlacklist) await addToBlacklist(siteId, titleForBlacklist) } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, ghost: mdSha === null })
}
