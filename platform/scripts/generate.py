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
    'verdict_si_1', 'verdict_si_2', 'verdict_si_3'
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
        related.append({
            "url":   f"{slug_a}-vs-{s}.html",
            "label": f"{products_by_slug(products, slug_a)['nom']} vs {p['nom']}"
        })
        if len(related) >= max_items:
            break
    return related


def products_by_slug(products: list, slug: str) -> dict:
    return next((p for p in products if p["slug"] == slug), None)


def generate_sitemap(site: dict, pairs: list, products: list, output_dir: Path) -> None:
    domain = site["domain"]
    base   = site["base_path"].rstrip("/")
    today  = date.today().isoformat()
    lines  = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        f'  <url><loc>{domain}/</loc><priority>1.0</priority><changefreq>weekly</changefreq></url>',
        f'  <url><loc>{domain}/comparatifs-scpi</loc><lastmod>{today}</lastmod><priority>0.9</priority><changefreq>weekly</changefreq></url>',
        f'  <url><loc>{domain}/avis-scpi</loc><lastmod>{today}</lastmod><priority>0.9</priority><changefreq>weekly</changefreq></url>',
    ]
    for prod in products:
        lines.append(
            f'  <url><loc>{domain}/avis-{prod["slug"]}</loc>'
            f'<lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>'
        )
    for slug_a, slug_b in pairs:
        lines.append(
            f'  <url><loc>{domain}/{slug_a}-vs-{slug_b}</loc>'
            f'<lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>'
        )
    lines.append("</urlset>")
    (output_dir / "sitemap.xml").write_text("\n".join(lines), encoding="utf-8")
    print(f"  ✓ sitemap.xml ({len(pairs)} comparatifs + {len(products)} avis + pages liste)")


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
    template      = env.get_template(template_file)
    print(f"  Template : {template_file}")

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

    for slug_a, slug_b in all_pairs:
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
        generate_sitemap(site, all_pairs, products, output_dir)

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

        # ── Copie logos PNG ───────────────────────────────────────────────
        for logo in site_dir.glob("*.png"):
            shutil.copy2(logo, output_dir / logo.name)
        logos = list(site_dir.glob("*.png"))
        if logos:
            print(f"  ✓ {len(logos)} logos copiés")

        # Home
        index_tpl = site.get("index_template", f"index-{site_slug}.html.j2")
        if (TEMPLATES_DIR / index_tpl).exists():
            zero_frais = sum(1 for p in products if str(p.get("frais_souscription", 99)).replace('.0','') == "0")
            top_pairs  = [{"url": f"{a}-vs-{b}.html", "label": f"{products_by_slug(products, a)['nom']} vs {products_by_slug(products, b)['nom']}"} for a, b in all_pairs[:8]]
            home_title = site.get("home_title") or f"{site.get('name', '')} | Comparatifs {site.get('year', '')}"
            home_desc = site.get("home_description", "")
            html = env.get_template(index_tpl).render(
                site={**site, "seo": config.get("seo", {})}, theme=theme, products=products,
                total_pairs=len(all_pairs), zero_frais_count=zero_frais,
                top_pairs=top_pairs, build_date=date.today().isoformat(),
                site_editorial=site_editorial,
                home_title=home_title, home_description=home_desc,
            )
            (output_dir / "index.html").write_text(html, encoding="utf-8")
            print(f"  ✓ index.html ({len(products)} produits, {len(all_pairs)} comparatifs)")

        # Légales
        for tpl_name, out_name in [("mentions-legales.html.j2", "mentions-legales.html"), ("politique-confidentialite.html.j2", "politique-confidentialite.html"), ("contact.html.j2", "contact.html"), ("sitemap-html.html.j2", "plan-du-site.html"), ("404.html.j2", "404.html")]:
            if (TEMPLATES_DIR / tpl_name).exists():
                html = env.get_template(tpl_name).render(site={**site, "seo": config.get("seo", {})}, theme=theme, build_date=date.today().isoformat(), products=products, total_pairs=len(all_pairs))
                (output_dir / out_name).write_text(html, encoding="utf-8")
                print(f"  ✓ {out_name}")

        # Page comparatifs-scpi.html
        if (TEMPLATES_DIR / "comparatifs-scpi.html.j2").exists():
            seo_cfg = config.get("seo", {})
            liste_comp_title = seo_cfg.get("liste_comp_title", "Tous les comparatifs {site_name} {year}")                 .replace("{site_name}", site.get("name", ""))                 .replace("{year}", str(site.get("year", "")))                 .replace("{total}", str(len(all_pairs)))
            html = env.get_template("comparatifs-scpi.html.j2").render(
                site={**site, "seo": config.get("seo", {})}, theme=theme,
                products=products, total_pairs=len(all_pairs),
                liste_comp_title=liste_comp_title,
            )
            (output_dir / "comparatifs-scpi.html").write_text(html, encoding="utf-8")
            print(f"  ✓ comparatifs-scpi.html ({len(all_pairs)} comparatifs)")

        # Page liste avis
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

        # ── Pages AVIS ──────────────────────────────────────────────────────
        avis_tpl_name = f"avis-{site_slug}.html.j2"
        if not (TEMPLATES_DIR / avis_tpl_name).exists():
            avis_tpl_name = "avis-scpi.html.j2"  # fallback template générique
        if (TEMPLATES_DIR / avis_tpl_name).exists():
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
                            url = f"{a}-vs-{b}.html"
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
