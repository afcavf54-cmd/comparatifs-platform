import { NextRequest, NextResponse } from 'next/server'
import { getFile, listDir } from '../../../../../../lib/github'
import { parseCSV as parseCSVShared } from '../../../../../../lib/csv'

/**
 * GET /api/sites/[siteId]/blog/preview-sheet
 *
 * Lit la Google Sheet de programmation configurée pour ce site et retourne
 * un aperçu des articles avec leur statut d'éligibilité :
 *   - eligible       : sera publié au prochain déclenchement
 *   - scheduled      : date future, attend la date
 *   - draft          : marqueur de brouillon dans date_publication (article
 *                      sera généré par Claude mais marqué status: draft, donc
 *                      invisible sur le site live tant que pas validé)
 *   - already_done   : déjà publié (présent dans schedule_processed.json)
 *   - invalid_date   : date renseignée mais format invalide ET pas un marker draft
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
  status: 'eligible' | 'scheduled' | 'draft' | 'already_done' | 'invalid_date' | 'skip_no_title'
  pub_at?: string             // ISO datetime calculé
  key?: string                // clé d'idempotence
  reason?: string             // raison de skip si applicable
}

// ─── Markers de brouillon (alignés avec blog_publish_scheduled.py) ────────
// Quand la colonne date_publication contient l'un de ces mots-clés (case
// insensitive), l'article est GÉNÉRÉ par Claude mais avec status: draft.
// Il N'APPARAÎT PAS sur le site live tant que tu ne l'as pas validé en
// passant manuellement status: draft → published. Pratique pour la rédaction
// d'articles à valider par un annonceur avant publication.
const DRAFT_MARKERS = new Set([
  'draft', 'brouillon', 'wip', 'pending', 'todo',
  'à valider', 'a valider',
])

function isDraftMarker(dateStr: string): boolean {
  return DRAFT_MARKERS.has((dateStr || '').trim().toLowerCase())
}

// Wrapper sur le parseur partagé qui aligne la signature (retourne juste les
// rows comme `Record<string, string>[]` au lieu de `{ headers, rows }`).
// Le parseur partagé est basé sur papaparse — gère correctement les virgules
// à l'intérieur des cellules quotées (bug du parser custom historique).
function parseCSV(text: string): Record<string, string>[] {
  return parseCSVShared(text).rows
}

/**
 * Calcule l'offset en minutes de la timezone Paris par rapport à UTC pour
 * une date donnée. Gère automatiquement le changement d'heure CET/CEST.
 * Retourne 60 en hiver, 120 en été (positif = Paris en avance sur UTC).
 */
function parisOffsetMinutes(year: number, month: number, day: number): number {
  // Construit la même date "wall clock" interprétée dans 2 timezones, puis
  // mesure la différence. Utilise Intl.DateTimeFormat qui gère DST.
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0))
  const parisFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const parts = parisFmt.formatToParts(probe)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  // 'hour' peut être '24' chez en-US — on normalise
  const h = get('hour') % 24
  const parisAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'))
  return (parisAsUtc - probe.getTime()) / 60000
}

function parseDateFR(dateStr: string, timeStr: string): Date | null {
  if (!dateStr) return null
  const ts = (timeStr || '09:00').trim() || '09:00'
  const tm = ts.match(/^(\d{1,2})[h:](\d{2})(?::(\d{2}))?$/i)
  const hh = tm ? parseInt(tm[1], 10) : 9
  const mm = tm ? parseInt(tm[2], 10) : 0
  // Formats acceptés : YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
  let y: number, mo: number, dd: number
  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const frMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (isoMatch) {
    y = Number(isoMatch[1]); mo = Number(isoMatch[2]); dd = Number(isoMatch[3])
  } else if (frMatch) {
    y = Number(frMatch[3]); mo = Number(frMatch[2]); dd = Number(frMatch[1])
  } else {
    return null
  }
  // L'heure tapée par Julien est en heure de Paris. On la convertit en UTC
  // en soustrayant l'offset Paris (+60 en hiver, +120 en été).
  const offsetMin = parisOffsetMinutes(y, mo, dd)
  const utcMs = Date.UTC(y, mo - 1, dd, hh, mm) - offsetMin * 60000
  const d = new Date(utcMs)
  if (isNaN(d.getTime())) return null
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

  // 3 bis) Lister les titres normalisés des articles déjà publiés (.md frontmatter).
  // Filet de sécurité contre les doublons quand un article a été publié
  // manuellement via le dashboard (donc absent du schedule_processed.json).
  const normalizeTitle = (t: string) => t.toLowerCase().split(/\s+/).filter(Boolean).join(' ')
  const existingTitles = new Set<string>()
  const mdFiles = postsFiles.filter((f: any) => f.name?.endsWith('.md'))
  await Promise.all(mdFiles.slice(0, 200).map(async (f: any) => {
    try {
      const fileResp = await getFile(`platform/sites/${siteId}/blog/posts/${f.name}`)
      if (!fileResp) return
      const content = fileResp.content
      if (!content.startsWith('---')) return
      const end = content.indexOf('---', 3)
      if (end < 0) return
      const fm = content.slice(3, end)
      for (const line of fm.split('\n')) {
        if (line.trim().startsWith('title:')) {
          let t = line.split(':').slice(1).join(':').trim()
          // Strip YAML quotes
          if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
            t = t.slice(1, -1)
            t = t[0] === "'" ? t.replace(/''/g, "'") : t.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
          }
          if (t) existingTitles.add(normalizeTitle(t))
          break
        }
      }
    } catch { /* ignore */ }
  }))

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

    // ── Marker brouillon (draft / brouillon / wip / pending / todo / à valider)
    // Détecté AVANT le parse de date pour ne pas tomber en 'invalid_date'.
    // L'article sera généré par Claude mais avec status: draft dans le .md,
    // donc invisible sur le site live tant que pas validé manuellement.
    if (isDraftMarker(dateStr)) {
      // Clé d'idempotence basée sur le titre seul (la valeur exacte du marker
      // peut changer entre "draft" et "brouillon" sans qu'on regénère l'article)
      const key = `${titre}__DRAFT`
      // On vérifie quand même si on a déjà traité ce brouillon
      if (processedSet.has(key) || existingTitles.has(normalizeTitle(titre))) {
        return { ...base, status: 'already_done', key, reason: 'Brouillon déjà généré — édite-le directement dans le repo' }
      }
      return {
        ...base,
        status: 'draft',
        key,
        reason: 'Article généré en brouillon — invisible sur le site tant que tu ne valides pas',
      }
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
    // Filet : si un .md avec le même titre normalisé existe, on considère
    // comme déjà publié (cas : article créé manuellement via le dashboard).
    if (existingTitles.has(normalizeTitle(titre))) {
      return { ...base, status: 'already_done', reason: 'Un article avec ce titre existe déjà dans le repo' }
    }
    if (pubAt > now) {
      return { ...base, status: 'scheduled', reason: `Programmé pour le ${pubAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}` }
    }
    return { ...base, status: 'eligible' }
  })

  const summary = {
    total: rows.length,
    eligible: rows.filter(r => r.status === 'eligible').length,
    scheduled: rows.filter(r => r.status === 'scheduled').length,
    draft: rows.filter(r => r.status === 'draft').length,
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
