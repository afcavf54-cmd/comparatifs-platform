import { NextRequest, NextResponse } from 'next/server'
import { getFile, putFile } from '../../../../../lib/github'

type Params = { params: Promise<{ siteId: string }> }

// GET — lit le config.yaml du site
export async function GET(_: NextRequest, { params }: Params) {
  const { siteId } = await params
  const file = await getFile(`platform/sites/${siteId}/config.yaml`)
  if (!file) return NextResponse.json({ error: 'Config introuvable' }, { status: 404 })

  const yaml = file.content

  const get = (key: string) => {
    const match = yaml.match(new RegExp(`^  ${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'))
    return match ? match[1].trim() : ''
  }

  return NextResponse.json({
    home_title: get('home_title'),
    home_description: get('home_description'),
    www_preference: get('www_preference') || 'www',
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

// PATCH — met à jour les champs SEO dans config.yaml
export async function PATCH(req: NextRequest, { params }: Params) {
  const { siteId } = await params
  const body = await req.json()
  const file = await getFile(`platform/sites/${siteId}/config.yaml`)
  if (!file) return NextResponse.json({ error: 'Config introuvable' }, { status: 404 })

  let yaml = file.content

  // Met à jour un champ sous site: (4 espaces d'indentation)
  const updateSiteField = (key: string, val: string) => {
    const re = new RegExp(`^(    ${key}:\\s*)["']?.*?["']?\\s*$`, 'm')
    const line = `    ${key}: "${val}"`
    if (re.test(yaml)) {
      yaml = yaml.replace(re, line)
    } else {
      // Insère avant la ligne "theme:" 
      yaml = yaml.replace(/^theme:/m, `    ${key}: "${val}"\ntheme:`)
    }
  }

  // Met à jour un champ sous seo: (4 espaces d'indentation)
  const update = (key: string, val: string) => {
    const re = new RegExp(`^(    ${key}:\\s*)["']?.*?["']?\\s*$`, 'm')
    const line = `    ${key}: "${val}"`
    if (re.test(yaml)) {
      yaml = yaml.replace(re, line)
    } else {
      yaml = yaml.trimEnd() + `\n    ${key}: "${val}"\n`
    }
  }

  updateSiteField('home_title', body.home_title || '')
  updateSiteField('home_description', body.home_description || '')
  updateSiteField('www_preference', body.www_preference || 'www')
  update('title_pattern', body.seo_vs_title || '')
  update('meta_pattern', body.seo_vs_meta || '')
  update('avis_title_pattern', body.seo_avis_title || '')
  update('avis_meta_pattern', body.seo_avis_meta || '')
  update('liste_comp_title', body.seo_liste_comp_title || '')
  update('liste_avis_title', body.seo_liste_avis_title || '')

  const saved = await putFile(
    `platform/sites/${siteId}/config.yaml`,
    yaml,
    `HUB: Update SEO config ${siteId}`
  )

  if (!saved) return NextResponse.json({ error: 'Erreur GitHub' }, { status: 500 })
  return NextResponse.json({ success: true })
}
