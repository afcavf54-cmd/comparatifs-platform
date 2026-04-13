import { NextRequest, NextResponse } from 'next/server'
import { getFile, putFile, triggerWorkflow } from '../../../lib/github'

const HUB_CONFIG_PATH = 'hub.config.json'

function slugify(str: string): string {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function GET() {
  const file = await getFile(HUB_CONFIG_PATH)
  if (!file) return NextResponse.json({ sites: [], version: '2.0', updated_at: new Date().toISOString() })
  try { return NextResponse.json(JSON.parse(file.content)) }
  catch { return NextResponse.json({ sites: [], version: '2.0', updated_at: new Date().toISOString() }) }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    name, niche, domain, sheet_csv_url, description,
    accent = '#1B4FD8', accent2 = '#E8410A', bg = '#F4F6FB',
    logo_text, logo_accent,
  } = body

  if (!name || !domain) return NextResponse.json({ error: 'name et domain requis' }, { status: 400 })

  const id = slugify(name)
  const year = new Date().getFullYear()
  const domainClean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const logoText = logo_text || name.split(' ')[0]
  const logoAccent = logo_accent || name.split(' ').slice(1).join(' ')

  const hubFile = await getFile(HUB_CONFIG_PATH)
  let hubConfig: any = hubFile ? JSON.parse(hubFile.content) : { sites: [], version: '2.0', updated_at: new Date().toISOString() }
  if (hubConfig.sites.find((s: any) => s.id === id))
    return NextResponse.json({ error: 'Un site avec ce nom existe deja' }, { status: 400 })

  const configYaml = `# ============================================================
# CONFIG SITE -- ${id}
# ============================================================

site:
  slug: ${id}
  name: "${name}"
  domain: "https://${domainClean}"
  base_path: ""
  logo_text: "${logoText}"
  logo_accent: "${logoAccent}"
  tagline: "Comparatifs ${name} ${year}"
  year: ${year}
  sheet_csv_url: "${sheet_csv_url || ''}"
  template: "comparatif-vs-scpi.html.j2"
  index_template: "index-scpi.html.j2"
  analytics_clicky: ""

theme:
  accent: "${accent}"
  accent2: "${accent2}"
  bg: "${bg}"
  ink: "#0F1A2E"
  surface: "#FFFFFF"
  font_title: "DM Serif Display"
  font_body: "Outfit"
  google_fonts: "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600&display=swap"

criteria:
  - label: "TD ${year}"
    field: td
    type: text
    suffix: "%"
  - label: "TRI"
    field: tri
    type: text
    suffix: "%"
  - label: "Prix de la part"
    field: prix_achat
    type: text
    suffix: "EUR"
  - label: "Prix de retrait"
    field: prix_retrait
    type: text
    suffix: "EUR"
  - label: "Investissement min."
    field: investissement_min
    type: text
  - label: "Frais de souscription"
    field: frais_souscription
    type: text
    suffix: "%"
  - label: "Frais de gestion"
    field: frais_gestion
    type: text
    suffix: "% TTC"
  - label: "TOF"
    field: tof
    type: text
    suffix: "%"
  - label: "Endettement"
    field: endettement
    type: text
    suffix: "%"
  - label: "Delai de jouissance"
    field: delai_jouissance
    type: text
    suffix: " mois"
  - label: "Pays"
    field: pays
    type: text

tag_classes:
  rendement: "tag-rendement"
  diversifiee: "tag-diversifiee"
  specialisee: "tag-specialisee"
  europeenne: "tag-europeenne"

seo:
  title_pattern: "{A} vs {B} : comparatif {year}"
  meta_pattern: "Comparatif complet {A} vs {B} {year} : rendements, frais, avis."
  h1_pattern: "<em>{A}</em> vs <em>{B}</em> : lequel choisir en {year} ?"
  eyebrow: "Comparatif {year}"
  intro_pattern: "Comparatif {A} vs {B} - analyse complete."
  category_label: "Comparatifs"
  category_url: "index.html#comparatifs"
`

  const files = [
    [`platform/sites/${id}/config.yaml`, configYaml, `HUB: Create site ${name}`],
    [`platform/sites/${id}/editorial.json`, '{}', `HUB: Init editorial ${name}`],
    [`platform/sites/${id}/products_editorial.json`, '{}', `HUB: Init products_editorial ${name}`],
    [`platform/sites/${id}/site_editorial.json`, '{}', `HUB: Init site_editorial ${name}`],
  ] as [string, string, string][]

  for (const [path, content, msg] of files) {
    const ok = await putFile(path, content, msg)
    if (!ok) return NextResponse.json({ error: `Erreur GitHub : impossible d ecrire ${path}. Verifiez GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO dans les variables Vercel.` }, { status: 500 })
    await new Promise(r => setTimeout(r, 300))
  }

  const newSite = {
    id, name, niche: niche || 'comparatif',
    domain: domainClean, sheet_csv_url: sheet_csv_url || '',
    description: description || '', status: 'building',
    created_at: new Date().toISOString(),
  }
  hubConfig.sites.push(newSite)
  hubConfig.updated_at = new Date().toISOString()
  await putFile(HUB_CONFIG_PATH, JSON.stringify(hubConfig, null, 2), `HUB: Add site ${name}`)

  await triggerWorkflow('generate-site.yml', { site: id })

  return NextResponse.json({ site: newSite })
}
