import { NextRequest, NextResponse } from 'next/server'
import { getFile, putFile } from '../../../lib/github'

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
  const { name, niche, domain, sheet_csv_url, cloudflare_project, description } = body
  if (!name || !domain) return NextResponse.json({ error: 'name et domain requis' }, { status: 400 })

  const id = slugify(name)
  const file = await getFile(HUB_CONFIG_PATH)
  let config: any = file ? JSON.parse(file.content) : { sites: [], version: '2.0', updated_at: new Date().toISOString() }
  if (config.sites.find((s: any) => s.id === id)) return NextResponse.json({ error: 'Site déjà existant' }, { status: 400 })

  const newSite = { id, name, niche: niche || 'comparatif', domain, sheet_csv_url: sheet_csv_url || '', cloudflare_project: cloudflare_project || id, description: description || '', status: 'draft', created_at: new Date().toISOString() }
  config.sites.push(newSite)
  config.updated_at = new Date().toISOString()

  const yaml = `site:\n  name: "${name}"\n  domain: "https://${domain}"\n  base_path: ""\n  logo_text: "${name.split(' ')[0]}"\n  logo_accent: "${name.split(' ').slice(1).join(' ')}"\n  year: 2026\nniche: "${niche || 'comparatif'}"\nsheet_csv_url: "${sheet_csv_url || ''}"\ntheme:\n  bg: "#F7F4EF"\n  ink: "#1A1714"\n  accent: "#1B4FD8"\n  accent2: "#E8410A"\n  font_title: "DM Serif Display"\n  font_body: "Inter"\n  google_fonts: "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600;700&display=swap"\nseo:\n  category_label: "Comparatifs"\n  eyebrow: "⚖️ Comparatif 2026"\n  title_pattern: "{A} vs {B} {year}"\n  meta_pattern: "Comparatif {A} vs {B} {year}"\n  h1_pattern: "<em>{A}</em> vs <em>{B}</em> : lequel choisir en {year} ?"\n  intro_pattern: "Comparatif {A} vs {B} - notre analyse."\nai_editorial: false\n`

  await putFile(`platform/sites/${id}/config.yaml`, yaml, `HUB: Create site ${name}`)
  const saved = await putFile(HUB_CONFIG_PATH, JSON.stringify(config, null, 2), `HUB: Add site ${name}`)
  if (!saved) return NextResponse.json({ error: 'Erreur GitHub' }, { status: 500 })
  return NextResponse.json({ site: newSite })
}
