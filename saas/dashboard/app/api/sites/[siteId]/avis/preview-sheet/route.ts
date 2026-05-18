import { NextRequest, NextResponse } from 'next/server'

// API : lit le avis_sheet_csv_url depuis config.yaml, fetch le CSV, et retourne
// les lignes classées par état (publiée / programmée / à venir).
//
// Réponse :
//   {
//     rows: [{ marque, categorie, sentiment, note_globale, date_publication, status, ...}],
//     not_configured?: true   si pas d'avis_sheet_csv_url
//     error?: string
//   }
//
// Status par ligne :
//   - "published" : un .md existe déjà dans posts_avis/ pour cette marque
//   - "scheduled" : date_publication > maintenant (Europe/Paris)
//   - "pending"   : date_publication <= maintenant ET pas encore publiée

const BASE = 'https://api.github.com'
const headers = {
  'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

function repoPath() {
  return `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`
}

async function ghGet(path: string): Promise<string | null> {
  const res = await fetch(`${BASE}/repos/${repoPath()}/contents/${path}`, { headers, cache: 'no-store' })
  if (!res.ok) return null
  const data = await res.json()
  if (Array.isArray(data)) return null
  return Buffer.from(data.content, 'base64').toString('utf-8')
}

async function ghList(path: string): Promise<any[] | null> {
  const res = await fetch(`${BASE}/repos/${repoPath()}/contents/${path}`, { headers, cache: 'no-store' })
  if (!res.ok) return null
  const data = await res.json()
  return Array.isArray(data) ? data : null
}

// Slugify identique à Python (NFD strip + lowercase + tirets)
function slugify(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseCSV(raw: string): { headers: string[]; rows: any[] } {
  // Parser CSV minimal mais robuste : gère les guillemets et les virgules dans les champs
  const lines: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c === '"' && raw[i + 1] === '"') { cur += '"'; i++; continue }
    if (c === '"') { inQ = !inQ; continue }
    if (c === '\n' && !inQ) { lines.push(cur); cur = ''; continue }
    if (c === '\r' && !inQ) continue
    cur += c
  }
  if (cur) lines.push(cur)
  if (lines.length === 0) return { headers: [], rows: [] }
  // Première ligne = headers (qu'on slugifie en clés)
  const splitLine = (s: string): string[] => {
    const out: string[] = []
    let v = ''; let q = false
    for (let i = 0; i < s.length; i++) {
      const c = s[i]
      if (c === '"' && s[i + 1] === '"') { v += '"'; i++; continue }
      if (c === '"') { q = !q; continue }
      if (c === ',' && !q) { out.push(v); v = ''; continue }
      v += c
    }
    out.push(v)
    return out
  }
  const rawHeaders = splitLine(lines[0]).map(h => slugify(h).replace(/-/g, '_'))
  const rows: any[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i])
    if (cells.every(c => !c.trim())) continue
    const row: any = {}
    for (let j = 0; j < rawHeaders.length; j++) {
      row[rawHeaders[j]] = (cells[j] || '').trim()
    }
    rows.push(row)
  }
  return { headers: rawHeaders, rows }
}

function parsePubDateParis(s: string): Date | null {
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{1,2}):(\d{2}))?/)
  if (!m) return null
  // On considère que la date est en heure de Paris ; on construit un Date UTC
  // équivalent. Astuce : on utilise toLocaleString pour normaliser.
  // Plus simple : on construit une Date locale puis on l'affiche en heure de Paris
  // pour comparer. Mais le serveur Vercel est en UTC : on doit absolument fixer
  // le decalage Paris vs UTC (CET +1 / CEST +2).
  const y = +m[1], mo = +m[2] - 1, d = +m[3]
  const hh = m[4] ? +m[4] : 9
  const mm = m[5] ? +m[5] : 0
  // Heuristique fiable : on construit la date en UTC en retranchant l'offset
  // Paris au moment de la date donnée. On utilise Intl pour récupérer l'offset
  // qui s'appliquerait à cette date à Paris.
  const fauxLocal = new Date(Date.UTC(y, mo, d, hh, mm))
  // Récupère l'offset que Paris a à cette date (+60 ou +120)
  const parisStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(fauxLocal)
  // parisStr = "DD/MM/YYYY, HH:MM"
  const pm = parisStr.match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})/)
  if (!pm) return fauxLocal
  // Difference en minutes entre ce qui est affiché à Paris et ce qui était demandé
  const parisDate = new Date(Date.UTC(+pm[3], +pm[2] - 1, +pm[1], +pm[4], +pm[5]))
  const diffMs = parisDate.getTime() - fauxLocal.getTime()
  return new Date(fauxLocal.getTime() - diffMs)
}

function getConfigField(yaml: string, key: string): string {
  const re = new RegExp(`^\\s+${key}:\\s*['"]?([^'"\\n]+)['"]?`, 'm')
  const m = yaml.match(re)
  return m ? m[1].trim() : ''
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const cfg = await ghGet(`platform/sites/${siteId}/config.yaml`)
  if (!cfg) return NextResponse.json({ rows: [], error: 'config.yaml introuvable' })
  const csvUrl = getConfigField(cfg, 'avis_sheet_csv_url')
  if (!csvUrl) return NextResponse.json({ rows: [], not_configured: true })

  let csvText: string
  try {
    const r = await fetch(csvUrl, { cache: 'no-store' })
    if (!r.ok) {
      return NextResponse.json({ rows: [], error: `Fetch CSV échoué (HTTP ${r.status}). Vérifie que la sheet est publiée sur le web.` })
    }
    csvText = await r.text()
  } catch (e: any) {
    return NextResponse.json({ rows: [], error: 'Fetch CSV échoué : ' + (e?.message || e) })
  }

  const { rows } = parseCSV(csvText)

  // Récupère la liste des avis déjà publiés (slugs)
  const publishedDir = `platform/sites/${siteId}/posts_avis`
  const publishedFiles = await ghList(publishedDir)
  const publishedSlugs = new Set<string>(
    (publishedFiles || [])
      .filter(f => f.type === 'file' && f.name.endsWith('.md'))
      .map(f => f.name.replace(/\.md$/, ''))
  )

  const now = new Date()
  const classified = rows.map(r => {
    const marque = r.marque || ''
    const slug = `avis-${slugify(marque)}`
    let status: 'published' | 'scheduled' | 'pending' = 'pending'
    if (publishedSlugs.has(slug)) {
      status = 'published'
    } else {
      const dt = parsePubDateParis(r.date_publication || '')
      if (dt && dt > now) status = 'scheduled'
    }
    return {
      ...r,
      slug,
      status,
    }
  })

  return NextResponse.json({ rows: classified })
}
