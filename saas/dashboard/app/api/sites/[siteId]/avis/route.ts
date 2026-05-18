import { NextRequest, NextResponse } from 'next/server'

// API pour lister les avis déjà publiés (= les .md dans posts_avis/ du site).
// Renvoie un tableau simple [{slug, marque, categorie, sentiment, note, date,
// note_trustpilot, nb_avis_trustpilot, meta_title, meta_description}].
// Lit chaque .md via GitHub Contents API et parse son frontmatter YAML.

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

async function ghGet(path: string): Promise<string | null> {
  const res = await fetch(`${BASE}/repos/${repoPath()}/contents/${path}`, { headers, cache: 'no-store' })
  if (!res.ok) return null
  const data = await res.json()
  if (Array.isArray(data)) return null
  return Buffer.from(data.content, 'base64').toString('utf-8')
}

// Parser frontmatter YAML minimal — pour l'instant on extrait juste les
// champs scalaires (string/number) dont on a besoin. Pas de listes ni d'objets
// imbriqués, qui sont lus côté Python au build.
function extractField(yaml: string, key: string): string {
  const re = new RegExp(`^${key}:\\s*['"]?(.+?)['"]?\\s*$`, 'm')
  const m = yaml.match(re)
  return m ? m[1].trim() : ''
}

function extractNumber(yaml: string, key: string): number | null {
  const v = extractField(yaml, key)
  if (!v) return null
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? null : n
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const dir = `platform/sites/${siteId}/posts_avis`
  const files = await ghList(dir)
  if (!files) return NextResponse.json({ avis: [] })

  const avis: any[] = []
  for (const f of files) {
    if (f.type !== 'file' || !f.name.endsWith('.md')) continue
    const content = await ghGet(`${dir}/${f.name}`)
    if (!content) continue
    // Récupère le frontmatter entre les --- ---
    const fmMatch = content.match(/^---\n([\s\S]+?)\n---/)
    const yaml = fmMatch ? fmMatch[1] : ''
    const slug = extractField(yaml, 'slug') || f.name.replace(/\.md$/, '')
    avis.push({
      slug,
      marque: extractField(yaml, 'marque'),
      categorie: extractField(yaml, 'categorie'),
      sentiment: extractField(yaml, 'sentiment') || 'positif',
      note: extractNumber(yaml, 'note'),
      note_trustpilot: extractNumber(yaml, 'note_trustpilot'),
      nb_avis_trustpilot: extractNumber(yaml, 'nb_avis_trustpilot'),
      date: extractField(yaml, 'date'),
      meta_title: extractField(yaml, 'meta_title'),
      meta_description: extractField(yaml, 'meta_description'),
      h1: extractField(yaml, 'h1'),
      cta_url: extractField(yaml, 'cta_url'),
    })
  }

  // Tri par date décroissante
  avis.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  return NextResponse.json({ avis })
}
