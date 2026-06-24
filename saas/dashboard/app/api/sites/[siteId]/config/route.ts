import { NextRequest, NextResponse } from 'next/server'
import { getFile, putFile } from '../../../../../lib/github'
type Params = { params: Promise<{ siteId: string }> }

export async function GET(_: NextRequest, { params }: Params) {
  const { siteId } = await params
  const file = await getFile(`platform/sites/${siteId}/config.yaml`)
  if (!file) return NextResponse.json({ error: 'Config introuvable' }, { status: 404 })
  const yaml = file.content
  const get = (key: string) => {
    const match = yaml.match(new RegExp(`^[ ]*${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'))
    return match ? match[1].trim().replace(/^["']|["']$/g, '') : ''
  }
  const pageTypesMatch = yaml.match(/page_types:\s*\n((?:[ ]+\w+:[ ]+\S+\n?)+)/)
  const pageTypes: Record<string, string> = {}
  if (pageTypesMatch) {
    pageTypesMatch[1].split('\n').forEach(line => {
      const m = line.match(/\s+(\w+):\s+(\S+)/)
      if (m) pageTypes[m[1]] = m[2]
    })
  }
  return NextResponse.json({
    home_title: get('home_title'),
    home_description: get('home_description'),
    home_h1: get('home_h1'),
    footer_description: get('footer_description'),
    analytics_clicky: get('analytics_clicky'),
    google_site_verification: get('google_site_verification'),
    www_preference: get('www_preference') || 'www',
    blog_sheet_csv_url: get('blog_sheet_csv_url'),
    blog_sheet_edit_url: get('blog_sheet_edit_url'),
    avis_sheet_csv_url: get('avis_sheet_csv_url'),
    avis_sheet_edit_url: get('avis_sheet_edit_url'),
    domain: get('domain'),
    contact_form_key: get('contact_form_key'),
    page_types: pageTypes,
    theme: {
      accent: get('accent'),
      accent2: get('accent2'),
      bg: get('bg'),
      ink: get('ink'),
      cta_color: get('cta_color'),
      cta_text_color: get('cta_text_color'),
    },
    selected_keywords: (() => {
      const lines = yaml.split('\n')
      const idx = lines.findIndex((l: string) => l.startsWith('selected_keywords:'))
      if (idx === -1) return []
      const result: string[] = []
      for (let i = idx + 1; i < lines.length; i++) {
        const line = lines[i]
        if (/^\s+-\s+/.test(line)) result.push(line.replace(/^\s+-\s+/, '').trim())
        else if (line.trim() && !/^\s/.test(line)) break
      }
      return result
    })(),
    seo: {
      title_pattern: get('title_pattern'),
      meta_pattern: get('meta_pattern'),
      avis_title_pattern: get('avis_title_pattern'),
      avis_meta_pattern: get('avis_meta_pattern'),
      liste_comp_title: get('liste_comp_title'),
      liste_avis_title: get('liste_avis_title'),
    },
    persona_prompt: (() => {
      // Lire un bloc scalaire YAML (format "persona_prompt: |\n  ligne1\n  ligne2")
      const blockMatch = yaml.match(/^persona_prompt:\s*\|\s*\n((?:  [^\n]*\n?)*)/m)
      if (blockMatch) return blockMatch[1].replace(/^  /gm, '').trimEnd()
      // Fallback : valeur simple entre guillemets
      return get('persona_prompt')
    })(),
    author: (() => {
      const authorMatch = yaml.match(/^author:\s*\n((?:[ ]+[^\n]+\n?)*)/m)
      if (!authorMatch) return null
      const getField = (field: string) => {
        const m = authorMatch[1].match(new RegExp(`${field}:\s*["']?(.+?)["']?\s*$`, 'm'))
        return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
      }
      const socialsBlock = yaml.match(/^  socials:\s*\n((?:[ ]+-[^\n]+\n(?:[ ]+[^\n]+\n?)*)*)/m)
      const socials: {label: string, url: string}[] = []
      if (socialsBlock) {
        const lines = socialsBlock[1].split('\n')
        let current: any = {}
        lines.forEach(l => {
          const lbl = l.match(/label:\s*["']?(.+?)["']?\s*$/)
          const url = l.match(/url:\s*["']?(.+?)["']?\s*$/)
          if (lbl) current.label = lbl[1].trim().replace(/^["']|["']$/g, '')
          if (url) { current.url = url[1].trim().replace(/^["']|["']$/g, ''); socials.push({...current}); current = {} }
        })
      }
      return { name: getField('name'), bio: getField('bio'), job_title: getField('job_title'), photo: getField('photo'), socials }
    })()
  })
}

// ─────────────────────────────────────────────────────────────────────
// Helper de sanitisation pour insérer une valeur dans une YAML string
// double-quoted single-line.
//
// Bug observé en juin 2026 : des sites créés/édités via le HUB avaient des
// config.yaml invalides parce qu'un home_title (ou meta_pattern, etc.)
// saisi dans un textarea avec un saut de ligne se retrouvait dumpé tel
// quel dans le YAML, produisant une ligne orpheline qui plante ruamel.yaml :
//
//     home_title: "Startup Only : idées, stratégies et croissance pour les startups
//         business"
//
// Cette fonction normalise toute valeur insérée :
//   - retire les retours chariots (Windows)
//   - remplace les sauts de ligne par des espaces
//   - échappe les backslashes et guillemets doubles pour YAML
//   - trim
//
// Cf. _fix_config_yaml.py pour la réparation rétroactive des sites cassés.
// ─────────────────────────────────────────────────────────────────────
function escapeYamlValue(val: unknown): string {
  return String(val ?? '')
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .trim()
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { siteId } = await params
  const body = await req.json()
  const file = await getFile(`platform/sites/${siteId}/config.yaml`)
  if (!file) return NextResponse.json({ error: 'Config introuvable' }, { status: 404 })
  let yaml = file.content
  const replaceKey = (key: string, val: string) => {
    // Sanitisation systématique : toute valeur insérée dans le YAML passe par
    // escapeYamlValue (retours à la ligne → espaces, échappement \ et ").
    // On utilise TOUJOURS des guillemets DOUBLES avec échappement complet
    // (plus simple et plus robuste que basculer en single quotes).
    const safe = escapeYamlValue(val)
    const re = new RegExp(`^([ ]*)${key}:(.*?)$`, 'm')
    const formatted = `$1${key}: "${safe}"`
    if (re.test(yaml)) {
      yaml = yaml.replace(re, formatted)
    } else {
      // La clé n'existe pas → on l'insère DANS la section `site:` si elle
      // existe (pour rester cohérent avec où les autres clés métier sont
      // placées). Sinon top-level sans indentation.
      // IMPORTANT : on n'append PAS à la fin du fichier avec `  ` car ça
      // ferait tomber la clé dans la dernière section du YAML (ex: `seo:`,
      // `author:`), ce qui rendrait la clé invisible pour les scripts qui
      // s'attendent à la trouver au top-level ou dans `site:`.
      const siteMatch = yaml.match(/^site:\s*\n/m)
      if (siteMatch) {
        const insertIdx = siteMatch.index! + siteMatch[0].length
        yaml = yaml.slice(0, insertIdx) + `  ${key}: "${safe}"\n` + yaml.slice(insertIdx)
      } else {
        yaml = yaml.trimEnd() + `\n${key}: "${safe}"\n`
      }
    }
  }
  if (body.home_title !== undefined) replaceKey('home_title', body.home_title || '')
  if (body.home_description !== undefined) replaceKey('home_description', body.home_description || '')
  if (body.home_h1 !== undefined) replaceKey('home_h1', body.home_h1 || '')
  if (body.footer_description !== undefined) replaceKey('footer_description', body.footer_description || '')
  // persona_prompt : bloc scalaire YAML
  if (body.persona_prompt !== undefined) {
    const pp = (body.persona_prompt || '').trim()
    const ppBlock = pp
      ? `persona_prompt: |\n${pp.split('\n').map((l: string) => '  ' + l).join('\n')}`
      : 'persona_prompt: ""'
    // Supprimer TOUT le bloc persona_prompt existant (multi-lignes)
    yaml = yaml.replace(/^persona_prompt:(?:[^\n]*)(?:\n(?:  [^\n]*))*/mg, '')
    // Nettoyer les lignes vides multiples
    yaml = yaml.replace(/\n{3,}/g, '\n\n').trimEnd()
    yaml = yaml + '\n' + ppBlock + '\n'
  }
  if (body.analytics_clicky !== undefined) replaceKey('analytics_clicky', body.analytics_clicky || '')
  if (body.google_site_verification !== undefined) replaceKey('google_site_verification', body.google_site_verification || '')
  if (body.contact_form_key !== undefined) replaceKey('contact_form_key', body.contact_form_key || '')
  if (body.www_preference !== undefined) replaceKey('www_preference', body.www_preference || 'www')
  if (body.blog_sheet_csv_url !== undefined) replaceKey('blog_sheet_csv_url', body.blog_sheet_csv_url || '')
  if (body.blog_sheet_edit_url !== undefined) replaceKey('blog_sheet_edit_url', body.blog_sheet_edit_url || '')
  if (body.avis_sheet_csv_url !== undefined) replaceKey('avis_sheet_csv_url', body.avis_sheet_csv_url || '')
  if (body.avis_sheet_edit_url !== undefined) replaceKey('avis_sheet_edit_url', body.avis_sheet_edit_url || '')
  if (body.seo_vs_title !== undefined) replaceKey('title_pattern', body.seo_vs_title || '')
  if (body.seo_vs_meta !== undefined) replaceKey('meta_pattern', body.seo_vs_meta || '')
  if (body.seo_avis_title !== undefined) replaceKey('avis_title_pattern', body.seo_avis_title || '')
  if (body.seo_avis_meta !== undefined) replaceKey('avis_meta_pattern', body.seo_avis_meta || '')
  if (body.seo_liste_comp_title !== undefined) replaceKey('liste_comp_title', body.seo_liste_comp_title || '')
  if (body.seo_liste_avis_title !== undefined) replaceKey('liste_avis_title', body.seo_liste_avis_title || '')
  if (body.theme) {
    // Les couleurs sont imbriquées sous theme: dans le YAML
    const themeMap: Record<string, string> = body.theme
    Object.entries(themeMap).forEach(([k, v]) => {
      if (!v) return
      // Sanitisation aussi sur les valeurs theme (par cohérence — les couleurs
      // hex ne risquent pas de contenir des \n, mais on ne sait jamais).
      const safe = escapeYamlValue(v)
      // Remplacer la clé dans le bloc theme: (indentée avec 2 espaces)
      const re = new RegExp(`^([ ]{2})${k}:(.*?)$`, 'm')
      if (re.test(yaml)) {
        yaml = yaml.replace(re, `$1${k}: "${safe}"`)
      } else {
        // La clé n'existe pas dans theme: → l'ajouter avant la ligne suivante après theme:
        yaml = yaml.replace(/^(theme:.*\n(?:  .*\n)*)/m, `$1  ${k}: "${safe}"\n`)
      }
    })
  }
  // selected_keywords : liste des types de logiciels actifs
  if (body.selected_keywords !== undefined) {
    const kws: string[] = body.selected_keywords || []
    // Sanitisation aussi sur les keywords individuels (les keywords ne
    // contiennent normalement pas de caractères spéciaux mais ceinture+bretelles)
    const kwLines = kws.length > 0
      ? ['selected_keywords:', ...kws.map((k: string) => '  - "' + escapeYamlValue(k) + '"')]
      : ['selected_keywords: []']
    const yamlLines = yaml.split('\n')
    const skIdx = yamlLines.findIndex((l: string) => l.startsWith('selected_keywords:'))
    if (skIdx !== -1) {
      let endIdx = skIdx + 1
      while (endIdx < yamlLines.length && /^\s+/.test(yamlLines[endIdx])) endIdx++
      yamlLines.splice(skIdx, endIdx - skIdx, ...kwLines)
      yaml = yamlLines.join('\n')
    } else {
      yaml = yaml.trimEnd() + '\n' + kwLines.join('\n') + '\n'
    }
  }

  if (body.page_types) {
    const pageTypesBlock = 'page_types:\n' + Object.entries(body.page_types).map(([k, v]) => `  ${k}: ${v}`).join('\n')
    if (/^page_types:/m.test(yaml)) {
      yaml = yaml.replace(/^page_types:\s*\n((?:[ ]+\w+:[ ]+\S+\n?)+)/m, pageTypesBlock + '\n')
    } else {
      yaml = yaml.replace(/^theme:/m, pageTypesBlock + '\ntheme:')
    }
  }
  // Champs auteur individuels (depuis création site) — sanitisation systématique
  if (body.author_name !== undefined || body.author_job !== undefined || body.author_bio !== undefined) {
    const name = escapeYamlValue(body.author_name || '')
    const job = escapeYamlValue(body.author_job || '')
    const bio = escapeYamlValue(body.author_bio || '')
    const authorBlock = `author:\n  name: "${name}"\n  bio: "${bio}"\n  job_title: "${job}"\n  photo: ""\n  socials: []`
    if (/^author:/m.test(yaml)) {
      yaml = yaml.replace(/^author:\s*\n((?:[ ]+.+\n?)*)/m, authorBlock + '\n')
    } else {
      yaml = yaml.trimEnd() + '\n' + authorBlock + '\n'
    }
  }

  // Champ author (objet YAML) — sanitisation appliquée à tous les sous-champs
  if (body.author !== undefined) {
    const author = body.author as { name?: string, bio?: string, job_title?: string, photo?: string, socials?: {label: string, url: string}[] }
    const socialsYaml = (author.socials || []).length > 0
      ? (author.socials || []).map(s => `\n  - label: "${escapeYamlValue(s.label)}"\n    url: "${escapeYamlValue(s.url)}"`).join('')
      : ' []'
    const authorBlock = [
      'author:',
      `  name: "${escapeYamlValue(author.name)}"`,
      `  bio: "${escapeYamlValue(author.bio)}"`,
      `  job_title: "${escapeYamlValue(author.job_title)}"`,
      `  photo: "${escapeYamlValue(author.photo)}"`,
      `  socials:${socialsYaml}`,
    ].join('\n')
    // Supprimer l'ancien bloc author et tout son contenu indenté
    yaml = yaml.replace(/^author:(?:\n(?:  [^\n]*)?)+/m, '')
    yaml = yaml.trimEnd() + '\n' + authorBlock + '\n'
  }

  // ─────────────────────────────────────────────────────────────────
  // Filet de sécurité : détection du pattern "ligne orpheline" avant
  // l'écriture sur GitHub. Si jamais une valeur passe à travers la
  // sanitisation (cas non couvert qu'on a raté), on refuse d'écrire un
  // fichier qu'on sait cassé. Le user voit un message d'erreur explicite
  // et peut retenter (ses modifs ne sont pas perdues, juste pas sauvegardées).
  // ─────────────────────────────────────────────────────────────────
  const yamlLines = yaml.split('\n')
  for (let i = 1; i < yamlLines.length; i++) {
    const line = yamlLines[i]
    const prevLine = yamlLines[i - 1]
    // Détection : ligne sans `:` indentée + terminée par `"` orphelin,
    // précédée par une ligne `key: "..."` complète (= le pattern fautif).
    if (/^\s{2,}[^:\n]+"\s*$/.test(line) && /^\s*[a-zA-Z_][\w-]*:\s*".+"\s*$/.test(prevLine)) {
      console.error('Validation YAML KO : ligne orpheline détectée à la ligne', i + 1, ':', line)
      return NextResponse.json({
        error: 'Validation YAML : ligne orpheline détectée (bug interne). Vos modifications n\'ont pas été sauvegardées. Réessayez sans saut de ligne dans les champs texte.',
      }, { status: 500 })
    }
  }

  const saved = await putFile(`platform/sites/${siteId}/config.yaml`, yaml, `HUB: Update config ${siteId}`)
  if (!saved) return NextResponse.json({ error: 'Erreur GitHub' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
