/**
 * blog.ts — Helpers pour parser/sérialiser les fichiers blog (.md avec frontmatter YAML).
 *
 * Format attendu :
 *   ---
 *   title: "Mon titre"
 *   slug: "1234-mon-titre"
 *   date: "2026-05-15T09:00:00"
 *   categorie: "Paie"
 *   meta_title: "..."
 *   meta_description: "..."
 *   featured_image: "/blog/.../cover.jpg"
 *   status: published
 *   related_posts:
 *   - "slug-1"
 *   - "slug-2"
 *   ---
 *
 *   # Contenu markdown
 */

export interface BlogPostFrontmatter {
  title: string
  slug: string
  date: string                        // ISO datetime
  updated?: string
  categorie?: string
  meta_title?: string
  meta_description?: string
  featured_image?: string
  status?: 'published' | 'scheduled' | 'draft'
  related_posts?: string[]
}

export interface BlogPost extends BlogPostFrontmatter {
  content_md: string
  filepath?: string
}

// ─── Parser ────────────────────────────────────────────────────────────────

export function parseFrontmatter(raw: string): { fm: Record<string, any>; body: string } | null {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!m) return null
  const fmText = m[1]
  const body = m[2]

  const fm: Record<string, any> = {}
  const lines = fmText.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // Liste : `key:` suivi de `- item` au niveau d'indentation supérieur
    const listKeyMatch = line.match(/^([a-z_][a-z0-9_]*)\s*:\s*$/i)
    if (listKeyMatch) {
      const key = listKeyMatch[1]
      const items: string[] = []
      i++
      while (i < lines.length && /^-\s+/.test(lines[i].trim())) {
        const item = lines[i].trim().replace(/^-\s+/, '')
        items.push(unquote(item))
        i++
      }
      fm[key] = items
      continue
    }
    // Paire simple `key: value`
    const kvMatch = line.match(/^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i)
    if (kvMatch) {
      fm[kvMatch[1]] = unquote(kvMatch[2].trim())
    }
    i++
  }
  return { fm, body }
}

function unquote(s: string): string {
  if (!s) return s
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'")
  }
  return s
}

// ─── Serializer ────────────────────────────────────────────────────────────

export function serializePost(post: BlogPost): string {
  const fmLines: string[] = []
  const ordered: (keyof BlogPostFrontmatter)[] = [
    'title', 'slug', 'date', 'updated', 'categorie',
    'meta_title', 'meta_description', 'featured_image',
    'status', 'related_posts',
  ]
  for (const key of ordered) {
    const val = (post as any)[key]
    if (val === undefined || val === null) continue
    if (Array.isArray(val)) {
      if (val.length === 0) continue
      fmLines.push(`${key}:`)
      val.forEach(v => fmLines.push(`- ${quoteIfNeeded(String(v))}`))
    } else {
      fmLines.push(`${key}: ${quoteIfNeeded(String(val))}`)
    }
  }
  const fm = fmLines.join('\n')
  const body = post.content_md || ''
  return `---\n${fm}\n---\n\n${body}\n`
}

function quoteIfNeeded(s: string): string {
  if (s === '') return '""'
  // Quote si contient des caractères spéciaux YAML
  if (/^[\s\-?:,\[\]{}#&*!|>'"%@`]/.test(s) || /:\s/.test(s) || /\n/.test(s)) {
    return `"${s.replace(/"/g, '\\"')}"`
  }
  return s
}

// ─── Slug utils ────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'article'
}

export function addRandomPrefix(slug: string, existingSlugs: Set<string> = new Set()): string {
  if (/^\d{3,5}-/.test(slug)) return slug
  for (let i = 0; i < 30; i++) {
    const prefix = Math.floor(1000 + Math.random() * 9000)
    const candidate = `${prefix}-${slug}`
    if (!existingSlugs.has(candidate)) return candidate
  }
  return `${Date.now() % 10000}-${slug}`
}

// ─── Markdown → HTML (preview client) ──────────────────────────────────────

export function mdToHtml(md: string): string {
  if (!md) return ''
  let text = md
  // Images : ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_, alt, url, title) => `<img src="${url}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy">`)
  // Liens
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
  // Inline formatting
  text = text.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>')
  text = text.replace(/`([^`\n]+?)`/g, '<code>$1</code>')

  const lines = text.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trimEnd()
    if (line.startsWith('### ')) { out.push(`<h3>${line.slice(4).trim()}</h3>`); i++; continue }
    if (line.startsWith('## ')) { out.push(`<h2>${line.slice(3).trim()}</h2>`); i++; continue }
    if (line.startsWith('# ')) { out.push(`<h1>${line.slice(2).trim()}</h1>`); i++; continue }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trimEnd())) {
        items.push(lines[i].trimEnd().replace(/^[-*]\s+/, ''))
        i++
      }
      out.push('<ul>' + items.map(it => `<li>${it}</li>`).join('') + '</ul>')
      continue
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trimEnd())) {
        items.push(lines[i].trimEnd().replace(/^\d+\.\s+/, ''))
        i++
      }
      out.push('<ol>' + items.map(it => `<li>${it}</li>`).join('') + '</ol>')
      continue
    }
    if (line.startsWith('> ')) { out.push(`<blockquote>${line.slice(2).trim()}</blockquote>`); i++; continue }
    if (!line) { i++; continue }
    const para = [line]; i++
    while (i < lines.length) {
      const nxt = lines[i].trimEnd()
      if (!nxt) break
      if (nxt.startsWith('#') || nxt.startsWith('>') || /^[-*]\s+/.test(nxt) || /^\d+\.\s+/.test(nxt)) break
      para.push(nxt); i++
    }
    const joined = para.join(' ').trim()
    if (joined.startsWith('<img') || joined.startsWith('<iframe')) out.push(joined)
    else out.push(`<p>${joined}</p>`)
  }
  return out.join('\n')
}
