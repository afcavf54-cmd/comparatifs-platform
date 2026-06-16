import { NextRequest, NextResponse } from 'next/server'
import { getFile, listDir } from '../../../../../lib/github'

/**
 * GET /api/sites/[siteId]/blog
 *
 * Retourne la liste des posts du blog pour un site, avec leurs metadata
 * (title, slug, date, status, categorie, excerpt, featured_image).
 *
 * STRATÉGIE : lit en priorité le fichier `posts-index.json` pré-calculé
 * (1 requête GitHub, instantané même à 5000 articles). Si l'index n'existe
 * pas encore (site legacy pas encore rebuild après le déploiement du
 * système d'index), fallback sur la méthode historique : list le dossier
 * posts/ + lire chaque .md.
 *
 * Pourquoi : avant cet index, à 122 articles le chargement prenait 5-15s
 * avec des 403/429 GitHub. À 1000+ articles, le dashboard devenait
 * inutilisable. Avec l'index, c'est 1 seule requête HTTP, peu importe la
 * volumétrie.
 */

interface Post {
  title: string
  slug: string
  date: string
  status?: string
  categorie?: string
  meta_description?: string
  excerpt?: string
  featured_image?: string
}

// ─── Helper : extraire un champ du frontmatter YAML d'un .md ─────────────
function extractFrontmatterField(fm: string, field: string): string | undefined {
  const regex = new RegExp(`^\\s*${field}\\s*:\\s*(.+?)\\s*$`, 'm')
  const m = fm.match(regex)
  if (!m) return undefined
  let v = m[1].trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1)
    v = v[0] === "'" ? v.replace(/''/g, "'") : v.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return v
}

// Lecture fallback : scan posts/*.md (méthode historique, lente, 1 call par .md)
async function loadPostsFromMdFiles(siteId: string): Promise<Post[]> {
  const dir = await listDir(`platform/sites/${siteId}/blog/posts`)
  const mdFiles = dir.filter((f: any) => f.name?.endsWith('.md'))

  // Limite à 200 pour éviter saturation rate limit. Au-delà → utiliser l'index.
  const limit = Math.min(mdFiles.length, 200)

  const posts: Post[] = []
  // Lecture par paquets de 8 pour ne pas saturer GitHub abuse detection
  const BATCH_SIZE = 8
  for (let i = 0; i < limit; i += BATCH_SIZE) {
    const batch = mdFiles.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(batch.map(async (f: any) => {
      try {
        const fileResp = await getFile(`platform/sites/${siteId}/blog/posts/${f.name}`)
        if (!fileResp) return null
        const content = fileResp.content
        if (!content.startsWith('---')) return null
        const end = content.indexOf('---', 3)
        if (end < 0) return null
        const fm = content.slice(3, end)
        const slug = f.name.replace(/\.md$/, '')
        const title = extractFrontmatterField(fm, 'title') || slug
        const date = extractFrontmatterField(fm, 'date') || ''
        const status = extractFrontmatterField(fm, 'status')
        const categorie = extractFrontmatterField(fm, 'categorie') || extractFrontmatterField(fm, 'category')
        const meta_description = extractFrontmatterField(fm, 'meta_description')
        const featured_image = extractFrontmatterField(fm, 'featured_image')
        const excerpt = meta_description
          ? meta_description.length > 250 ? meta_description.slice(0, 247) + '...' : meta_description
          : ''
        return { title, slug, date, status, categorie, meta_description, excerpt, featured_image } as Post
      } catch {
        return null
      }
    }))
    posts.push(...batchResults.filter((p): p is Post => p !== null))
  }
  return posts
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params

  // ── 1) Tentative : lecture de l'index pré-calculé (rapide, 1 requête) ──
  try {
    const indexFile = await getFile(`platform/sites/${siteId}/blog/posts-index.json`)
    if (indexFile && indexFile.content) {
      const data = JSON.parse(indexFile.content)
      if (Array.isArray(data?.posts)) {
        // Tri par date desc (le plus récent en premier)
        const posts = (data.posts as Post[]).slice().sort((a, b) => {
          const da = a.date || ''
          const db = b.date || ''
          return db.localeCompare(da)
        })
        return NextResponse.json({
          posts,
          source: 'index',
          updated_at: data.updated_at,
          count: posts.length,
        }, {
          headers: {
            // Cache 60s côté Vercel pour bouchonner les refresh fréquents.
            'Cache-Control': 's-maxage=60, stale-while-revalidate=120',
          },
        })
      }
    }
  } catch (e: any) {
    console.error(`[blog list] erreur lecture posts-index.json :`, e?.message || e)
  }

  // ── 2) Fallback : scan des .md individuels (lent, ne marche que < 200 .md) ──
  try {
    const posts = await loadPostsFromMdFiles(siteId)
    posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return NextResponse.json({
      posts,
      source: 'md_scan',
      count: posts.length,
      hint: "Index posts-index.json absent — relance un build du site pour le générer (chargement futur plus rapide)",
    })
  } catch (e: any) {
    return NextResponse.json({
      error: `Impossible de lister les articles : ${e?.message || 'erreur inconnue'}`,
      posts: [],
    }, { status: 500 })
  }
}
