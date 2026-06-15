/**
 * blog.ts — Helpers pour parser/sérialiser les fichiers blog (.md avec frontmatter YAML).
 *
 * Format attendu :
 *   ---
 *   title: "Mon titre"
 *   slug: "1234-mon-titre"
 *   date: "2026-05-15T09:00:00"
 *   categorie: "Paie"                        ← PRINCIPALE (utilisée pour breadcrumb, URL canonique, SEO)
 *   categories:                              ← LISTE COMPLÈTE (utilisée pour filtres et listings multi-cat)
 *   - "Paie"
 *   - "Compta"
 *   - "Gestion"
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
 *
 * Règle invariante : `categorie` === `categories[0]`. Écrite automatiquement par
 * les routes API au save, à partir de la première chip de la multi-sélection.
 * Les articles legacy qui n'ont QUE `categorie` continuent de fonctionner :
 * le frontend les charge en faisant `categories = [categorie]` au load.
 */

export interface BlogPostFrontmatter {
  title: string
  slug: string
  date: string                        // ISO datetime
  updated?: string
  categorie?: string                  // catégorie principale (= categories[0])
  categories?: string[]               // liste complète des catégories
  meta_title?: string
  meta_description?: string
  featured_image?: string
  status?: 'published' | 'scheduled' | 'draft'
  min_words?: number
  related_posts?: string[]
  link_anchors?: { text: string; max: number }[]
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
      const items: any[] = []
      i++
      // Détecter format dict (`- text: ...` puis `  max: ...`) vs flat (`- "string"`)
      while (i < lines.length) {
        const t = lines[i]
        // Item dict : `- text: "valeur"` puis lignes `  max: N` continues
        const dictItemMatch = t.match(/^-\s+([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i)
        if (dictItemMatch) {
          const obj: Record<string, any> = {}
          obj[dictItemMatch[1]] = unquote(dictItemMatch[2].trim())
          i++
          // Lignes suivantes indentées `  key: value` font partie du même item
          while (i < lines.length && /^\s{2,}[a-z_][a-z0-9_]*\s*:/.test(lines[i])) {
            const sub = lines[i].match(/^\s+([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i)
            if (sub) {
              const v = unquote(sub[2].trim())
              obj[sub[1]] = /^\d+$/.test(v) ? parseInt(v, 10) : v
            }
            i++
          }
          items.push(obj)
          continue
        }
        // Item flat : `- "valeur"` ou `- valeur`
        const flatItemMatch = t.match(/^-\s+(.*)$/)
        if (flatItemMatch) {
          items.push(unquote(flatItemMatch[1].trim()))
          i++
          continue
        }
        break
      }
      fm[key] = items
      continue
    }
    // Paire simple `key: value`
    const kvMatch = line.match(/^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i)
    if (kvMatch) {
      const key = kvMatch[1]
      let value = kvMatch[2]
      // Gestion de la continuation YAML : si la valeur ouvre une chaîne quoted
      // sans la fermer sur la même ligne, on consomme les lignes suivantes
      // (indentées, donc continuation) jusqu'à trouver la quote de fermeture.
      // PyYAML utilise ce format pour les chaînes longues avec caractères
      // spéciaux. Ex :
      //   title: 'Pappers immobilier : comment récupérer ...sur cette
      //     plateforme ?'
      const opensSingle = value.startsWith("'") && !value.slice(1).match(/(?<!')'(?!')$/)
      const opensDouble = value.startsWith('"') && !value.match(/[^\\]"$/) && value.length > 1
      if (opensSingle || opensDouble) {
        const quote = opensSingle ? "'" : '"'
        // Compteurs simples : on cherche la prochaine fin non-échappée.
        // Pour single-quote : `'` suivi d'une non-quote (`''` est un escape)
        // Pour double-quote : `"` non précédé de `\`
        let i2 = i + 1
        while (i2 < lines.length) {
          const cont = lines[i2]
          // On joint avec un espace (convention YAML : les newlines en
          // single-quoted-string deviennent des espaces).
          value = value + ' ' + cont.replace(/^\s+/, '')
          i2++
          if (quote === "'") {
            // La quote de fin est un ' qui n'est pas suivi d'un autre ' (= escape)
            // et qui est à la fin de la chaîne (ou suivi d'un espace/whitespace).
            // Test : la valeur courante se termine-t-elle par un ' qui clôt ?
            const endMatch = value.match(/^'((?:[^']|'')*)'$/)
            if (endMatch) break
          } else {
            const endMatch = value.match(/^"((?:[^"\\]|\\.)*)"$/)
            if (endMatch) break
          }
        }
        i = i2 - 1  // sera incrémenté en bas de boucle
      }
      fm[key] = unquote(value.trim())
    }
    i++
  }
  return { fm, body }
}

function unquote(s: string): string {
  if (!s) return s
  // Chaîne entre double-quotes : on retire les quotes et on dé-échappe \" et \\
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  // Chaîne entre single-quotes : on retire les quotes et on dé-échappe '' (standard YAML)
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    return s.slice(1, -1).replace(/''/g, "'")
  }
  return s
}

// ─── Serializer ────────────────────────────────────────────────────────────

export function serializePost(post: BlogPost): string {
  const fmLines: string[] = []
  const ordered: (keyof BlogPostFrontmatter)[] = [
    'title', 'slug', 'date', 'updated', 'categorie', 'categories',
    'meta_title', 'meta_description', 'featured_image',
    'status', 'min_words', 'related_posts', 'link_anchors',
  ]
  for (const key of ordered) {
    const val = (post as any)[key]
    if (val === undefined || val === null) continue
    // Liste de dicts (link_anchors)
    if (key === 'link_anchors' && Array.isArray(val)) {
      const filtered = val.filter((a: any) => a && a.text && Number(a.max) > 0)
      if (filtered.length === 0) continue
      fmLines.push(`${key}:`)
      filtered.forEach((a: any) => {
        fmLines.push(`- text: ${quoteIfNeeded(String(a.text))}`)
        fmLines.push(`  max: ${parseInt(String(a.max), 10)}`)
      })
      continue
    }
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
  // Quote si :
  // - commence par un caractère YAML spécial (espace, -, ?, :, etc.)
  // - contient ': ' (qui couperait le parsing)
  // - contient ' #' (commentaire YAML)
  // - contient un newline
  // - contient une apostrophe (pour éviter que YAML choisisse '...''..'.. en single-quote)
  // - contient un backslash ou un guillemet double (à échapper)
  const needsQuote = /^[\s\-?:,\[\]{}#&*!|>'"%@`]/.test(s)
    || /:\s/.test(s)
    || /\s#/.test(s)
    || /\n/.test(s)
    || /['"\\]/.test(s)
  if (needsQuote) {
    // On double-quote : échappe les \ et " selon le standard YAML
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
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
  // Si déjà HTML structuré (produit par le RichEditor), pas de double conversion
  if (/<(p|h[1-6]|ul|ol|div|img|blockquote|figure)\b/i.test(md)) return md
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
