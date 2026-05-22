import { NextRequest, NextResponse } from 'next/server'
import { getFile, putFile, triggerWorkflow } from '../../../lib/github'

const HUB_CONFIG_PATH = 'hub.config.json'

function slugify(str: string): string {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function randomAuthorName(): string {
  const firstNames = [
    "Thomas", "Julie", "Nicolas", "Marie", "Pierre", "Sophie", "Antoine",
    "Claire", "Julien", "Emma", "Alexandre", "Léa", "Maxime", "Camille",
    "François", "Laura", "Romain", "Sarah", "Baptiste", "Charlotte",
    "Guillaume", "Inès", "Théo", "Manon", "Hugo", "Lucie", "Axel",
    "Pauline", "Lucas", "Mathilde", "Clément", "Elisa", "Arthur", "Marine"
  ]
  const lastNames = [
    "Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit",
    "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Michel",
    "Garcia", "David", "Bertrand", "Roux", "Vincent", "Fournier", "Morel",
    "Girard", "André", "Lefevre", "Mercier", "Dupont", "Lambert", "Bonnet",
    "François", "Martinez", "Legrand", "Garnier", "Faure", "Rousseau"
  ]
  const first = firstNames[Math.floor(Math.random() * firstNames.length)]
  const last = lastNames[Math.floor(Math.random() * lastNames.length)]
  return `${first} ${last}`
}

// ── YAML helpers ──────────────────────────────────────────────────────────
// Échappe les " et les retours à la ligne dans les valeurs YAML simples.
function ye(s: string): string {
  if (s === null || s === undefined) return ''
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')
}

// Bloc CRITERIA selon le type de site.
// - classement : critères génériques SaaS (prix, essai gratuit, note, catégorie)
// - comparatif : critères SCPI legacy (rétrocompatibilité)
function criteriaBlock(siteType: string, year: number): string {
  if (siteType === 'classement') {
    return `criteria:
  - label: "Prix dès"
    field: prix_achat
    type: text
    suffix: "€/mois"
  - label: "Essai gratuit"
    field: essai_gratuit
    type: bool
  - label: "Note"
    field: note_redaction
    type: text
    suffix: "/5"
  - label: "Catégorie"
    field: categorie
    type: text`
  }
  // comparatif (legacy SCPI)
  return `criteria:
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
    type: text`
}

// Bloc SEO selon le type. Pour les sites classement, on ajoute les patterns
// classement_*_pattern indispensables au rendu des pages de classement.
function seoBlock(siteType: string, p: {
  seo_vs_title: string, seo_vs_meta: string,
  seo_avis_title: string, seo_avis_meta: string,
  seo_liste_comp_title: string, seo_liste_avis_title: string,
}): string {
  if (siteType === 'classement') {
    // Patterns adaptés SaaS : on remplace les fragments SCPI ("rendements",
    // "{td}%", "faut-il investir") qui auraient été passés depuis le wizard
    // (lequel n'expose pas l'étape SEO en mode classement) par des libellés
    // génériques produit.
    return `seo:
  title_pattern: "{A} vs {B} : comparatif {year}"
  meta_pattern: "Comparatif complet {A} vs {B} {year} : prix, fonctionnalités, avis."
  h1_pattern: "<em>{A}</em> vs <em>{B}</em> : lequel choisir en {year} ?"
  eyebrow: "Comparatif {year}"
  intro_pattern: "Comparatif {A} vs {B} - analyse complète."
  category_label: "Comparateurs"
  category_url: "/#comparateurs"
  avis_title_pattern: "Avis {nom} {year} : notre test complet"
  avis_meta_pattern: "Notre avis complet sur {nom} {year} : prix, fonctionnalités, points forts et limites."
  liste_comp_title: "${ye(p.seo_liste_comp_title)}"
  liste_avis_title: "Avis logiciels {year} : analyses indépendantes"
  classement_title_pattern: "Meilleur {categorie} {year} : mon top {count} comparatif"
  classement_meta_pattern: "Comparez les meilleurs {categories} en {year} : prix, fonctionnalités, avis indépendants."
  classement_h1_pattern: "J'ai testé {count} {categories} : mon comparatif complet {year}"
  classement_titre_analyse_pattern: "Mon classement des meilleurs {categories}"`
  }
  // comparatif (legacy) : on utilise les patterns du wizard
  return `seo:
  title_pattern: "${ye(p.seo_vs_title)}"
  meta_pattern: "${ye(p.seo_vs_meta)}"
  avis_title_pattern: "${ye(p.seo_avis_title)}"
  avis_meta_pattern: "${ye(p.seo_avis_meta)}"
  liste_comp_title: "${ye(p.seo_liste_comp_title)}"
  liste_avis_title: "${ye(p.seo_liste_avis_title)}"
  h1_pattern: "<em>{A}</em> vs <em>{B}</em> : lequel choisir en {year} ?"
  eyebrow: "Comparatif {year}"
  intro_pattern: "Comparatif {A} vs {B} - analyse complete."
  category_label: "Comparatifs"
  category_url: "index.html#comparatifs"`
}

// Bloc AUTHOR. Toujours généré quand on a au moins un nom (saisi ou random).
function authorBlock(authorName: string, authorJob: string, authorBio: string): string {
  if (!authorName) return ''
  return `author:
  name: "${ye(authorName)}"
  bio: "${ye(authorBio)}"
  job_title: "${ye(authorJob)}"
  photo: "/author-photo.png"
  socials: []`
}

// Bloc PERSONA_PROMPT en YAML block scalar (|) pour préserver les sauts de ligne.
function personaBlock(personaPrompt: string): string {
  if (!personaPrompt || !personaPrompt.trim()) return ''
  // On indente chaque ligne de 2 espaces (YAML block scalar)
  const indented = personaPrompt.split('\n').map(l => `  ${l}`).join('\n')
  return `persona_prompt: |\n${indented}`
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
    logo_text, logo_accent, www_preference = 'www',
    home_title = '', home_description = '',
    seo_vs_title = '{A} vs {B} : comparatif {year}',
    seo_vs_meta = 'Comparatif complet {A} vs {B} {year} : rendements, frais, avis.',
    seo_avis_title = 'Avis {nom} {year} : faut-il investir ?',
    seo_avis_meta = 'Notre avis complet sur {nom} {year} : rendement {td}%, frais, points forts et risques.',
    seo_liste_comp_title = 'Tous les comparatifs {site_name} {year}',
    seo_liste_avis_title = 'Avis {site_name} {year} : analyses independantes',
    page_types = {},
    // ── Nouveaux champs traités (étaient ignorés silencieusement avant) ──
    site_type = 'comparatif',                  // 'comparatif' | 'classement'
    persona_prompt = '',
    author_name: providedAuthorName = '',
    author_job = '',
    author_bio = '',
    selected_keywords = [],                    // liste de noms de keywords cochés à l'étape "Types"
  } = body

  if (!name || !domain) return NextResponse.json({ error: 'name et domain requis' }, { status: 400 })

  const id = slugify(name)
  const year = new Date().getFullYear()
  const domainClean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const logoText = logo_text || name.split(' ')[0]
  const logoAccent = logo_accent || name.split(' ').slice(1).join(' ')
  const authorName = providedAuthorName || randomAuthorName()

  const hubFile = await getFile(HUB_CONFIG_PATH)
  let hubConfig: any = hubFile ? JSON.parse(hubFile.content) : { sites: [], version: '2.0', updated_at: new Date().toISOString() }
  if (hubConfig.sites.find((s: any) => s.id === id))
    return NextResponse.json({ error: 'Un site avec ce nom existe déjà' }, { status: 400 })

  // ── Choix des templates selon le type de site ────────────────────────
  // Le bug historique d'origine : `template` et `index_template` étaient
  // codés en dur SCPI, ce qui rendait tous les nouveaux sites classement
  // inutilisables (template inadapté + bug d'indent dans generate.py).
  const isClassement = site_type === 'classement'
  const tplMain = isClassement ? 'classement-saas.html.j2' : 'comparatif-vs-scpi.html.j2'
  const tplIndex = isClassement ? 'index-saas.html.j2' : 'index-scpi.html.j2'

  // Bloc page_types YAML
  const pageTypesBlock = Object.entries(page_types as Record<string, string>)
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n')
  const pageTypesYaml = pageTypesBlock ? `page_types:\n${pageTypesBlock}\n\n` : ''

  // Bloc thème : on ajoute cta_color/cta_text_color (cohérence visuelle CTA)
  const themeYaml = `theme:
  accent: "${accent}"
  accent2: "${accent2}"
  bg: "${bg}"
  ink: "#0F1A2E"
  surface: "#FFFFFF"
  font_title: "DM Serif Display"
  font_body: "Outfit"
  google_fonts: "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600&display=swap"
  cta_color: "${accent2}"
  cta_text_color: "#ffffff"`

  // Sections optionnelles
  const personaYaml = personaBlock(persona_prompt)
  const authorYaml = authorBlock(authorName, author_job, author_bio)

  const configYaml = `# ============================================================
# CONFIG SITE -- ${id}
# Type : ${isClassement ? 'classement (SaaS)' : 'comparatif (SCPI legacy)'}
# Généré par le wizard HUB le ${new Date().toISOString().split('T')[0]}
# ============================================================

site:
  slug: ${id}
  name: "${ye(name)}"
  domain: "https://${domainClean}"
  base_path: ""
  logo_text: "${ye(logoText)}"
  logo_accent: "${ye(logoAccent)}"
  tagline: "Comparatifs ${ye(name)} ${year}"
  year: ${year}
  sheet_csv_url: "${ye(sheet_csv_url || '')}"
  www_preference: "${www_preference}"
  author_name: "${ye(authorName)}"
  home_title: "${ye(home_title || `${name} | Comparatifs ${year}`)}"
  home_description: "${ye(home_description)}"
  template: "${tplMain}"
  index_template: "${tplIndex}"
  analytics_clicky: ""

${pageTypesYaml}${themeYaml}

${criteriaBlock(site_type, year)}

tag_classes:
  rendement: "tag-rendement"
  diversifiee: "tag-diversifiee"
  specialisee: "tag-specialisee"
  europeenne: "tag-europeenne"

${seoBlock(site_type, { seo_vs_title, seo_vs_meta, seo_avis_title, seo_avis_meta, seo_liste_comp_title, seo_liste_avis_title })}
${personaYaml ? '\n' + personaYaml + '\n' : ''}${authorYaml ? '\n' + authorYaml + '\n' : ''}`

  // ── enabled_classements.json (sites classement uniquement) ──────────
  // Si l'utilisateur a coché des keywords à l'étape "Types", on crée le
  // fichier de liste blanche que `generate.py` et `enrich_editorial.py`
  // lisent. Sans ça, à la création le site activait par défaut TOUS les
  // keywords (mode legacy), ce qui pollue editorial.json et brûle des
  // tokens API inutiles.
  const files: [string, string, string][] = [
    [`platform/sites/${id}/config.yaml`, configYaml, `HUB: Create site ${name}`],
    [`platform/sites/${id}/editorial.json`, '{}', `HUB: Init editorial ${name}`],
    [`platform/sites/${id}/products_editorial.json`, '{}', `HUB: Init products_editorial ${name}`],
    [`platform/sites/${id}/site_editorial.json`, '{}', `HUB: Init site_editorial ${name}`],
  ]

  if (isClassement && Array.isArray(selected_keywords) && selected_keywords.length > 0) {
    const enabledSlugs = selected_keywords
      .filter((k: unknown): k is string => typeof k === 'string' && !!k.trim())
      .map((k: string) => slugify(k))
    const enabledJson = JSON.stringify({
      classements: enabledSlugs,
      updated: new Date().toISOString(),
    }, null, 2)
    files.push([
      `platform/sites/${id}/enabled_classements.json`,
      enabledJson,
      `HUB: Init enabled_classements ${name} (${enabledSlugs.length} keywords)`,
    ])
  }

  for (const [path, content, msg] of files) {
    const ok = await putFile(path, content, msg)
    if (!ok) return NextResponse.json({ error: `Erreur GitHub : impossible d'écrire ${path}.` }, { status: 500 })
    await new Promise(r => setTimeout(r, 300))
  }

  const newSite = {
    id, name, niche: niche || site_type,
    domain: domainClean, sheet_csv_url: sheet_csv_url || '',
    description: description || '', status: 'pending_generation',
    site_type,
    created_at: new Date().toISOString(),
    page_types: Object.fromEntries(Object.entries(page_types as Record<string, string>).filter(([, v]) => v)),
  }
  hubConfig.sites.push(newSite)
  hubConfig.updated_at = new Date().toISOString()
  await putFile(HUB_CONFIG_PATH, JSON.stringify(hubConfig, null, 2), `HUB: Add site ${name}`)

  await triggerWorkflow('generate-site.yml', { site: id })

  return NextResponse.json({ site: newSite })
}
