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
    analytics_clicky: get('analytics_clicky'),
    google_site_verification: get('google_site_verification'),
    www_preference: get('www_preference') || 'www',
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
      classement_title_pattern: get('classement_title_pattern'),
      classement_meta_pattern: get('classement_meta_pattern'),
      classement_h1_pattern: get('classement_h1_pattern'),
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

export async function PATCH(req: NextRequest, { params }: Params) {
  const { siteId } = await params
  const body = await req.json()
  const file = await getFile(`platform/sites/${siteId}/config.yaml`)
  if (!file) return NextResponse.json({ error: 'Config introuvable' }, { status: 404 })
  let yaml = file.content
  // ── Fix d'un bug d'indentation YAML ────────────────────────────────────
  // L'ancien `replaceKey` appendait les clés inexistantes à la fin du fichier
  // avec 2 espaces d'indentation, sans connaître le bloc parent. Résultat :
  // `home_h1`, `title_pattern`, etc. tombaient sous `author:` (dernier bloc
  // avant la fin) au lieu de `site:` et `seo:`.
  // Fix : on indique le bloc parent à `replaceKey`. Si la clé n'existe nulle
  // part, on l'insère à la fin du bloc parent (créé si absent).
  const replaceKey = (key: string, val: string, parent?: string) => {
    // Utiliser guillemets simples si la valeur contient des guillemets doubles (ex: script HTML)
    const quote = val.includes('"') ? "'" : '"'
    // 1) La clé existe déjà quelque part → simple remplacement en place
    const re = new RegExp(`^([ ]*)${key}:(.*?)$`, 'm')
    if (re.test(yaml)) {
      yaml = yaml.replace(re, `$1${key}: ${quote}${val}${quote}`)
      return
    }
    // 2) Pas de bloc parent demandé → append racine (cas legacy)
    if (!parent) {
      yaml += `\n${key}: ${quote}${val}${quote}`
      return
    }
    // 3) Bloc parent demandé → insérer à la fin du bloc (créé si absent)
    const parentRe = new RegExp(`^${parent}:[^\\n]*\\n((?:[ ]+[^\\n]*\\n?)*)`, 'm')
    const m = yaml.match(parentRe)
    if (m) {
      const body = m[1].replace(/\n*$/, '')
      yaml = yaml.replace(parentRe, `${parent}:\n${body}\n  ${key}: ${quote}${val}${quote}\n`)
    } else {
      yaml = yaml.trimEnd() + `\n${parent}:\n  ${key}: ${quote}${val}${quote}\n`
    }
  }
  if (body.home_title !== undefined) replaceKey('home_title', body.home_title || '', 'site')
  if (body.home_description !== undefined) replaceKey('home_description', body.home_description || '', 'site')
  if (body.home_h1 !== undefined) replaceKey('home_h1', body.home_h1 || '', 'site')
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
  if (body.analytics_clicky !== undefined) replaceKey('analytics_clicky', body.analytics_clicky || '', 'site')
  if (body.google_site_verification !== undefined) replaceKey('google_site_verification', body.google_site_verification || '', 'site')
  if (body.www_preference !== undefined) replaceKey('www_preference', body.www_preference || 'www', 'site')
  if (body.seo_vs_title !== undefined) replaceKey('title_pattern', body.seo_vs_title || '', 'seo')
  if (body.seo_vs_meta !== undefined) replaceKey('meta_pattern', body.seo_vs_meta || '', 'seo')
  if (body.seo_avis_title !== undefined) replaceKey('avis_title_pattern', body.seo_avis_title || '', 'seo')
  if (body.seo_avis_meta !== undefined) replaceKey('avis_meta_pattern', body.seo_avis_meta || '', 'seo')
  if (body.seo_liste_comp_title !== undefined) replaceKey('liste_comp_title', body.seo_liste_comp_title || '', 'seo')
  if (body.seo_liste_avis_title !== undefined) replaceKey('liste_avis_title', body.seo_liste_avis_title || '', 'seo')
  if (body.seo_classement_title !== undefined) replaceKey('classement_title_pattern', body.seo_classement_title || '', 'seo')
  if (body.seo_classement_meta !== undefined) replaceKey('classement_meta_pattern', body.seo_classement_meta || '', 'seo')
  if (body.seo_classement_h1 !== undefined) replaceKey('classement_h1_pattern', body.seo_classement_h1 || '', 'seo')
  if (body.theme) {
    // Les couleurs sont imbriquées sous theme: dans le YAML
    const themeMap: Record<string, string> = body.theme
    Object.entries(themeMap).forEach(([k, v]) => {
      if (!v) return
      // Remplacer la clé dans le bloc theme: (indentée avec 2 espaces)
      const re = new RegExp(`^([ ]{2})${k}:(.*?)$`, 'm')
      if (re.test(yaml)) {
        yaml = yaml.replace(re, `$1${k}: "${v}"`)
      } else {
        // La clé n'existe pas dans theme: → l'ajouter avant la ligne suivante après theme:
        yaml = yaml.replace(/^(theme:.*\n(?:  .*\n)*)/m, `$1  ${k}: "${v}"\n`)
      }
    })
  }
  // selected_keywords : liste des types de logiciels actifs
  if (body.selected_keywords !== undefined) {
    const kws: string[] = body.selected_keywords || []
    const kwLines = kws.length > 0
      ? ['selected_keywords:', ...kws.map((k: string) => '  - ' + k)]
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
  // Champs auteur individuels (depuis création site)
  if (body.author_name !== undefined || body.author_job !== undefined || body.author_bio !== undefined) {
    const name = body.author_name || ''
    const job = body.author_job || ''
    const bio = (body.author_bio || '').replace(/"/g, "'")
    const authorBlock = `author:\n  name: "${name}"\n  bio: "${bio}"\n  job_title: "${job}"\n  photo: ""\n  socials: []`
    if (/^author:/m.test(yaml)) {
      yaml = yaml.replace(/^author:\s*\n((?:[ ]+.+\n?)*)/m, authorBlock + '\n')
    } else {
      yaml = yaml.trimEnd() + '\n' + authorBlock + '\n'
    }
  }

  // Champ author (objet YAML)
  if (body.author !== undefined) {
    const author = body.author as { name?: string, bio?: string, job_title?: string, photo?: string, socials?: {label: string, url: string}[] }
    const socialsYaml = (author.socials || []).length > 0
      ? (author.socials || []).map(s => `\n  - label: "${s.label}"\n    url: "${s.url}"`).join('')
      : ' []'
    const authorBlock = [
      'author:',
      `  name: "${(author.name || '').replace(/"/g, "'")}"`,
      `  bio: "${(author.bio || '').replace(/"/g, "'").replace(/\n/g, ' ')}"`,
      `  job_title: "${(author.job_title || '').replace(/"/g, "'")}"`,
      `  photo: "${author.photo || ''}"`,
      `  socials:${socialsYaml}`,
    ].join('\n')
    // Supprimer l'ancien bloc author et tout son contenu indenté
    yaml = yaml.replace(/^author:(?:\n(?:  [^\n]*)?)+/m, '')
    yaml = yaml.trimEnd() + '\n' + authorBlock + '\n'
  }

  const saved = await putFile(`platform/sites/${siteId}/config.yaml`, yaml, `HUB: Update config ${siteId}`)
  if (!saved) return NextResponse.json({ error: 'Erreur GitHub' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
