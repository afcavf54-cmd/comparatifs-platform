"""
codes_promo_engine.py — Moteur de codes promo pour la plateforme comparatifs.

Format marque :
    platform/sites/<site>/codes_promo/<marque-slug>.md
    ──────────────────────────────────────────────────
    ---
    marque: "SHEIN"
    slug: "shein"
    categorie_marque: "Mode"
    url_marchand: "https://..."
    url_affiliation: "https://...?ref=xyz"  # optionnel, sinon url_marchand est utilisée
    logo_url: "/codes-promo/shein/logo.png"
    description_marque: "..."
    avis_sophie: "..."             # généré par IA, éditable
    conseil_sophie: "..."          # généré par IA, éditable
    rating:
      value: 4.7
      count: 142
    codes:
      - id: "c1"
        type: "code"               # code | offer
        valeur: 30                 # nombre
        unite: "%"                 # % | €
        sous_type: "Code promo"    # libellé (Code promo / Bon plan / Cashback / Livraison gratuite / Autre)
        accroche: "..."            # H3 de la card
        code: "GIFT30"             # vide si type=offer
        detail: "..."              # texte accordéon
        expire_le: "2026-06-30"
        nb_utilisations: 1240
        teste_par_sophie: "..."    # optionnel
        meilleure_remise: false
        expired: false
    faq:
      - question: "..."
        reponse: "..."
    historique_12_mois:
      - { mois: "2025-07", valeur: 25 }
      ...
    related_brands: ["zalando", "asos", ...]  # figé au 1er rendu, override manuel
    status: "published"            # draft | published
    ---

    # Comment utiliser un code promo <MARQUE>  ← contenu généré par IA
    ...

Une marque = 1 page web /codes-promo/<slug>/

Ce module est neutre : il ne fait que lire les .md, parser, et exposer les
helpers. Le rendering est dans le template Jinja, l'orchestration dans
generate.py.
"""
from __future__ import annotations
import re
import datetime as _dt
from pathlib import Path


# ═══════════════════════════════════════════════════════════════════════════
# PARSING
# ═══════════════════════════════════════════════════════════════════════════

def parse_brand(filepath: Path) -> dict | None:
    """Lit un fichier .md, retourne le dict de la marque avec les dérivés.
    Retourne None si parse échoue ou frontmatter manquant."""
    try:
        raw = filepath.read_text(encoding='utf-8')
    except Exception:
        return None

    m = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)$', raw, re.DOTALL)
    if not m:
        return None
    fm_text, body = m.group(1), m.group(2)

    try:
        import yaml
        fm = yaml.safe_load(fm_text) or {}
    except Exception:
        return None
    if not isinstance(fm, dict):
        return None

    brand = dict(fm)
    brand['content_md'] = body.strip()
    brand['content_html'] = _md_to_html(body.strip())
    brand['filepath'] = str(filepath)

    # Slug : si absent, dérivé du nom de fichier (sans .md)
    if not brand.get('slug'):
        brand['slug'] = filepath.stem

    # Normaliser codes / faq / historique en listes
    brand['codes'] = brand.get('codes') or []
    brand['faq'] = brand.get('faq') or []
    brand['historique_12_mois'] = brand.get('historique_12_mois') or []
    brand['related_brands'] = brand.get('related_brands') or []

    # Séparer codes actifs et expirés (utilisé par le template)
    brand['codes_actifs'] = [c for c in brand['codes'] if not c.get('expired')]
    brand['codes_expires'] = [c for c in brand['codes'] if c.get('expired')]

    # Comptages pour les tabs (Tout / Codes / Offres)
    brand['n_codes'] = sum(1 for c in brand['codes_actifs'] if c.get('type') == 'code')
    brand['n_offres'] = sum(1 for c in brand['codes_actifs'] if c.get('type') == 'offer')
    brand['n_total'] = brand['n_codes'] + brand['n_offres']

    # URL CTA : url_affiliation si présente, sinon url_marchand
    brand['url_cta'] = (brand.get('url_affiliation') or '').strip() or (brand.get('url_marchand') or '').strip()

    # Date de mise à jour parsée
    brand['date_maj_obj'] = _parse_date(brand.get('date_maj') or brand.get('date_creation') or '')

    return brand


def load_all_brands(site_dir: Path, include_drafts: bool = False) -> list[dict]:
    """Charge toutes les marques de codes_promo/, triées par date_maj desc.
    Filtre les drafts sauf si include_drafts=True."""
    cp_dir = site_dir / 'codes_promo'
    if not cp_dir.exists():
        return []
    brands = []
    for fp in cp_dir.glob('*.md'):
        b = parse_brand(fp)
        if not b:
            continue
        if not include_drafts and (b.get('status') or 'published').lower() == 'draft':
            continue
        brands.append(b)
    brands.sort(key=lambda b: b.get('date_maj_obj') or _dt.datetime.min, reverse=True)
    return brands


def _parse_date(s) -> _dt.datetime | None:
    """Parse souple de date (YYYY-MM-DD, ISO, ou rien)."""
    if isinstance(s, _dt.datetime):
        return s.replace(tzinfo=None) if s.tzinfo else s
    if isinstance(s, _dt.date):
        return _dt.datetime.combine(s, _dt.time.min)
    txt = str(s or '').strip()
    if not txt:
        return None
    try:
        d = _dt.datetime.fromisoformat(txt.replace('Z', '+00:00'))
        return d.replace(tzinfo=None) if d.tzinfo else d
    except Exception:
        pass
    for fmt in ('%Y-%m-%d', '%d/%m/%Y'):
        try:
            return _dt.datetime.strptime(txt, fmt)
        except ValueError:
            continue
    return None


# ═══════════════════════════════════════════════════════════════════════════
# RELATED BRANDS — résolution des slugs en données complètes pour le template
# ═══════════════════════════════════════════════════════════════════════════

def resolve_related_brands(brand: dict, all_brands: list[dict], n: int = 8) -> list[dict]:
    """Résout brand['related_brands'] (liste de slugs) en dicts complets.

    Si la liste est vide → calcule automatiquement n marques de la même
    `categorie_marque` (aléatoire mais figé via persist). Sinon, on respecte
    l'ordre choisi par l'utilisateur dans le dashboard.

    Retourne max n marques. Format de chaque entrée :
      {marque, slug, logo_url, n_total, best_offer_label}
    où best_offer_label = "Jusqu'à -X%" ou "Livraison offerte" etc. dérivé
    automatiquement des codes actifs de la marque cible.
    """
    by_slug = {b['slug']: b for b in all_brands if b.get('slug')}
    src_slug = brand.get('slug', '')

    chosen_slugs = list(brand.get('related_brands') or [])
    if not chosen_slugs:
        # Auto-pick : même catégorie_marque, hors soi-même, aléatoire mais
        # stable (random.seed du slug → ordre reproductible build après build
        # tant qu'aucune nouvelle marque n'est ajoutée dans la catégorie).
        import random
        cat = (brand.get('categorie_marque') or '').strip().lower()
        if not cat:
            return []
        pool = [b for b in all_brands
                if b.get('slug') and b['slug'] != src_slug
                and (b.get('categorie_marque') or '').strip().lower() == cat]
        rng = random.Random(src_slug)  # seed déterministe = slug du post source
        rng.shuffle(pool)
        chosen_slugs = [b['slug'] for b in pool[:n]]
        # Persiste dans le frontmatter pour figer la sélection au 1er rendu
        if chosen_slugs:
            _persist_related_brands(Path(brand['filepath']), chosen_slugs)

    out = []
    for slug in chosen_slugs[:n]:
        b = by_slug.get(slug)
        if not b:
            continue  # marque référencée mais supprimée → on ignore
        out.append({
            'marque': b.get('marque', slug),
            'slug': slug,
            'logo_url': b.get('logo_url', ''),
            'n_total': b.get('n_total', 0),
            'categorie_marque': b.get('categorie_marque', ''),
            'best_offer_label': _best_offer_label(b),
        })
    return out


def _best_offer_label(brand: dict) -> str:
    """Génère un libellé court de la meilleure offre courante pour la card
    'marques similaires'. Format :
    - "Jusqu'à -X%" si le meilleur code/offre est en %
    - "X€ offerts" si en €
    - "Livraison offerte" si type spécial
    - "" sinon
    """
    codes = brand.get('codes_actifs') or []
    if not codes:
        return ''
    # Cherche d'abord celui marqué meilleure_remise
    best = next((c for c in codes if c.get('meilleure_remise')), None)
    if not best:
        # Sinon, prendre celui avec la plus grande valeur en %
        pct_codes = [c for c in codes if c.get('unite') == '%' and isinstance(c.get('valeur'), (int, float))]
        if pct_codes:
            best = max(pct_codes, key=lambda c: c.get('valeur', 0))
    if not best:
        # Fallback : prendre le 1er
        best = codes[0]

    sous_type = (best.get('sous_type') or '').lower()
    if 'livraison' in sous_type:
        return 'Livraison offerte'
    val = best.get('valeur')
    unite = best.get('unite', '')
    if val and unite == '%':
        return f"Jusqu'à -{int(val)}%"
    if val and unite == '€':
        return f"{int(val)}€ offerts"
    return best.get('sous_type', '')


def _persist_related_brands(filepath: Path, slugs: list[str]) -> None:
    """Réécrit le frontmatter du .md en figeant related_brands."""
    try:
        raw = filepath.read_text(encoding='utf-8')
        m = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)$', raw, re.DOTALL)
        if not m:
            return
        fm_text, body = m.group(1), m.group(2)
        import yaml
        fm = yaml.safe_load(fm_text) or {}
        fm['related_brands'] = slugs
        new_fm = yaml.dump(fm, allow_unicode=True, default_flow_style=False, sort_keys=False).strip()
        filepath.write_text(f"---\n{new_fm}\n---\n{body}", encoding='utf-8')
    except Exception:
        pass  # Échec silencieux : pas de blocage du build


# ═══════════════════════════════════════════════════════════════════════════
# MARKDOWN → HTML (minimal pour la section "Comment utiliser")
# ═══════════════════════════════════════════════════════════════════════════

def _md_to_html(md: str) -> str:
    """Convertit le body markdown (Comment utiliser) en HTML.
    Détecte les <h2>/<h3> en markdown (## et ###) et convertit. Détecte
    aussi le HTML déjà présent (laissé tel quel par RichEditor)."""
    if not md:
        return ''
    if re.search(r'<(p|h[1-6]|ul|ol|div)\b', md, re.I):
        return md
    text = md
    text = re.sub(r'\*\*([^*\n]+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'(?<!\*)\*([^*\n]+?)\*(?!\*)', r'<em>\1</em>', text)
    lines = text.split('\n')
    out = []
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if line.startswith('### '):
            out.append(f'<h3>{line[4:].strip()}</h3>'); i += 1; continue
        if line.startswith('## '):
            out.append(f'<h2>{line[3:].strip()}</h2>'); i += 1; continue
        if line.startswith('# '):
            out.append(f'<h1>{line[2:].strip()}</h1>'); i += 1; continue
        if re.match(r'^[-*]\s+', line):
            items = []
            while i < len(lines) and re.match(r'^[-*]\s+', lines[i].rstrip()):
                items.append(re.sub(r'^[-*]\s+', '', lines[i].rstrip()))
                i += 1
            out.append('<ul>' + ''.join(f'<li>{it}</li>' for it in items) + '</ul>')
            continue
        if not line:
            i += 1; continue
        para = [line]
        i += 1
        while i < len(lines):
            nxt = lines[i].rstrip()
            if not nxt or nxt.startswith('#') or re.match(r'^[-*]\s+', nxt):
                break
            para.append(nxt); i += 1
        out.append(f'<p>{" ".join(para).strip()}</p>')
    return '\n'.join(out)


# ═══════════════════════════════════════════════════════════════════════════
# COMMENT UTILISER → 4 étapes structurées pour le rendu en `step` cards
# ═══════════════════════════════════════════════════════════════════════════

def extract_steps_from_content(brand: dict) -> list[dict]:
    """Extrait les étapes du body 'Comment utiliser X' pour les rendre en
    cards numérotées dans le template. Cherche les <h2>/<h3> ou les
    paragraphes qui suivent un pattern d'étape.

    Retourne une liste de {num, html} où `html` est le contenu HTML du
    paragraphe sous le titre."""
    html = brand.get('content_html', '')
    if not html:
        return []
    # Pattern 1 : <h2>Étape N</h2> ou <h3>Étape N</h3> suivis d'un <p>
    pat = re.compile(r'<h[23][^>]*>\s*(?:Étape\s+)?(\d+)[\s.\-:]*(.*?)\s*</h[23]>\s*((?:<p[^>]*>.+?</p>\s*)+)',
                     re.IGNORECASE | re.DOTALL)
    steps = []
    for m in pat.finditer(html):
        num = m.group(1)
        # Récupère 1er paragraphe (suffit visuellement, multi-paragraphes c'est rare)
        p_html = m.group(3)
        first_p = re.search(r'<p[^>]*>(.*?)</p>', p_html, re.DOTALL)
        if first_p:
            steps.append({'num': int(num), 'html': first_p.group(1).strip()})

    if steps:
        return steps[:6]  # max 6 étapes

    # Pattern 2 : si aucun match, on découpe tous les <p> du content_html
    # et on numérote arbitrairement (fallback minimal)
    ps = re.findall(r'<p[^>]*>(.+?)</p>', html, re.DOTALL)
    return [{'num': i + 1, 'html': p.strip()} for i, p in enumerate(ps[:4])]


# ═══════════════════════════════════════════════════════════════════════════
# FORMATAGE DATE FR (pour "vérifié le 15 juin 2026")
# ═══════════════════════════════════════════════════════════════════════════

_MONTHS_FR = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
              'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']


def format_date_fr(d) -> str:
    """Formate une date en français : '15 juin 2026'."""
    obj = _parse_date(d) if not isinstance(d, _dt.datetime) else d
    if not obj or obj == _dt.datetime.min:
        return ''
    return f"{obj.day} {_MONTHS_FR[obj.month]} {obj.year}"


def format_mois_court_fr(mois_iso: str) -> str:
    """'2026-06' → 'juin' (pour les labels du graphique historique)."""
    try:
        m = int(mois_iso.split('-')[1])
        return _MONTHS_FR[m][:3].capitalize()
    except Exception:
        return mois_iso


# ═══════════════════════════════════════════════════════════════════════════
# RICH SNIPPETS — Génération du JSON-LD pour une marque
# ═══════════════════════════════════════════════════════════════════════════

def build_jsonld_blocks(brand: dict, site_url: str) -> list[dict]:
    """Construit la liste des blocs JSON-LD pour la page d'une marque.
    Retourne une liste de dicts (1 par schema) que le template sérialisera
    en <script type="application/ld+json">.

    Schemas émis :
    - BreadcrumbList (Accueil > Codes promo > Marque)
    - ItemList (les codes et offres de la marque)
    - AggregateRating + Review (Sophie)
    - FAQPage (si ≥ 2 questions)
    """
    blocks = []
    site_url = site_url.rstrip('/')
    page_url = f"{site_url}/codes-promo/{brand['slug']}/"
    marque = brand.get('marque', '')

    # 1. BreadcrumbList
    blocks.append({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Accueil", "item": f"{site_url}/"},
            {"@type": "ListItem", "position": 2, "name": "Codes promo", "item": f"{site_url}/codes-promo/"},
            {"@type": "ListItem", "position": 3, "name": marque, "item": page_url},
        ],
    })

    # 2. ItemList des codes/offres
    items = []
    for i, c in enumerate(brand.get('codes_actifs', []), 1):
        offer = {
            "@type": "ListItem",
            "position": i,
            "item": {
                "@type": "Offer",
                "name": c.get('accroche', ''),
                "description": (c.get('detail') or '').strip(),
                "url": brand.get('url_cta', page_url),
                "seller": {"@type": "Organization", "name": marque},
            },
        }
        if c.get('expire_le'):
            offer["item"]["validThrough"] = c['expire_le']
        if c.get('code') and c.get('type') == 'code':
            offer["item"]["category"] = "Coupon"
        blocks.append(offer["item"])  # on émet aussi chaque Offer en bloc séparé
        items.append(offer)
    if items:
        blocks.append({
            "@context": "https://schema.org",
            "@type": "ItemList",
            "itemListElement": items,
        })

    # 3. AggregateRating + Review (Sophie)
    rating = brand.get('rating') or {}
    rv = rating.get('value')
    rc = rating.get('count')
    if rv and rc:
        product_block = {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": f"Codes promo {marque}",
            "url": page_url,
            "brand": {"@type": "Brand", "name": marque},
            "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": str(rv),
                "reviewCount": str(rc),
                "bestRating": "5",
                "worstRating": "1",
            },
        }
        avis = (brand.get('avis_sophie') or '').strip()
        if avis:
            product_block["review"] = {
                "@type": "Review",
                "author": {"@type": "Person", "name": "Sophie"},
                "reviewRating": {
                    "@type": "Rating",
                    "ratingValue": "5",
                    "bestRating": "5",
                },
                "reviewBody": avis,
            }
        blocks.append(product_block)

    # 4. FAQPage (≥ 2 Q/R)
    faq = brand.get('faq') or []
    if len(faq) >= 2:
        blocks.append({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": q.get('question', ''),
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": q.get('reponse', ''),
                    },
                }
                for q in faq if q.get('question') and q.get('reponse')
            ],
        })

    return blocks


def slugify_marque(name: str) -> str:
    """Slug propre pour le nom d'une marque (utilisé à la création)."""
    import unicodedata
    s = unicodedata.normalize('NFD', str(name or ''))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.lower()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    s = re.sub(r'-+', '-', s).strip('-')
    return s or 'marque'
