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

  // Lire page_types
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
    www_preference: get('www_preference') || 'www',
    page_types: pageTypes,
    seo: {
      title_pattern: get('title_pattern'),
      meta_pattern: get('meta_pattern'),
      avis_title_pattern: get('avis_title_pattern'),
      avis_meta_pattern: get('avis_meta_pattern'),
      liste_comp_title: get('liste_comp_title'),
      liste_avis_title: get('liste_avis_title'),
    }
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { siteId } = await params
  const body = await req.json()
  const file = await getFile(`platform/sites/${siteId}/config.yaml`)
  if (!file) return NextResponse.json({ error: 'Config introuvable' }, { status: 404 })

  let yaml = file.content

  const replaceKey = (key: string, val: string) => {
    const re = new RegExp(`^([ ]*)${key}:(.*?)$`, 'm')
    if (re.test(yaml)) {
      yaml = yaml.replace(re, `$1${key}: "${val}"`)
    }
  }

  replaceKey('home_title', body.home_title || '')
  replaceKey('home_description', body.home_description || '')
  replaceKey('www_preference', body.www_preference || 'www')
  replaceKey('title_pattern', body.seo_vs_title || '')
  replaceKey('meta_pattern', body.seo_vs_meta || '')
  replaceKey('avis_title_pattern', body.seo_avis_title || '')
  replaceKey('avis_meta_pattern', body.seo_avis_meta || '')
  replaceKey('liste_comp_title', body.seo_liste_comp_title || '')
  replaceKey('liste_avis_title', body.seo_liste_avis_title || '')

  // Mettre à jour page_types si fourni
  if (body.page_types) {
    const pageTypesBlock = 'page_types:\n' + Object.entries(body.page_types).map(([k, v]) => `  ${k}: ${v}`).join('\n')
    if (/^page_types:/m.test(yaml)) {
      yaml = yaml.replace(/^page_types:\s*\n((?:[ ]+\w+:[ ]+\S+\n?)+)/m, pageTypesBlock + '\n')
    } else {
      yaml = yaml.replace(/^theme:/m, pageTypesBlock + '\ntheme:')
    }
  }

  const saved = await putFile(`platform/sites/${siteId}/config.yaml`, yaml, `HUB: Update config ${siteId}`)
  if (!saved) return NextResponse.json({ error: 'Erreur GitHub' }, { status: 500 })
  return NextResponse.json({ success: true })
}
