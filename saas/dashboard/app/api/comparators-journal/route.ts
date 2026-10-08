import { NextResponse } from 'next/server'
import { getFile, listDir } from '../../../lib/github'

export const dynamic = 'force-dynamic'

type Entry = {
  site: string; site_name: string; slug: string; title: string;
  cat_parent: string; date: string; time: string; url: string
}

// Lecture d'une valeur simple dans un config.yaml (clé: "valeur" ou clé: valeur)
function yget(yaml: string, key: string): string {
  const m = yaml.match(new RegExp(`^[ ]*${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '').replace(/\\(["\\])/g, '$1') : ''
}

// Titre lisible à partir du slug quand le champ "categorie" est absent.
function prettify(slug: string): string {
  const s = slug.replace(/-/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : slug
}

export async function GET() {
  const dirs = await listDir('platform/sites').catch(() => [])
  const sites = dirs.filter(d => d.type === 'dir' && d.name !== '_shared').map(d => d.name)

  const all: Entry[] = []

  await Promise.all(sites.map(async site => {
    const [edF, dtF, cfgF] = await Promise.all([
      getFile(`platform/sites/${site}/editorial.json`),
      getFile(`platform/sites/${site}/dates.json`),
      getFile(`platform/sites/${site}/config.yaml`),
    ])
    if (!edF) return
    let editorial: Record<string, any> = {}
    let dates: Record<string, any> = {}
    try { editorial = JSON.parse(edF.content) } catch { return }
    if (dtF) { try { dates = JSON.parse(dtF.content) } catch { dates = {} } }

    const cfg = cfgF?.content || ''
    const domain = (yget(cfg, 'domain') || '').replace(/\/+$/, '')
    const basePath = (yget(cfg, 'base_path') || '').replace(/\/+$/, '')
    const siteName = yget(cfg, 'name') || site

    for (const [key, val] of Object.entries(editorial)) {
      if (!key.startsWith('classement-') || key.startsWith('classement-prod-')) continue
      if (!val || typeof val !== 'object' || !(val as any).autonome) continue
      const slug = key.slice('classement-'.length)
      const page = `meilleur-${slug}`
      // Date de première publication : dates.json (clé .html ou /index.html)
      const dEntry = dates[`${page}.html`] || dates[`${page}/index.html`]
      const dtObj = dEntry && typeof dEntry === 'object' ? dEntry : {}
      // Date de CRÉATION (figée) en priorité : un redéploiement re-date le HTML
      // (champ `datetime`/`date`) mais ne doit PAS faire remonter le comparateur
      // dans le journal comme s'il venait d'être créé. Fallback sur l'ancien
      // comportement pour les entrées pas encore backfillées.
      const dtFull = String(dtObj.created || dtObj.datetime || '')   // "2026-10-07T14:03"
      const date = dtFull ? dtFull.slice(0, 10) : String(dtObj.date || '')
      const time = dtFull.includes('T') ? dtFull.slice(11, 16) : ''   // "14:03" ou ''
      const title = (val as any).categorie || prettify(slug)
      const cat_parent = (val as any).cat_parent || ''
      const url = domain ? `${domain}${basePath}/${page}` : ''
      all.push({ site, site_name: siteName, slug, title, cat_parent, date, time, url })
    }
  }))

  // Tri : par date+heure décroissante (les sans-date en bas), puis par site.
  const key = (e: Entry) => (e.date ? e.date + 'T' + (e.time || '00:00') : '')
  all.sort((a, b) => {
    const ka = key(a), kb = key(b)
    if (ka && kb && ka !== kb) return ka < kb ? 1 : -1
    if (ka && !kb) return -1
    if (!ka && kb) return 1
    return a.site.localeCompare(b.site) || a.title.localeCompare(b.title)
  })

  const sitesList = Array.from(new Set(all.map(e => e.site_name))).sort()
  return NextResponse.json({ entries: all, total: all.length, sites: sitesList })
}
