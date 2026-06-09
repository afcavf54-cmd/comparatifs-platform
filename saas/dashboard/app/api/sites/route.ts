import { NextRequest, NextResponse } from 'next/server'
import { getFile, putFile, triggerWorkflow } from '../../../lib/github'

const HUB_CONFIG_PATH = 'hub.config.json'

// Clé Web3Forms commune à tous les sites Viseoweb.
// Les messages des formulaires de contact sont envoyés à contact@viseoweb.fr.
// Si tu changes de compte Web3Forms, mets à jour cette constante ET le
// script platform/scripts/add_contact_form_key.py.
const WEB3FORMS_KEY = 'eabd63c5-1744-4172-b8c0-8984db488f10'

// ── Formats de slugs blog acceptés ────────────────────────────────────────
// 'prefix' : URLs avec préfixe numérique aléatoire /3847-mon-article/
//            (défaut historique, évite à 99,99% les collisions sans calcul)
// 'clean'  : URLs propres /mon-article/, avec suffixage -2/-3/... si collision
//            (à activer quand on migre un WordPress existant pour conserver
//             exactement les URLs en place et ne pas casser le SEO)
// Lu côté Python par blog_publish_scheduled.py > _resolve_slug_format()
const VALID_SLUG_FORMATS = ['prefix', 'clean'] as const
type SlugFormat = typeof VALID_SLUG_FORMATS[number]

// ── Types de pages valides (refonte juin 2026) ────────────────────────────
// Cohérent avec ALL_PAGE_TYPES côté wizard (sites/new/page.tsx). Chaque type
// activé sur un site est mappé dans config.yaml > page_types vers le slug
// de la thématique choisie :
//     page_types:
//       blog: cadeau
//       classement: cadeau   # si activé
//       avis: cadeau         # si activé
// Côté Python, blog_publish_scheduled.py > load_prompts() lit ce mapping et
// résout le schema/global_prompt à utiliser pour chaque type de génération.
const VALID_PAGE_TYPES = ['blog', 'classement', 'avis', 'vs', 'local'] as const
type PageType = typeof VALID_PAGE_TYPES[number]

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

function ye(s: string): string {
  if (s === null || s === undefined) return ''
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')
}

// ── criteriaBlock : refonte juin 2026 ─────────────────────────────────────
// Avant : prenait `siteType` ('classement' ou 'comparatif').
// Maintenant : prend directement `hasClassement` calculé depuis activeTypes.
// Logique identique : si classement actif → bloc SaaS, sinon → bloc SCPI.
// (Le bloc SCPI reste utilisé en cas de site blog-only, en pratique le
// `criteria` n'est pas lu dans ce cas par les templates.)
function criteriaBlock(hasClassement: boolean, year: number): string {
  if (hasClassement) {
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

// ── seoBlock : refonte juin 2026 ──────────────────────────────────────────
// Idem que criteriaBlock : prend `hasClassement` directement. Le bloc SCPI
// est conservé en fallback pour les sites sans classement (vs/avis/blog).
function seoBlock(hasClassement: boolean, p: {
  seo_vs_title: string, seo_vs_meta: string,
  seo_avis_title: string, seo_avis_meta: string,
  seo_liste_comp_title: string, seo_liste_avis_title: string,
}): string {
  if (hasClassement) {
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

function authorBlock(authorName: string, authorJob: string, authorBio: string): string {
  if (!authorName) return ''
  return `author:
  name: "${ye(authorName)}"
  bio: "${ye(authorBio)}"
  job_title: "${ye(authorJob)}"
  photo: "/author-photo.png"
  socials: []`
}

function personaBlock(personaPrompt: string): string {
  if (!personaPrompt || !personaPrompt.trim()) return ''
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

    // ── Nouveau payload (refonte juin 2026) ───────────────────────────
    // - `thematic` remplace le couple (site_type + page_types). C'est le
    //   slug d'un schema dans platform/schemas/ (ex: "cadeau",
    //   "classement-saas", "comparatif-vs-scpi").
    // - `active_page_types` est la liste des types de pages activés sur
    //   ce site. À partir de ça, on construit dynamiquement la section
    //   page_types: du config.yaml et on choisit les templates HTML.
    thematic = '',
    active_page_types = [],

    persona_prompt = '',
    author_name: providedAuthorName = '',
    author_job = '',
    author_bio = '',
    selected_keywords = [],
    blog_slug_format: rawBlogSlugFormat = 'prefix',
  } = body

  if (!name || !domain) return NextResponse.json({ error: 'name et domain requis' }, { status: 400 })

  // ── Validation thematic + active_page_types (refonte juin 2026) ───────
  if (!thematic || typeof thematic !== 'string') {
    return NextResponse.json({ error: 'Thématique requise (slug du schema dans platform/schemas/)' }, { status: 400 })
  }
  if (!Array.isArray(active_page_types) || active_page_types.length === 0) {
    return NextResponse.json({ error: 'Au moins un type de page doit être activé (active_page_types)' }, { status: 400 })
  }
  const activeTypes: PageType[] = (active_page_types as unknown[])
    .filter((t): t is PageType => typeof t === 'string' && (VALID_PAGE_TYPES as readonly string[]).includes(t))
  if (activeTypes.length === 0) {
    return NextResponse.json({
      error: `Aucun type de page valide. Valides : ${VALID_PAGE_TYPES.join(', ')}`,
    }, { status: 400 })
  }

  // ── Validation thematic : doit exister dans platform/schemas/ ─────────
  // Évite la création d'un site qui pointe vers un schema inexistant
  // (page_types.<X>: <thematic> ne servirait à rien et load_prompts()
  // côté Python tomberait sur un FileNotFoundError silencieux).
  const thematicSlug = slugify(thematic)
  const thematicFile = await getFile(`platform/schemas/${thematicSlug}.json`)
  if (!thematicFile) {
    return NextResponse.json({
      error: `Thématique introuvable : platform/schemas/${thematicSlug}.json. Crée-la d'abord via /templates/new.`,
    }, { status: 400 })
  }

  // ── Validation blog_slug_format ────────────────────────────────────────
  // Sanitisation : on accepte uniquement 'prefix' | 'clean'. Toute autre
  // valeur (vide, undefined, typo) → fallback 'prefix' (défaut historique,
  // 100% rétro-compat avec les sites existants).
  const blogSlugFormat: SlugFormat = (VALID_SLUG_FORMATS as readonly string[]).includes(rawBlogSlugFormat)
    ? rawBlogSlugFormat as SlugFormat
    : 'prefix'

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

  // ── Sélection conditionnelle des templates HTML ──────────────────────
  // tplMain est utilisé pour les pages individuelles (VS, classements).
  // Le code Python (generate.py) distingue les deux modes via la présence
  // de "classement" dans le nom du template.
  //   - Si classement activé → 'classement-saas.html.j2' (génère pages classement)
  //   - Sinon → 'comparatif-vs-scpi.html.j2' (génère pages VS individuelles
  //     si des products existent, sinon rien)
  const hasClassement = activeTypes.includes('classement')
  const hasVs = activeTypes.includes('vs')
  const hasAvis = activeTypes.includes('avis')
  const onlyBlog = activeTypes.length === 1 && activeTypes[0] === 'blog'
  const tplMain = hasClassement ? 'classement-saas.html.j2' : 'comparatif-vs-scpi.html.j2'

  // tplIndex est utilisé pour la page d'accueil du site.
  // Priorité (top-down) :
  //   - UNIQUEMENT blog activé → 'index-blog.html.j2' (neutre, créé juin
  //     2026 pour la migration cadeauclic.com et autres sites blog-only)
  //   - Classement activé → 'index-saas.html.j2' (home SaaS legacy)
  //   - Sinon (vs/avis seuls) → 'index-scpi.html.j2' (home SCPI legacy)
  // Note : si un index custom 'index-<id>.html.j2' existe dans
  // platform/templates/, il peut être référencé manuellement dans le
  // config.yaml après création (cf. backlog homes personnalisées par
  // site, notamment cadeauclic.com prévu en design custom plus tard).
  let tplIndex: string
  if (onlyBlog) tplIndex = 'index-blog.html.j2'
  else if (hasClassement) tplIndex = 'index-saas.html.j2'
  else tplIndex = 'index-scpi.html.j2'

  // ── Construction dynamique de page_types ─────────────────────────────
  // À partir des types activés, on génère un mapping <type>: <thematic>
  // dans le config.yaml. Une même thématique peut être réutilisée pour
  // plusieurs types de pages (un seul global_prompt pour tout le site).
  //
  // Côté Python, blog_publish_scheduled.py > load_prompts() lit ce
  // mapping :
  //     page_types = config.get("page_types") or {}
  //     template_name = page_types.get("classement") or page_types.get("blog")
  // Donc l'ordre dans le YAML n'importe pas, mais classement/blog sont
  // les clés actuellement consommées en priorité côté générateurs.
  const pageTypesBlock = activeTypes
    .map(t => `  ${t}: ${thematicSlug}`)
    .join('\n')
  const pageTypesYaml = `page_types:\n${pageTypesBlock}\n\n`

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

  const personaYaml = personaBlock(persona_prompt)
  const authorYaml = authorBlock(authorName, author_job, author_bio)

  // ── Description du site dans le header du config.yaml ────────────────
  // Plus de "Type : classement (SaaS) / comparatif (SCPI legacy)" qui était
  // un raccourci ambigu. Maintenant on documente clairement la thématique
  // et les types activés, ce qui facilite la lecture du config pour debug.
  const configYaml = `# ============================================================
# CONFIG SITE -- ${id}
# Thématique     : ${thematicSlug}
# Types activés  : ${activeTypes.join(', ')}
# Templates HTML : ${tplMain} (pages) / ${tplIndex} (home)
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
  blog_slug_format: "${blogSlugFormat}"
  author_name: "${ye(authorName)}"
  home_title: "${ye(home_title || `${name} | Comparatifs ${year}`)}"
  home_description: "${ye(home_description)}"
  template: "${tplMain}"
  index_template: "${tplIndex}"
  analytics_clicky: ""
  contact_form_key: "${WEB3FORMS_KEY}"

${pageTypesYaml}${themeYaml}

${criteriaBlock(hasClassement, year)}

tag_classes:
  rendement: "tag-rendement"
  diversifiee: "tag-diversifiee"
  specialisee: "tag-specialisee"
  europeenne: "tag-europeenne"

${seoBlock(hasClassement, { seo_vs_title, seo_vs_meta, seo_avis_title, seo_avis_meta, seo_liste_comp_title, seo_liste_avis_title })}
${personaYaml ? '\n' + personaYaml + '\n' : ''}${authorYaml ? '\n' + authorYaml + '\n' : ''}`

  const files: [string, string, string][] = [
    [`platform/sites/${id}/config.yaml`, configYaml, `HUB: Create site ${name}`],
    [`platform/sites/${id}/editorial.json`, '{}', `HUB: Init editorial ${name}`],
    [`platform/sites/${id}/products_editorial.json`, '{}', `HUB: Init products_editorial ${name}`],
    [`platform/sites/${id}/site_editorial.json`, '{}', `HUB: Init site_editorial ${name}`],
  ]

  // ── enabled_classements.json (créé seulement si classement activé) ───
  // Inchangé sauf la condition : `hasClassement` au lieu de `isClassement`.
  if (hasClassement && Array.isArray(selected_keywords) && selected_keywords.length > 0) {
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

  // ── Construction du newSite stocké dans hub.config.json ──────────────
  // - Champs nouveaux (modèle actuel) : `thematic`, `active_page_types`
  // - Champ `site_type` conservé pour rétro-compat avec les composants du
  //   dashboard qui pourraient encore lire cet attribut (badges, filtres
  //   dans /sites). Calculé : 'classement' si hasClassement, sinon 'comparatif'.
  // - `page_types` reconstruit en mapping pour rétro-compat similaire.
  // - `niche` : par défaut = thematicSlug (le champ niche du form n'est
  //   plus utilisé par le wizard refondu, on garde au cas où).
  const pageTypesObject = Object.fromEntries(activeTypes.map(t => [t, thematicSlug]))
  const newSite = {
    id, name, niche: niche || thematicSlug,
    domain: domainClean, sheet_csv_url: sheet_csv_url || '',
    description: description || '', status: 'pending_generation',
    thematic: thematicSlug,
    active_page_types: activeTypes,
    site_type: hasClassement ? 'classement' : 'comparatif',
    blog_slug_format: blogSlugFormat,
    created_at: new Date().toISOString(),
    page_types: pageTypesObject,
  }
  hubConfig.sites.push(newSite)
  hubConfig.updated_at = new Date().toISOString()
  await putFile(HUB_CONFIG_PATH, JSON.stringify(hubConfig, null, 2), `HUB: Add site ${name}`)

  await triggerWorkflow('generate-site.yml', { site: id })

  return NextResponse.json({ site: newSite })
}
