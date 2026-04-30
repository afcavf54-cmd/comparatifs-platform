#!/usr/bin/env python3
"""
generate.py, Générateur de sites comparatifs statiques
Source données : Google Sheets CSV (priorité) ou products.yaml (fallback)
Textes éditoriaux : API Claude (un seul appel batch pour toutes les paires)
"""

import argparse
import csv
import io
import itertools
import json
import math
import os
import shutil
import sys
import urllib.request
from datetime import date
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape

# ── Chemins ───────────────────────────────────────────────────────────────────
ROOT          = Path(__file__).parent.parent
TEMPLATES_DIR = ROOT / "templates"
SITES_DIR     = ROOT / "sites"
SHARED_DIR    = ROOT / "sites" / "_shared"

# ── Règles éditoriales centralisées ──────────────────────────────────────────
sys.path.insert(0, str(TEMPLATES_DIR / "base"))
try:
    from _editorial_rules import format_editorial, format_text
except ImportError:
    def format_editorial(ed): return ed
    def format_text(t): return t


# ── Helpers ───────────────────────────────────────────────────────────────────
import unicodedata as _unicodedata
import re as _re

def md_to_html(text):
    if not text: return text
    import re as _re2
    lines = text.split('\n')
    result = []; in_list = False
    for line in lines:
        ls = line.strip()
        if not ls:
            if in_list: result.append('</ul>'); in_list = False
            continue
        if '[' in ls and ']' in ls: continue
        if ls.startswith('### '): 
            if in_list: result.append('</ul>'); in_list = False
            result.append('<h4>' + ls[4:] + '</h4>')
        elif ls.startswith('## ') or ls.startswith('# '):
            if in_list: result.append('</ul>'); in_list = False
            result.append('<h3>' + ls.lstrip('#').strip() + '</h3>')
        elif ls.startswith('- ') or ls.startswith('* '):
            if not in_list: result.append('<ul>'); in_list = True
            item = _re2.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', ls[2:])
            result.append('<li>' + item + '</li>')
        else:
            if in_list: result.append('</ul>'); in_list = False
            para = _re2.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', ls)
            para = _re2.sub(r'\*(.+?)\*', r'<em>\1</em>', para)
            result.append('<p>' + para + '</p>')
    if in_list: result.append('</ul>')
    return '\n'.join(result)


def slugify_cat(s: str) -> str:
    """Slugifie une catégorie en ASCII pur (gère accents, apostrophes et parenthèses)."""
    s = s.replace('\u2019', ' ').replace('\u2018', ' ').replace("'", ' ').replace("'", ' ')
    s = _re.sub(r"[()\[\]]", '', s)  # Supprimer parenthèses et crochets
    s = _unicodedata.normalize('NFD', s)
    s = s.encode('ascii', 'ignore').decode('ascii')
    s = s.lower()
    s = _re.sub(r"[^a-z0-9]+", '-', s)
    return s.strip('-')

def load_yaml(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def cast(val: str):
    if val == "" or val is None:
        return None
    try:
        return int(val)
    except ValueError:
        pass
    try:
        return float(val)
    except ValueError:
        pass
    return val


# ── Chargement Sheet CSV ───────────────────────────────────────────────────────
STRING_FIELDS = {
    'geo', 'secteurs', 'pays', 'investissement_min', 'tri_horizon',
    'nom', 'marque', 'type', 'slug', 'description', 'url_affiliation',
    'verdict_si_1', 'verdict_si_2', 'verdict_si_3', 'categorie', 'niche', 'tagline', 'essai_gratuit', 'author_name'
}

NUMERIC_FIELDS = [
    "prix_achat", "prix_retrait", "td", "tri", "pga", "tof",
    "frais_souscription", "frais_gestion", "delai_jouissance",
    "endettement", "capitalisation", "disponible", "note_redaction"
]

EDITORIAL_TEXTS = {
    "wemo-one": {
        "description": "Wemo One est la SCPI phare de Wemo Reim, lancée en 2024 avec une philosophie radicalement différente : investir uniquement dans des actifs \"small caps\" européens (moins de 5 M€ par bien), là où les grands institutionnels ne vont pas. Cette approche granulaire offre des marges de négociation supérieures et une diversification naturelle du risque locataire.\n\nCe qui distingue vraiment Wemo One, c'est l'alignement d'intérêts : chaque associé de Wemo Reim est également investisseur dans la SCPI. En 2025, cette stratégie a porté ses fruits avec un taux de distribution exceptionnel de 15,27%, le meilleur du marché.",
        "points_forts": ["TD 2025 exceptionnel : 15,27%, meilleur du marché", "Stratégie small caps : actifs < 5 M€", "TOF à 100%", "85% hors France, avantage fiscal TMI 30%+", "Gérants co-investisseurs dans leur propre SCPI"],
        "points_faibles": ["SCPI récente (2024), track record limité", "Frais de souscription de 10%", "Délai de jouissance de 6 mois", "Capitalisation encore modeste (75 M€)"],
        "verdict_si": ["Vous cherchez le TD le plus élevé du marché", "TMI à 30% ou plus", "Vous croyez à l'immobilier small cap européen", "Vous acceptez les frais d'entrée pour un rendement exceptionnel"]
    },
    "iroko-zen": {
        "description": "Iroko Zen a révolutionné le marché SCPI en supprimant totalement les frais de souscription dès 2020. Résultat : 100% du capital investi travaille immédiatement. Labellisée ISR, elle affiche un TRI de 7,49% sur 5 ans et une capitalisation de 1,35 milliard d'euros.\n\nSon portefeuille diversifié couvre commerces, bureaux, logistique et santé dans six pays européens, avec une durée d'engagement ferme des locataires de 7,3 ans à fin 2025.",
        "points_forts": ["0% de frais de souscription", "TRI 5 ans de 7,49%", "Label ISR", "Capitalisation de 1,35 Md€, liquidité solide", "Délai de jouissance de 3 mois"],
        "points_faibles": ["Ticket minimum : 5 100€ (25 parts)", "Frais de gestion de 14,4%", "Endettement de 26%", "29% France, avantage fiscal partiel"],
        "verdict_si": ["Investissement minimum de 5 100€", "TRI prime sur TD annuel", "ISR est un critère important", "Horizon 8 ans et plus"]
    },
    "comete": {
        "description": "Comète est la SCPI internationale d'Alderan, lancée en décembre 2023. Elle investit exclusivement hors France, avec une concentration au Royaume-Uni (47%), en Espagne (15%) et en Italie (12%).\n\nSa stratégie opportuniste sur marchés décotés lui a permis d'afficher un TD de 9% en 2025, parmi les meilleurs du marché. Elle cible les zones urbaines dynamiques et les pôles tertiaires à forte demande locative.",
        "points_forts": ["TD 2025 de 9%", "100% international hors France", "Stratégie opportuniste sur marchés décotés", "Diversification : UK, Espagne, Italie, Pays-Bas", "TRI cible 10 ans de 6,5%"],
        "points_faibles": ["SCPI récente (2023)", "Frais de souscription de 10%", "Exposition GBP (47% UK), risque de change", "Capitalisation modeste"],
        "verdict_si": ["Exposition internationale maximale", "TD élevé avec diversification géo", "Acceptez le risque de change UK", "Portefeuille déjà exposé à la zone euro"]
    },
    "corum-origin": {
        "description": "Corum Origin est une référence du marché depuis 2012. Pionnière de l'investissement SCPI européen, elle maintient depuis 12 ans un TD régulier grâce à une stratégie opportuniste dans des marchés profonds : Pays-Bas (27%), Portugal (15%), Estonie (13%).\n\nAvec zéro endettement et un TRI 10 ans de 6,75%, c'est la SCPI de référence pour un rendement élevé et stable sur le long terme.",
        "points_forts": ["12 ans de track record", "TRI 10 ans de 6,75%", "Zéro endettement", "Diversification 15 pays européens", "TD constant depuis 2012"],
        "points_faibles": ["Frais de souscription de 11,96%", "Prix de retrait < prix d'achat (999€ vs 1 135€)", "Délai de jouissance de 6 mois", "Prix de part élevé : 1 135€"],
        "verdict_si": ["Long historique de performance", "Régularité prime sur niveau du rendement", "Horizon 10 ans minimum", "Zéro endettement souhaité"]
    },
    "remake-live": {
        "description": "Remake Live est la SCPI sans frais de souscription de Remake AM, lancée en 2022. Avec 78% hors France, elle offre un avantage fiscal majeur pour les TMI élevées. À fin 2025, son TOF atteint 98,86% et le prix de part reste stable.\n\nL'absence totale de frais d'entrée en fait la SCPI idéale pour les versements programmés mensuels dès 204€, un ticket d'entrée parmi les plus accessibles du marché.",
        "points_forts": ["0% de frais de souscription", "TD 2025 de 7,05%", "78% hors France", "TOF de 98,86%", "Ticket minimum : 204€"],
        "points_faibles": ["Frais de gestion de 18% TTC", "SCPI récente (2022)", "TRI cible 7%, non encore démontré sur la durée"],
        "verdict_si": ["Versements programmés dès 204€/mois", "TMI à 30% ou plus", "0% frais d'entrée sans compromis sur rendement", "Débutant en SCPI"]
    },
    "iroko-atlas": {
        "description": "Iroko Atlas est la petite sœur d'Iroko Zen, lancée en 2025 avec une ambition encore plus internationale : 100% hors de France. Même modèle sans frais, même approche ISR. En quelques mois, elle a constitué 12 actifs dans 6 pays européens.\n\nSa répartition actuelle : Royaume-Uni (31%), Pays-Bas (29%), Espagne (13%). Forte orientation commerces (56%). TRI cible de 7% sur 10 ans.",
        "points_forts": ["0% de frais de souscription", "100% hors de France", "TOF à 100%", "TRI cible 10 ans de 7%", "Même équipe qu'Iroko Zen"],
        "points_faibles": ["SCPI très récente (2025), aucun track record", "Capitalisation faible (77,4 M€)", "Délai de jouissance de 5 mois", "Risque de change GBP (31% UK)"],
        "verdict_si": ["Confiance en l'équipe Iroko", "Exposition 100% internationale", "TMI élevée, optimisation fiscale", "Acceptez le risque d'une SCPI naissante"]
    },
    "log-in": {
        "description": "Log In est la seule SCPI exclusivement logistique et industrielle à l'échelle européenne, gérée par Theoreim en partenariat avec Principal Real Estate Europe. Elle s'inscrit dans la vague de réindustrialisation européenne.\n\nSon portefeuille est concentré en Italie (29%), Espagne (27%) et Royaume-Uni (24%), avec une répartition sectorielle dominée par les locaux d'activité (70%) et la logistique (24%).",
        "points_forts": ["Thématique unique : logistique 100% européenne", "Réindustrialisation européenne, tendance structurelle", "TOF à 100%", "PGA de 8,21%", "Double expertise Theoreim + Principal Real Estate"],
        "points_faibles": ["TRI cible 10 ans de 5%, modeste", "Frais de souscription de 10%", "Ticket minimum de 1 020€", "Secteur cyclique"],
        "verdict_si": ["Conviction sur la logistique en Europe", "Exposition sectorielle différenciante", "Complément d'un portefeuille diversifié", "Horizon long terme sur thématique industrielle"]
    },
    "transitions-europe": {
        "description": "Transitions Europe est la SCPI d'Arkéa REIM pensée pour capter les mutations de l'immobilier européen. 100% hors France, elle investit dans les actifs des nouveaux usages : bureaux repensés, logistique urbaine, commerces de proximité.\n\nEspagne (36%), Allemagne (21%) et Pays-Bas (15%) constituent son cœur de portefeuille. TD de 7,60% en 2025 grâce à des acquisitions sur marchés corrigés.",
        "points_forts": ["TD 2025 de 7,60%", "100% hors de France", "Marchés décotés, potentiel de revalorisation", "Frais de gestion compétitifs : 10% TTC", "Diversification sectorielle complète"],
        "points_faibles": ["Prix de retrait < prix d'achat (181,80€ vs 202€)", "Frais de souscription de 10%", "Pas de TRI communiqué"],
        "verdict_si": ["TD élevé + exposition 100% européenne", "Rebond immobilier européen post-correction", "Frais de gestion compétitifs", "Construction d'un portefeuille diversifié"]
    },
    "principal-inside": {
        "description": "Principal Inside est la première SCPI à investir des deux côtés de l'Atlantique, gérée par Principal Real Estate (600 Md$ d'actifs). SCPI récente en phase de déploiement, avec 100% USA pour l'instant.\n\nThématique santé (58%), secteur défensif porté par le vieillissement démographique. La diversification Europe viendra progressivement. Cashback de 5% via Louveinvest.",
        "points_forts": ["Exposition unique aux États-Unis", "Gestionnaire mondial : 600 Md$ d'AUM", "Thématique santé (58%), défensif", "TRI cible 10 ans de 6,50%", "Cashback de 5% via Louveinvest"],
        "points_faibles": ["Aucun track record de distribution", "100% USA, risque de change USD/EUR", "Frais de souscription de 10%", "TD cible 6%, en dessous de la moyenne", "Diversification Europe à venir"],
        "verdict_si": ["Exposition aux États-Unis recherchée", "Confiance en un gestionnaire mondial", "Thématique santé convaincante", "Horizon 10 ans minimum"]
    },
    "upeka": {
        "description": "Upêka est la SCPI value-add d'Axipit Real Estate Partners (2023). Stratégie opportuniste : acquérir des actifs décotés à fort potentiel, les repositionner. 0% de frais de souscription, frais de sortie dégressifs (disparus après 6 ans).\n\nTD de 5,71% en 2025, modeste, mais le potentiel de revalorisation est le vrai argument. Cashback de 3% via Louveinvest.",
        "points_forts": ["0% de frais de souscription", "Frais de sortie dégressifs, disparus après 6 ans", "Stratégie value-add, potentiel de plus-value", "TRI cible 10 ans de 6,50%", "Cashback de 3% via Louveinvest"],
        "points_faibles": ["TD 2025 de 5,71%, en dessous des meilleures SCPI", "Frais de gestion de 18% TTC", "SCPI récente (2023)", "Rendement différé dans le temps"],
        "verdict_si": ["Valorisation du capital à long terme", "0% frais avec gestionnaire actif", "Value-add sur marché immobilier baissier", "Horizon 8 ans minimum"]
    }
}


def load_products_from_sheet(csv_url: str) -> list | None:
    try:
        print("  📥 Chargement Sheet CSV...")
        req = urllib.request.Request(
            csv_url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; SCPI-Generator/1.0)"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            text = resp.read().decode("utf-8")

        reader   = csv.DictReader(io.StringIO(text))
        products = []
        for row in reader:
            slug = row.get("slug", "").strip()
            if not slug:
                continue
            prod = {}
            for k, v in row.items():
                k = k.strip()
                if not k:
                    continue
                v = v.strip()
                prod[k] = v if k in STRING_FIELDS else cast(v)
            if str(prod.get("disponible", "1")) == "0":
                continue
            products.append(prod)

        print(f"  ✓ Sheet : {len(products)} produits chargés")

        for prod in products:
            for field in NUMERIC_FIELDS:
                val = prod.get(field)
                if val is not None and val != "":
                    try:
                        prod[field] = float(str(val).replace(",", "."))
                    except (ValueError, TypeError):
                        pass

            # Injecte textes éditoriaux fallback (seront remplacés par AI si disponible)
            slug = prod.get("slug", "")
            if slug in EDITORIAL_TEXTS:
                ed = EDITORIAL_TEXTS[slug]
                if not prod.get("description"):
                    prod["description"] = ed["description"]
                if not prod.get("points_forts"):
                    prod["points_forts"] = ed["points_forts"]
                if not prod.get("points_faibles"):
                    prod["points_faibles"] = ed["points_faibles"]

            # verdict_si
            if not prod.get("verdict_si"):
                vs = [prod.get(f"verdict_si_{i}") for i in range(1, 4)]
                vs = [v for v in vs if v and str(v).strip()]
                if not vs and slug in EDITORIAL_TEXTS:
                    vs = EDITORIAL_TEXTS[slug].get("verdict_si", [])
                if not vs:
                    if prod.get("frais_souscription") == 0:
                        vs.append("Vous souhaitez éviter les frais d'entrée")
                    if prod.get("td") and float(prod.get("td", 0)) >= 7:
                        vs.append("Vous cherchez un rendement élevé")
                    vs.append("Vous souhaitez diversifier votre patrimoine immobilier")
                prod["verdict_si"] = vs

        return products

    except Exception as e:
        print(f"  ⚠ Sheet indisponible ({e}) → fallback products.yaml")
        return None


# ── Génération éditoriale batch ────────────────────────────────────────────────
def load_editorial(site_dir: Path) -> dict:
    """Charge editorial.json depuis le dossier du site et applique les règles éditoriales."""
    editorial_path = site_dir / "editorial.json"
    if editorial_path.exists():
        with open(editorial_path, encoding="utf-8") as f:
            data = json.load(f)
        # Applique les règles éditoriales centralisées (paragraphes, gras...)
        data = {k: format_editorial(v) for k, v in data.items()}
        print(f"  ✓ editorial.json : {len(data)} paires chargées")
        return data
    print("  ⚠ editorial.json absent, textes fallback")
    return {}


# ── SEO ────────────────────────────────────────────────────────────────────────
def build_seo(site: dict, seo_config: dict, prod_a: dict, prod_b: dict) -> dict:
    year = site["year"]
    return {
        "title": seo_config["title_pattern"]
            .replace("{A}", str(prod_a["nom"])).replace("{B}", str(prod_b["nom"])).replace("{year}", str(year)),
        "meta": seo_config["meta_pattern"]
            .replace("{A}", str(prod_a["nom"])).replace("{B}", str(prod_b["nom"])).replace("{year}", str(year)),
        "h1": seo_config["h1_pattern"]
            .replace("{A}", str(prod_a["nom"])).replace("{B}", str(prod_b["nom"])).replace("{year}", str(year)),
        "intro": seo_config["intro_pattern"]
            .replace("{A}", str(prod_a["nom"])).replace("{B}", str(prod_b["nom"]))
            .replace("{prix_a}", f"{prod_a.get('prix_achat', '')}€")
            .replace("{prix_b}", f"{prod_b.get('prix_achat', '')}€"),
    }


def build_related_pages(slug_a: str, slug_b: str, products: list, max_items: int = 8) -> list:
    related = []
    for p in products:
        s = p["slug"]
        if s in (slug_a, slug_b):
            continue
        # Trier les slugs pour correspondre au nom de fichier réel
        pair = sorted([slug_a, s])
        related.append({
            "url":   f"{pair[0]}-vs-{pair[1]}",
            "label": f"{products_by_slug(products, slug_a)['nom']} vs {p['nom']}"
        })
        if len(related) >= max_items:
            break
    return related


def products_by_slug(products: list, slug: str) -> dict:
    return next((p for p in products if p["slug"] == slug), None)


def generate_sitemap(site: dict, pairs: list, products: list, output_dir: Path, config: dict = None) -> None:
    # Construire le domain avec www_preference
    raw_domain = site["domain"].rstrip("/")
    www_pref = (config or {}).get("www_preference", site.get("www_preference", "www"))
    # Normaliser le domaine selon www_preference
    import re as _re
    bare = _re.sub(r"^https?://(www\.)?", "", raw_domain)
    if www_pref == "www":
        domain = f"https://www.{bare}"
    else:
        domain = f"https://{bare}"

    today  = date.today().isoformat()
    is_classement = any(p.get("categorie") for p in products)

    def url(loc, priority="0.8", changefreq="monthly"):
        return (
            f"  <url>\n"
            f"    <loc>{loc}</loc>\n"
            f"    <lastmod>{today}</lastmod>\n"
            f"    <changefreq>{changefreq}</changefreq>\n"
            f"    <priority>{priority}</priority>\n"
            f"  </url>"
        )

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        url(f"{domain}/", "1.0", "weekly"),
    ]

    if is_classement:
        # Pages classement
        lines.append(url(f"{domain}/nos-comparateurs", "0.9", "weekly"))
        categories_seen = set()
        for prod in products:
            cat = prod.get("categorie", "").strip()
            if cat and cat not in categories_seen:
                cat_slug = slugify_cat(cat)
                lines.append(url(f"{domain}/meilleur-{cat_slug}", "0.85", "weekly"))
                categories_seen.add(cat)
    else:
        # Pages SCPI
        lines.append(url(f"{domain}/comparatifs-scpi", "0.9", "weekly"))
        lines.append(url(f"{domain}/avis-scpi", "0.9", "weekly"))
        for prod in products:
            lines.append(url(f"{domain}/avis-{prod['slug']}", "0.7", "monthly"))
        for slug_a, slug_b in pairs:
            lines.append(url(f"{domain}/{slug_a}-vs-{slug_b}", "0.8", "monthly"))

    lines += [
        url(f"{domain}/mentions-legales", "0.3", "yearly"),
        url(f"{domain}/politique-confidentialite", "0.3", "yearly"),
        url(f"{domain}/contact", "0.4", "yearly"),
        "</urlset>",
    ]
    (output_dir / "sitemap.xml").write_text("\n".join(lines), encoding="utf-8")
    print(f"  ✓ sitemap.xml ({len(pairs)} comparatifs + {len(products)} avis + pages liste)")


def cleanup_removed_products(output_dir: Path, site_dir: Path, products: list, all_pairs: list) -> None:
    """Supprime les fichiers HTML et entrées editorial.json des produits supprimés."""
    current_slugs = {p["slug"] for p in products}

    # Fichiers HTML attendus
    expected_files = set()
    expected_files.add("index.html")
    expected_files.add("sitemap.xml")
    expected_files.add("_redirects")
    expected_files.add("sheets.js")
    expected_files.add("favicon.svg")
    expected_files.add("favicon.png")
    expected_files.add("favicon.ico")
    expected_files.add("comparatifs-scpi.html")
    expected_files.add("avis-scpi.html")
    expected_files.add("plan-du-site.html")
    expected_files.add("mentions-legales.html")
    expected_files.add("politique-confidentialite.html")
    expected_files.add("contact.html")
    expected_files.add("404.html")
    expected_files.add("nos-comparateurs.html")
    # Pages classement
    cats_seen = set()
    for prod in products:
        cat = prod.get("categorie", "").strip()
        if cat and cat not in cats_seen:
            cats_seen.add(cat)
            expected_files.add(f"meilleur-{slugify_cat(cat)}.html")
    for slug in current_slugs:
        expected_files.add(f"avis-{slug}.html")
        expected_files.add(f"{slug}.png")
    for slug_a, slug_b in all_pairs:
        expected_files.add(f"{slug_a}-vs-{slug_b}.html")

    # Supprimer les fichiers HTML orphelins
    removed = []
    for f in output_dir.glob("*.html"):
        if f.name not in expected_files:
            f.unlink()
            removed.append(f.name)
    for f in output_dir.glob("*.png"):
        if f.name not in expected_files and f.name not in {f"{s}.png" for s in current_slugs}:
            f.unlink()
            removed.append(f.name)

    if removed:
        print(f"  🧹 {len(removed)} fichiers orphelins supprimés : {removed}")

    # Nettoyer editorial.json
    editorial_path = site_dir / "editorial.json"
    if editorial_path.exists():
        import json
        with open(editorial_path, encoding="utf-8") as ef:
            editorial = json.load(ef)
        valid_keys = {f"{a}-vs-{b}" for a, b in all_pairs}
        orphan_keys = [k for k in editorial if k not in valid_keys and not k.startswith('classement-')]
        if orphan_keys:
            for k in orphan_keys:
                del editorial[k]
            with open(editorial_path, "w", encoding="utf-8") as ef:
                json.dump(editorial, ef, ensure_ascii=False, indent=2)
            print(f"  🧹 {len(orphan_keys)} paires supprimées de editorial.json")


def copy_shared_assets(output_dir: Path, site_dir: Path) -> None:
    for source_dir in [site_dir, SHARED_DIR]:
        js_src = source_dir / "sheets.js"
        if js_src.exists():
            shutil.copy2(js_src, output_dir / "sheets.js")
            print(f"  ✓ sheets.js copié depuis {source_dir.name}/")
            return


# ── Générateur principal ───────────────────────────────────────────────────────
def generate_site(site_slug: str, dry_run: bool = False, filter_pair: tuple = None) -> None:
    site_dir = SITES_DIR / site_slug
    if not site_dir.exists():
        print(f"❌ Site introuvable : {site_dir}")
        sys.exit(1)

    config        = load_yaml(site_dir / "config.yaml")
    products_yaml_path = site_dir / "products.yaml"
    products_yaml = load_yaml(products_yaml_path) if products_yaml_path.exists() else {"products": []}
    site          = config["site"]
    theme         = config["theme"]
    # Injecter cta_color et cta_text_color depuis la racine du config dans theme
    if "cta_color" not in theme and config.get("cta_color"):
        theme["cta_color"] = config["cta_color"]
    if "cta_text_color" not in theme and config.get("cta_text_color"):
        theme["cta_text_color"] = config["cta_text_color"]
    criteria      = config["criteria"]

    print(f"\n🚀 Génération site : {site_slug}")

    # Chargement produits
    sheet_url = site.get("sheet_csv_url", "")
    products  = None
    if sheet_url and not dry_run:
        products = load_products_from_sheet(sheet_url)
    if products is None:
        products = products_yaml.get("products", [])
        print(f"  📦 {len(products)} produits depuis products.yaml")

    print(f"   {len(products)} produits → {math.comb(len(products), 2)} paires")

    # Jinja2
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True, lstrip_blocks=True,
    )
    env.filters["capitalize"] = lambda s: s.capitalize() if s else ""

    env.filters["md_to_html"] = lambda s: s

    MOIS_FR = ["janvier","février","mars","avril","mai","juin",
               "juillet","août","septembre","octobre","novembre","décembre"]
    def fr_date(d):
        try:
            parts = str(d).split("-")
            return f"{int(parts[2])} {MOIS_FR[int(parts[1])-1]} {parts[0]}"
        except Exception:
            return d
    env.filters["fr_date"] = fr_date

    template_file = site.get("template", "comparatif-vs.html.j2")
    # Si le template est un classement, pas de pages VS à générer
    is_classement_template = 'classement' in template_file
    if not is_classement_template:
        template = env.get_template(template_file)
    else:
        template = None
    print(f"  Template : {template_file}")

    # Charger les produits des sheets individuels des keywords (classement)
    if is_classement_template:
        _schema_name = config.get("page_types", {}).get("classement", "")
        if _schema_name:
            _schema_path = ROOT / "schemas" / f"{_schema_name}.json"
            if _schema_path.exists():
                import json as _j, csv as _csv, io as _io, urllib.request as _ur, itertools as _it2
                with open(_schema_path, encoding="utf-8") as _sf:
                    _schema_data = _j.load(_sf)
                _extra = []
                for _kw_name, _kw_data in _schema_data.get("keywords", {}).items():
                    _kw_url = _kw_data.get("__sheet_url", "")
                    if not _kw_url:
                        continue
                    _covered = any(
                        _kw_name.lower() in p.get("categorie", "").lower() or
                        p.get("categorie", "").lower() in _kw_name.lower()
                        for p in products
                    )
                    if _covered:
                        continue
                    try:
                        _req = _ur.Request(_kw_url, headers={"User-Agent": "Mozilla/5.0"})
                        with _ur.urlopen(_req, timeout=15) as _resp:
                            _text = _resp.read().decode("utf-8")
                        _reader = _csv.DictReader(_io.StringIO(_text))
                        _kw_prods = []
                        for _row in _reader:
                            if not _row.get("slug", "").strip(): continue
                            if str(_row.get("disponible", "1")) == "0": continue
                            _p = {k.strip(): v.strip() for k, v in _row.items() if k.strip()}
                            _p["categorie"] = _kw_name  # Forcer la catégorie = nom du keyword
                            _kw_prods.append(_p)
                        if _kw_prods:
                            products = products + _kw_prods
                            print(f"  ✓ {len(_kw_prods)} produits chargés depuis sheet '{_kw_name}'")
                    except Exception as _e:
                        print(f"  ⚠ Sheet '{_kw_name}': {_e}")

    output_dir = site_dir / "output"
    if not dry_run:
        output_dir.mkdir(exist_ok=True)

    all_slugs = [p["slug"] for p in products]
    all_pairs = list(itertools.combinations(sorted(all_slugs), 2))
    if filter_pair:
        all_pairs = [p for p in all_pairs if set(p) == set(filter_pair)]

    # ── Chargement éditorial depuis editorial.json ───────────────────────
    editorials = load_editorial(site_dir)

    # ── Chargement products_editorial.json ──────────────────────────────
    products_editorial_path = site_dir / "products_editorial.json"
    if products_editorial_path.exists():
        with open(products_editorial_path, encoding="utf-8") as _f:
            products_editorial = json.load(_f)
        for prod in products:
            slug = prod["slug"]
            if slug in products_editorial:
                for k, v in products_editorial[slug].items():
                    if v:
                        prod[k] = v
        print(f"  ✓ products_editorial.json : {len(products_editorial)} produits")

    # ── Chargement site_editorial.json ──────────────────────────────────
    site_editorial = {}
    site_editorial_path = site_dir / "site_editorial.json"
    if site_editorial_path.exists():
        with open(site_editorial_path, encoding="utf-8") as _f:
            site_editorial = json.load(_f)
        print(f"  ✓ site_editorial.json chargé")

    generated = 0
    skipped   = 0

    if is_classement_template:
        print(f"  ⏭ Pas de pages VS pour un site classement")

    for slug_a, slug_b in all_pairs:
        if is_classement_template:
            skipped += 1
            continue

        prod_a = products_by_slug(products, slug_a)
        prod_b = products_by_slug(products, slug_b)

        if not prod_a or not prod_b:
            skipped += 1
            continue

        # Injecte les textes uniques générés par l'API
        pair_key = f"{slug_a}-vs-{slug_b}"
        if pair_key in editorials:
            ed = editorials[pair_key]
            prod_a = dict(prod_a)
            prod_b = dict(prod_b)
            prod_a["description"]    = ed.get("description_a",   prod_a.get("description", ""))
            prod_a["points_forts"]   = ed.get("points_forts_a",  prod_a.get("points_forts", []))
            prod_a["points_faibles"] = ed.get("points_faibles_a",prod_a.get("points_faibles", []))
            prod_a["verdict_si"]     = ed.get("verdict_si_a",    prod_a.get("verdict_si", []))
            prod_b["description"]    = ed.get("description_b",   prod_b.get("description", ""))
            prod_b["points_forts"]   = ed.get("points_forts_b",  prod_b.get("points_forts", []))
            prod_b["points_faibles"] = ed.get("points_faibles_b",prod_b.get("points_faibles", []))
            prod_b["verdict_si"]     = ed.get("verdict_si_b",    prod_b.get("verdict_si", []))

        seo     = build_seo(site, config["seo"], prod_a, prod_b)
        related = build_related_pages(slug_a, slug_b, products)

        context = {
            "site": {**site, "seo": config.get("seo", {})},
            "theme": theme, "criteria": criteria,
            "prod_a": prod_a, "prod_b": prod_b,
            "slug_a": slug_a, "slug_b": slug_b,
            "seo": seo, "related_pages": related,
            "build_date": date.today().isoformat(),
            "editorial": editorials.get(pair_key, {}),
        }

        if dry_run:
            print(f"  [DRY] {slug_a}-vs-{slug_b}.html")
            generated += 1
            continue

        html = template.render(**context)
        (output_dir / f"{slug_a}-vs-{slug_b}.html").write_text(html, encoding="utf-8")
        generated += 1

    if not dry_run:
        generate_sitemap(site, all_pairs, products, output_dir, config=config)
        cleanup_removed_products(output_dir, site_dir, products, all_pairs)

        # ── Fichier _redirects pour Cloudflare Pages ──────────────────────
        www_preference = site.get("www_preference") or config.get("www_preference", "www")
        domain_raw = site.get("domain", "").replace("https://", "").replace("http://", "").replace("www.", "").rstrip("/")
        if domain_raw:
            if www_preference == "www":
                # Redirige naked → www
                redirects = f"https://{domain_raw}/* https://www.{domain_raw}/:splat 301\n"
            else:
                # Redirige www → naked
                redirects = f"https://www.{domain_raw}/* https://{domain_raw}/:splat 301\n"
            (output_dir / "_redirects").write_text(redirects, encoding="utf-8")
            print(f"  ✓ _redirects ({www_preference})")
        copy_shared_assets(output_dir, site_dir)

        # ── Copie logos depuis public/ ───────────────────────────────────
        public_dir = site_dir / "public"
        if public_dir.exists():
            for pub_file in public_dir.iterdir():
                if pub_file.is_file():
                    shutil.copy2(pub_file, output_dir / pub_file.name)
                    if pub_file.stem == "logo":
                        site["logo_img"] = f"/{pub_file.name}"
                    elif pub_file.stem == "favicon":
                        site["favicon_file"] = f"/{pub_file.name}"
            logos = [f for f in public_dir.iterdir() if f.stem == "logo"]
            if logos:
                print(f"  ✓ {len(logos)} logos copiés")
        # Copie logos PNG legacy depuis racine site_dir
        for logo in site_dir.glob("*.png"):
            shutil.copy2(logo, output_dir / logo.name)

        # ── Copie images partagées du schema (classement) ─────────────────
        if is_classement_template:
            page_types_cfg = config.get("page_types", {})
            schema_name = page_types_cfg.get("classement", "")
            if schema_name:
                images_dir = ROOT / "schemas" / "images" / schema_name
                if images_dir.exists():
                    img_count = 0
                    for img in images_dir.iterdir():
                        if img.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp", ".svg"]:
                            shutil.copy2(img, output_dir / img.name)
                            img_count += 1
                    if img_count:
                        print(f"  ✓ {img_count} images schema copiées ({schema_name})")

        # Copie favicon si présent (site-specific ou shared, tous formats)
        import shutil as _shutil
        favicon_copied = False
        for ext in ['svg', 'png', 'ico']:
            for src_dir in [site_dir, SHARED_DIR]:
                favicon_src = src_dir / f"favicon.{ext}"
                if favicon_src.exists():
                    _shutil.copy2(favicon_src, output_dir / f"favicon.{ext}")
                    print(f"  ✓ favicon.{ext} copié")
                    favicon_copied = True
                    if "favicon_file" not in site:
                        site["favicon_file"] = f"/favicon.{ext}"
                    break
            if favicon_copied:
                break

        # Construire classements_by_category pour home + sitemap
        classements_by_category: dict = {}
        if is_classement_template:
            _schema_name2 = config.get("page_types", {}).get("classement", "")
            if _schema_name2:
                _schema_path2 = ROOT / "schemas" / f"{_schema_name2}.json"
                if _schema_path2.exists():
                    import json as _j2
                    with open(_schema_path2, encoding="utf-8") as _sf2:
                        _schema2 = _j2.load(_sf2)
                    for _kw_name2, _kw_data2 in _schema2.get("keywords", {}).items():
                        _cat_parent2 = _kw_data2.get("__categorie", "Autres") or "Autres"
                        _cat_slug2 = slugify_cat(_kw_name2)
                        _count2 = len(_kw_data2.get("__products", []))
                        if _cat_parent2 not in classements_by_category:
                            classements_by_category[_cat_parent2] = []
                        classements_by_category[_cat_parent2].append({
                            "slug": _cat_slug2, "label": _kw_name2, "count": _count2
                        })

        # Home
        index_tpl = site.get("index_template", f"index-{site_slug}.html.j2")
        if (TEMPLATES_DIR / index_tpl).exists():
            zero_frais = sum(1 for p in products if str(p.get("frais_souscription", 99)).replace('.0','') == "0")
            top_pairs  = [{"url": f"{a}-vs-{b}", "label": f"{products_by_slug(products, a)['nom']} vs {products_by_slug(products, b)['nom']}"} for a, b in all_pairs[:8]]
            home_title = site.get("home_title") or f"{site.get('name', '')} | Comparatifs {site.get('year', '')}"
            home_desc = site.get("home_description", "")
            html = env.get_template(index_tpl).render(
                site={**site, "seo": config.get("seo", {})}, theme=theme, products=products,
                total_pairs=len(all_pairs), zero_frais_count=zero_frais,
                classements_by_category=classements_by_category,
                top_pairs=top_pairs, build_date=date.today().isoformat(),
                site_editorial=site_editorial,
                home_title=home_title, home_description=home_desc, home_h1=site.get('home_h1', ''),
            )
            (output_dir / "index.html").write_text(html, encoding="utf-8")
            print(f"  ✓ index.html ({len(products)} produits, {len(all_pairs)} comparatifs)")

        # Légales
        for tpl_name, out_name in [("mentions-legales.html.j2", "mentions-legales.html"), ("politique-confidentialite.html.j2", "politique-confidentialite.html"), ("contact.html.j2", "contact.html"), ("sitemap-html.html.j2", "plan-du-site.html"), ("404.html.j2", "404.html")]:
            if (TEMPLATES_DIR / tpl_name).exists():
                html = env.get_template(tpl_name).render(site={**site, "seo": config.get("seo", {})}, theme=theme, build_date=date.today().isoformat(), products=products, total_pairs=len(all_pairs), page_types=config.get("page_types", {}), classements_by_category=classements_by_category)
                (output_dir / out_name).write_text(html, encoding="utf-8")
                print(f"  ✓ {out_name}")

        # Page comparatifs-scpi.html (seulement pour sites non-classement)
        if not is_classement_template and (TEMPLATES_DIR / "comparatifs-scpi.html.j2").exists():
            seo_cfg = config.get("seo", {})
            liste_comp_title = seo_cfg.get("liste_comp_title", "Tous les comparatifs {site_name} {year}")                 .replace("{site_name}", site.get("name", ""))                 .replace("{year}", str(site.get("year", "")))                 .replace("{total}", str(len(all_pairs)))
            html = env.get_template("comparatifs-scpi.html.j2").render(
                site={**site, "seo": config.get("seo", {})}, theme=theme,
                products=products, total_pairs=len(all_pairs),
                liste_comp_title=liste_comp_title,
            )
            (output_dir / "comparatifs-scpi.html").write_text(html, encoding="utf-8")
            print(f"  ✓ comparatifs-scpi.html ({len(all_pairs)} comparatifs)")

        # Page liste avis + pages avis (seulement pour sites non-classement)
        if not is_classement_template:
            liste_avis_tpl = f"liste-avis-{site_slug}.html.j2"
            if not (TEMPLATES_DIR / liste_avis_tpl).exists():
                liste_avis_tpl = "liste-avis-scpi.html.j2"
            if (TEMPLATES_DIR / liste_avis_tpl).exists():
                html = env.get_template(liste_avis_tpl).render(
                    site={**site, "seo": config.get("seo", {})}, theme=theme,
                    products=products, build_date=date.today().isoformat(),
                )
                (output_dir / "avis-scpi.html").write_text(html, encoding="utf-8")
                print(f"  ✓ avis-scpi.html ({len(products)} SCPI)")

        # ── Pages AVIS (seulement pour sites non-classement) ────────────────
        avis_tpl_name = f"avis-{site_slug}.html.j2"
        if not (TEMPLATES_DIR / avis_tpl_name).exists():
            avis_tpl_name = "avis-scpi.html.j2"
        if not is_classement_template and (TEMPLATES_DIR / avis_tpl_name).exists():
            avis_count = 0
            prod_map = {p["slug"]: p for p in products}
            for prod in products:
                slug = prod["slug"]
                # Récupère la description canonique depuis editorial.json
                # Prend la première paire où ce produit apparaît en position A
                avis_prod = dict(prod)
                for pair_key, ed in editorials.items():
                    parts = pair_key.split("-vs-")
                    if len(parts) == 2 and parts[0] == slug:
                        avis_prod["description"]    = ed.get("description_a", prod.get("description", ""))
                        avis_prod["points_forts"]   = ed.get("points_forts_a", prod.get("points_forts", []))
                        avis_prod["points_faibles"] = ed.get("points_faibles_a", prod.get("points_faibles", []))
                        avis_prod["verdict_si"]     = ed.get("verdict_si_a", prod.get("verdict_si", []))
                        break
                    elif len(parts) == 2 and parts[1] == slug:
                        avis_prod["description"]    = ed.get("description_b", prod.get("description", ""))
                        avis_prod["points_forts"]   = ed.get("points_forts_b", prod.get("points_forts", []))
                        avis_prod["points_faibles"] = ed.get("points_faibles_b", prod.get("points_faibles", []))
                        avis_prod["verdict_si"]     = ed.get("verdict_si_b", prod.get("verdict_si", []))
                        break

                # Tous les comparatifs impliquant ce produit
                related_comparatifs = []
                for a, b in all_pairs:
                    if a == slug or b == slug:
                        other = b if a == slug else a
                        other_prod = prod_map.get(other)
                        if other_prod:
                            url = f"{a}-vs-{b}"
                            label = f"{prod_map[a]['nom']} vs {prod_map[b]['nom']}"
                            related_comparatifs.append((url, label))

                seo_cfg = config.get("seo", {})
                avis_title = seo_cfg.get("avis_title_pattern", "Avis {nom} {year}")                     .replace("{nom}", avis_prod.get("nom", ""))                     .replace("{marque}", avis_prod.get("marque", ""))                     .replace("{td}", str(avis_prod.get("td", "")))                     .replace("{year}", str(site.get("year", "")))
                avis_meta = seo_cfg.get("avis_meta_pattern", "")                     .replace("{nom}", avis_prod.get("nom", ""))                     .replace("{marque}", avis_prod.get("marque", ""))                     .replace("{td}", str(avis_prod.get("td", "")))                     .replace("{year}", str(site.get("year", "")))
                html = env.get_template(avis_tpl_name).render(
                    site={**site, "seo": config.get("seo", {})},
                    theme=theme,
                    prod=avis_prod,
                    related_comparatifs=related_comparatifs,
                    build_date=date.today().isoformat(),
                    avis_title=avis_title,
                    avis_meta=avis_meta,
                )
                (output_dir / f"avis-{slug}.html").write_text(html, encoding="utf-8")
                avis_count += 1
            print(f"  ✓ {avis_count} pages avis générées")

    # ── Pages CLASSEMENT par catégorie ─────────────────────────────────
    if not dry_run and is_classement_template:
        editorials_fresh = load_editorial(site_dir)
        classement_tpl = env.get_template(template_file)
        categories: dict = {}
        for prod in products:
            cat = prod.get("categorie", "").strip()
            if cat:
                if cat not in categories:
                    categories[cat] = []
                categories[cat].append(prod)
        if categories:
            classement_count = 0
            for cat, cat_products in categories.items():
                cat_slug = slugify_cat(cat)
                page_slug = f"meilleur-{cat_slug}"
                seo_cfg = config.get("seo", {})
                cat_editorial = editorials_fresh.get(f"classement-{cat_slug}", {})
                classement_title = cat_editorial.get("meta_title") or seo_cfg.get("classement_title_pattern", "Meilleur {categorie} {year} : Top {count}").replace("{categorie}", cat).replace("{year}", str(site.get("year", ""))).replace("{count}", str(len(cat_products)))
                classement_meta = cat_editorial.get("meta_description") or seo_cfg.get("classement_meta_pattern", "Comparez les meilleurs {categorie} en {year}.").replace("{categorie}", cat).replace("{year}", str(site.get("year", "")))
                classement_h1 = cat_editorial.get("h1") or classement_title
                enriched_products = []
                for prod in cat_products:
                    p = dict(prod)
                    slug = prod.get("slug", "")
                    # Description depuis descriptions_produits dans l'editorial classement
                    if "descriptions_produits" in cat_editorial and slug in cat_editorial["descriptions_produits"]:
                        p["description"] = cat_editorial["descriptions_produits"][slug]
                    # Points forts/faibles depuis classement-prod-{slug}
                    prod_ed_key = f"classement-prod-{slug}"
                    if prod_ed_key in editorials_fresh:
                        prod_ed = editorials_fresh[prod_ed_key]
                        if not p.get("points_forts") and prod_ed.get("points_forts"):
                            p["points_forts"] = prod_ed["points_forts"]
                        if not p.get("points_faibles") and prod_ed.get("points_faibles"):
                            p["points_faibles"] = prod_ed["points_faibles"]
                        if not p.get("description") and prod_ed.get("description"):
                            p["description"] = prod_ed["description"]
                    # Données éditées manuellement via dashboard (prod_{slug})
                    manual_key = f"prod_{slug}"
                    if manual_key in cat_editorial:
                        manual = cat_editorial[manual_key]
                        if manual.get("description"):
                            p["description"] = manual["description"]
                        if manual.get("points_forts"):
                            p["points_forts"] = manual["points_forts"]
                        if manual.get("points_faibles"):
                            p["points_faibles"] = manual["points_faibles"]
                        if manual.get("url_affiliation"):
                            p["url_affiliation"] = manual["url_affiliation"]
                        if manual.get("cta_text"):
                            p["cta_text"] = manual["cta_text"]
                    # Convertir markdown en HTML pour la description
                    if p.get("description"):
                        p["description"] = md_to_html(p["description"])
                    enriched_products.append(p)

                # Convertir markdown en HTML pour intro et contenu_custom
                if cat_editorial.get("intro"):
                    cat_editorial = dict(cat_editorial)
                    cat_editorial["intro"] = md_to_html(cat_editorial["intro"])
                if cat_editorial.get("contenu_custom"):
                    cat_editorial = dict(cat_editorial)
                    cat_editorial["contenu_custom"] = md_to_html(cat_editorial["contenu_custom"])
                # Trier les produits : ordre manuel si défini, sinon par note
                order_map = cat_editorial.get("products_order", {})
                def sort_key(p):
                    slug = p.get("slug", "")
                    if slug in order_map:
                        return (0, order_map[slug])  # Ordre manuel en priorité
                    note = p.get("note_redaction", 0) or 0
                    try:
                        note = float(note)
                    except:
                        note = 0
                    return (1, -note)  # Sinon par note décroissante
                enriched_products.sort(key=sort_key)

                # Données auteur depuis config
                author_cfg = config.get("author", {})
                # Nettoyer le path photo (enlever URL raw GitHub si présent)
                _photo_raw = author_cfg.get("photo", "") or ""
                if "raw.githubusercontent.com" in _photo_raw:
                    # Extraire juste le nom de fichier
                    _photo_clean = "/" + _photo_raw.split("/public/")[-1].split("?")[0] if "/public/" in _photo_raw else ""
                else:
                    _photo_clean = _photo_raw

                site_with_author = {
                    **site,
                    "seo": config.get("seo", {}),
                    "author_name": author_cfg.get("name", ""),
                    "author_bio": author_cfg.get("bio", ""),
                    "author_job": author_cfg.get("job_title", ""),
                    "author_photo": _photo_clean,
                    "author_socials": author_cfg.get("socials", []),
                }
                # Trouver les siblings (même catégorie parente, max 8, triés, fixes)
                _cat_parent = _kw_data.get("__categorie", "Autres") or "Autres"
                _siblings = []
                for _cat_p, _cls_list in classements_by_category.items():
                    if _cat_p == _cat_parent:
                        for _cls in sorted(_cls_list, key=lambda x: x["slug"]):
                            if _cls["slug"] != cat_slug:
                                _siblings.append(_cls)
                _siblings = _siblings[:8]

                html = classement_tpl.render(
                    site=site_with_author,
                    theme=theme, products=enriched_products, criteria=criteria,
                    page_slug=page_slug,
                    seo={"title": classement_title, "meta": classement_meta, "h1": classement_h1},
                    editorial=cat_editorial, build_date=date.today().isoformat(),
                    page_types=config.get("page_types", {}),
                    total_pairs=len(all_pairs),
                    siblings=_siblings,
                    cat_parent=_cat_parent,
                )
                (output_dir / f"{page_slug}.html").write_text(html, encoding="utf-8")
                classement_count += 1
                print(f"  ✓ {page_slug}.html")
            print(f"  ✓ {classement_count} pages classement générées")

        # ── Page Nos comparateurs ──────────────────────────────────────────
        nos_comp_tpl_path = TEMPLATES_DIR / "nos-comparateurs.html.j2"
        if nos_comp_tpl_path.exists() and categories:
            nos_comp_tpl = env.get_template("nos-comparateurs.html.j2")
            # Construire la structure par catégorie depuis le schema
            schema_path = ROOT / "schemas" / f"{template_file.replace('.html.j2', '')}.json"
            classements_by_category: dict = {}
            if schema_path.exists():
                import json as _json
                with open(schema_path, encoding='utf-8') as _f:
                    _schema = _json.load(_f)
                for kw_name, kw_data in _schema.get("keywords", {}).items():
                    cat_parent = kw_data.get("__categorie", "Autres")
                    if not cat_parent:
                        cat_parent = "Autres"
                    cat_slug = slugify_cat(kw_name)
                    count = len(kw_data.get("__products", []))
                    if cat_parent not in classements_by_category:
                        classements_by_category[cat_parent] = []
                    classements_by_category[cat_parent].append({
                        "slug": cat_slug,
                        "label": kw_name,
                        "count": count
                    })
            # Fallback : utiliser les catégories des produits
            if not classements_by_category:
                for cat in categories.keys():
                    classements_by_category["Nos comparateurs"] = classements_by_category.get("Nos comparateurs", [])
                    classements_by_category["Nos comparateurs"].append({
                        "slug": slugify_cat(cat),
                        "label": cat,
                        "count": len(categories[cat])
                    })
            html = nos_comp_tpl.render(
                site={**site, "seo": config.get("seo", {})},
                theme=theme, page_types=config.get("page_types", {}),
                classements_by_category=classements_by_category,
                build_date=date.today().isoformat(),
            )
            (output_dir / "nos-comparateurs.html").write_text(html, encoding="utf-8")
            print(f"  ✓ nos-comparateurs.html")

    print(f"\n  {'[DRY] ' if dry_run else ''}✅ {generated} pages générées, {skipped} ignorées")
    if not dry_run:
        print(f"  📁 Output : {output_dir}")


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--site")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--pair")
    args = parser.parse_args()

    filter_pair = None
    if args.pair:
        parts = args.pair.split(",")
        if len(parts) == 2:
            filter_pair = tuple(p.strip() for p in parts)

    if args.all:
        for site_dir in sorted(SITES_DIR.iterdir()):
            if site_dir.is_dir() and not site_dir.name.startswith("_"):
                generate_site(site_dir.name, dry_run=args.dry_run, filter_pair=filter_pair)
    elif args.site:
        generate_site(args.site, dry_run=args.dry_run, filter_pair=filter_pair)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
