import { NextRequest, NextResponse } from 'next/server'
import { getFile, listDir } from '../../../../../../lib/github'

/**
 * GET /api/sites/[siteId]/blog/preview-sheet
 *
 * Lit la Google Sheet de programmation configurée pour ce site et retourne
 * un aperçu des articles avec leur statut d'éligibilité :
 *   - eligible       : sera publié au prochain déclenchement
 *   - scheduled      : date future, attend la date
 *   - already_done   : déjà publié (présent dans schedule_processed.json)
 *   - invalid_date   : date renseignée mais format invalide
 *   - skip_no_title  : ligne sans titre, sera ignorée
 *
 * Utilisé par la modale "Vérifier la sheet" du dashboard pour montrer à
 * l'utilisateur ce qui va être publié avant de lancer le workflow GitHub.
 */

interface SheetRow {
  titre: string
  categorie: string
  prompt_custom: string
  date_publication: string
  heure_publication: string
  slug: string
  meta_title: string
  meta_description: string
  nombre_mots_minimum: string
  link_anchors: string
  // Calculés :
  status: 'eligible' | 'scheduled' | 'already_done' | 'invalid_date' | 'skip_no_title'
  pub_at?: string             // ISO datetime calculé
  key?: string                // clé d'idempotence
  reason?: string             // raison de skip si applicable
}

// Parseur CSV minimaliste, gère les guillemets et les virgules dans les champs
function parseCSV(text: string): Record<string, string>[] {
  const lines: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; continue }
      if (c === '"') { inQuotes = false; continue }
      field += c
      continue
    }
    if (c === '"') { inQuotes = true; continue }
    if (c === ',') { row.push(field); field = ''; continue }
    if (c === '\n' || c === '\r') {
      if (field !== '' || row.length > 0) { row.push(field); lines.push(row); row = []; field = '' }
      if (c === '\r' && text[i + 1] === '\n') i++
      continue
    }
    field += c
  }
  if (field !== '' || row.length > 0) { row.push(field); lines.push(row) }
  if (lines.length === 0) return []
  const headers = lines[0].map(h => h.trim().toLowerCase().replace(/^\ufeff/, ''))
  return lines.slice(1)
    .filter(r => r.some(c => (c || '').trim()))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])))
}

function parseDateFR(dateStr: string, timeStr: string): Date | null {
  if (!dateStr) return null
  const ts = (timeStr || '09:00').trim() || '09:00'
  const tm = ts.match(/^(\d{1,2})[h:](\d{2})(?::(\d{2}))?$/i)
  const hh = tm ? parseInt(tm[1], 10) : 9
  const mm = tm ? parseInt(tm[2], 10) : 0
  // Formats acceptés : YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
  let d: Date | null = null
  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const frMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (isoMatch) {
    d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]), hh, mm)
  } else if (frMatch) {
    d = new Date(Number(frMatch[3]), Number(frMatch[2]) - 1, Number(frMatch[1]), hh, mm)
  }
  if (!d || isNaN(d.getTime())) return null
  return d
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params

  // 1) Lire l'URL CSV depuis config.yaml
  const configFile = await getFile(`platform/sites/${siteId}/config.yaml`)
  if (!configFile) return NextResponse.json({ error: 'Config introuvable' }, { status: 404 })
  const urlMatch = configFile.content.match(/^[ ]*blog_sheet_csv_url:\s*["']?(.+?)["']?\s*$/m)
  let sheetUrl = urlMatch ? urlMatch[1].trim().replace(/^["']|["']$/g, '') : ''
  if (!sheetUrl) return NextResponse.json({ error: 'Aucune sheet configurée' }, { status: 400 })

  // Normalisation /pubhtml → /pub?output=csv
  sheetUrl = sheetUrl.replace(/\/pubhtml(\?[^#]*)?(#.*)?$/, '/pub?output=csv')
  if (/\/pub(\?|$)/.test(sheetUrl) && !/output=csv/.test(sheetUrl)) {
    sheetUrl = sheetUrl.includes('?') ? sheetUrl + '&output=csv' : sheetUrl + '?output=csv'
  }
  // Cache-buster : Google Sheets met en cache l'URL CSV publique pendant
  // 5-15min. En ajoutant un timestamp aléatoire en query param, on contourne
  // ce cache (Google traite l'URL comme nouvelle).
  const sheetUrlBusted = sheetUrl + (sheetUrl.includes('?') ? '&' : '?') + `_=${Date.now()}`

  // 2) Récupérer la liste des articles déjà traités
  let processed: string[] = []
  const processedFile = await getFile(`platform/sites/${siteId}/blog/schedule_processed.json`)
  if (processedFile) {
    try { processed = JSON.parse(processedFile.content) } catch { /* ignore */ }
  }
  const processedSet = new Set(processed)

  // 3) Lister les slugs existants (pour info, pas utilisé dans la logique éligibilité)
  const postsFiles = await listDir(`platform/sites/${siteId}/blog/posts`)
  const existingSlugs = new Set(postsFiles.filter((f: any) => f.name?.endsWith('.md')).map((f: any) => f.name.replace(/\.md$/, '')))

  // 4) Fetch + parse le CSV
  let csvText = ''
  try {
    const resp = await fetch(sheetUrlBusted, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (compatible; Viseoweb-Dashboard/1.0)',
      },
    })
    if (!resp.ok) {
      return NextResponse.json({
        error: `Sheet inaccessible (HTTP ${resp.status})`,
        hint: 'Vérifie que la sheet est publiée en CSV : Fichier → Partager → Publier sur le web → format "Valeurs séparées par des virgules"',
        sheet_url: sheetUrl,
      }, { status: 502 })
    }
    csvText = await resp.text()
  } catch (e: any) {
    return NextResponse.json({ error: `Erreur réseau : ${e.message}`, sheet_url: sheetUrl }, { status: 502 })
  }

  const rawRows = parseCSV(csvText)
  const now = new Date()

  // 5) Calculer le statut de chaque ligne
  const rows: SheetRow[] = rawRows.map(r => {
    const titre = (r.titre || r.title || '').trim()
    const categorie = (r.categorie || r.category || '').trim()
    const dateStr = (r.date_publication || '').trim()
    const heureStr = (r.heure_publication || '').trim()
    const base: SheetRow = {
      titre, categorie,
      prompt_custom: (r.prompt_custom || '').trim(),
      date_publication: dateStr,
      heure_publication: heureStr,
      slug: (r.slug || '').trim(),
      meta_title: (r.meta_title || '').trim(),
      meta_description: (r.meta_description || '').trim(),
      nombre_mots_minimum: (r.nombre_mots_minimum || r.min_words || '').trim(),
      link_anchors: (r.link_anchors || r.ancres || '').trim(),
      status: 'eligible',
    }
    if (!titre) {
      return { ...base, status: 'skip_no_title', reason: 'Pas de titre' }
    }
    // Si date vide → immédiat
    let pubAt: Date
    let key: string
    if (!dateStr) {
      pubAt = now
      key = `${titre}__IMMEDIATE`
    } else {
      const d = parseDateFR(dateStr, heureStr || '09:00')
      if (!d) {
        return { ...base, status: 'invalid_date', reason: `Date invalide : ${dateStr}` }
      }
      pubAt = d
      key = `${titre}__${dateStr}`
    }
    base.pub_at = pubAt.toISOString()
    base.key = key
    if (processedSet.has(key)) {
      return { ...base, status: 'already_done', reason: 'Déjà publié dans une exécution précédente' }
    }
    if (pubAt > now) {
      return { ...base, status: 'scheduled', reason: `Programmé pour le ${pubAt.toLocaleString('fr-FR')}` }
    }
    return { ...base, status: 'eligible' }
  })

  const summary = {
    total: rows.length,
    eligible: rows.filter(r => r.status === 'eligible').length,
    scheduled: rows.filter(r => r.status === 'scheduled').length,
    already_done: rows.filter(r => r.status === 'already_done').length,
    invalid: rows.filter(r => r.status === 'invalid_date' || r.status === 'skip_no_title').length,
  }

  return NextResponse.json({
    sheet_url: sheetUrl,
    fetched_at: new Date().toISOString(),
    summary,
    rows,
    existing_slugs_count: existingSlugs.size,
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  })
}
