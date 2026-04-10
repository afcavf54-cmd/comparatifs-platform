#!/usr/bin/env python3
"""
generate.py — Générateur de sites comparatifs statiques
Source données : Google Sheets CSV (priorité) ou products.yaml (fallback)
Templates : Jinja2 · Deploy : Cloudflare Pages via GitHub Actions

Usage :
    python scripts/generate.py --site scpi
    python scripts/generate.py --site scpi --dry-run
    python scripts/generate.py --site scpi --pair remake-live,iroko-zen
    python scripts/generate.py --all
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


# ── Helpers ───────────────────────────────────────────────────────────────────
def load_yaml(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def cast(val: str):
    """Convertit une string CSV en int/float si possible, sinon str."""
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


def load_products_from_sheet(csv_url: str) -> list | None:
    """Charge les produits depuis Google Sheet CSV. Retourne None si indisponible."""
    try:
        print("  📥 Chargement Sheet CSV…")
        req = urllib.request.Request(
            csv_url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; SCPI-Generator/1.0)"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            text = resp.read().decode("utf-8")

        # Champs à ne PAS caster (contiennent des virgules intentionnelles)
        STRING_FIELDS = {'geo', 'secteurs', 'pays', 'investissement_min',
                         'tri_horizon', 'nom', 'marque', 'type', 'slug',
                         'description', 'url_affiliation', 'verdict_si_1',
                         'verdict_si_2', 'verdict_si_3'}

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

        # Normalise les champs numériques (le CSV renvoie tout en string)
        NUMERIC_FIELDS = [
            "prix_achat", "prix_retrait", "td", "tri", "pga", "tof",
            "frais_souscription", "frais_gestion", "delai_jouissance",
            "endettement", "capitalisation", "disponible", "note_redaction"
        ]
        for prod in products:
            for field in NUMERIC_FIELDS:
                val = prod.get(field)
                if val is not None and val != "":
                    try:
                        prod[field] = float(str(val).replace(",", "."))
                    except (ValueError, TypeError):
                        pass

            # Injecte les textes éditoriaux rédigés
            EDITORIAL = {
                "wemo-one": {
                    "description": "Wemo One est la SCPI phare de Wemo Reim, lancée en 2024 avec une philosophie radicalement différente : investir uniquement dans des actifs \"small caps\" européens (moins de 5 M€ par bien), là où les grands institutionnels ne vont pas. Cette approche granulaire offre des marges de négociation supérieures et une diversification naturelle du risque locataire.\n\nCe qui distingue vraiment Wemo One, c'est l'alignement d'intérêts : chaque associé de Wemo Reim est également investisseur dans la SCPI. En 2025, cette stratégie a porté ses fruits avec un taux de distribution exceptionnel de 15,27%, le meilleur du marché. Le portefeuille est désormais majoritairement européen hors France (85%), avec une forte concentration en Italie (51%) et Espagne (35%).",
                    "points_forts": ["TD 2025 exceptionnel : 15,27% — meilleur du marché", "Stratégie small caps : actifs < 5 M€, moins de concurrence institutionnelle", "TOF à 100% — aucun loyer impayé", "85% d'exposition européenne hors France — avantage fiscal TMI 30%+", "Alignement d'intérêts : les gérants investissent dans leur propre SCPI"],
                    "points_faibles": ["SCPI récente (2024) — track record limité", "Frais de souscription de 10%", "Délai de jouissance de 6 mois", "Capitalisation encore modeste (75 M€)"],
                    "verdict_si": ["Vous cherchez le TD le plus élevé du marché en 2025", "Vous avez une TMI à 30% ou plus", "Vous croyez à l'immobilier small cap européen", "Vous acceptez les frais d'entrée en échange d'un rendement exceptionnel"]
                },
                "iroko-zen": {
                    "description": "Iroko Zen est l'une des SCPI les plus innovantes du marché français. Lancée fin 2020 par Iroko, elle a été parmi les premières à supprimer totalement les frais de souscription — 100% du capital investi travaille immédiatement.\n\nLabellisée ISR depuis avril 2021, elle affiche un TRI de 7,49% sur 5 ans et une capitalisation de 1,35 milliard d'euros qui lui confère une liquidité solide. Son portefeuille diversifié couvre commerces, bureaux, logistique et santé dans six pays européens.",
                    "points_forts": ["0% de frais de souscription — 100% du capital investi", "TRI 5 ans de 7,49% — performance globale excellente", "Label ISR — investissement socialement responsable", "Capitalisation de 1,35 Md€ — bonne liquidité", "Délai de jouissance court : 3 mois"],
                    "points_faibles": ["Ticket minimum élevé : 5 100€ (25 parts)", "Frais de gestion de 14,4%", "Endettement de 26%", "Exposition France de 29% — avantage fiscal partiel"],
                    "verdict_si": ["Vous pouvez investir 5 100€ minimum en une fois", "La performance globale (TRI) prime sur le TD annuel", "L'investissement responsable (ISR) est un critère important", "Vous visez un horizon de 8 ans et plus"]
                },
                "comete": {
                    "description": "Comète est la SCPI internationale d'Alderan, lancée en décembre 2023 pour compléter leur SCPI logistique Activimmo. Elle investit exclusivement en Europe et à l'international, en évitant délibérément la France.\n\nEn 2025, elle affiche un TD exceptionnel de 9% grâce à des acquisitions opportunistes dans des marchés décotés. Avec une présence marquée au Royaume-Uni (47%), en Espagne (15%) et en Italie (12%), elle offre une diversification géographique maximale.",
                    "points_forts": ["TD 2025 de 9% — parmi les plus élevés du marché", "100% international hors France", "Stratégie opportuniste sur marchés décotés", "Diversification : Royaume-Uni, Espagne, Italie, Pays-Bas", "TRI cible 10 ans de 6,5%"],
                    "points_faibles": ["SCPI récente (2023) — historique limité", "Frais de souscription de 10%", "Exposition GBP (47% UK) — risque de change", "Capitalisation encore modeste"],
                    "verdict_si": ["Vous voulez maximiser votre exposition internationale", "Vous cherchez un TD élevé avec diversification géographique", "Vous acceptez le risque de change lié à l'exposition UK", "Vous complétez un portefeuille exposé à la zone euro"]
                },
                "corum-origin": {
                    "description": "Corum Origin est une référence incontournable de l'investissement SCPI européen. Lancée en 2012, elle a été pionnière en s'affranchissant des frontières françaises. Depuis plus de 12 ans, elle maintient un TD parmi les plus réguliers du marché.\n\nSa stratégie opportuniste attend les bonnes occasions dans des marchés immobiliers profonds : Pays-Bas (27%), Portugal (15%), Estonie (13%). Avec zéro endettement et un TRI 10 ans de 6,75%, c'est la référence pour un rendement élevé et régulier.",
                    "points_forts": ["12 ans de track record — SCPI éprouvée", "TRI 10 ans de 6,75%", "Zéro endettement — profil défensif", "Diversification dans 15 pays européens", "TD constant depuis 2012"],
                    "points_faibles": ["Frais de souscription élevés : 11,96%", "Prix de retrait inférieur au prix d'achat (999€ vs 1 135€)", "Délai de jouissance de 6 mois", "Prix de part élevé : 1 135€"],
                    "verdict_si": ["Vous cherchez une SCPI avec un long historique", "La régularité du rendement prime sur son niveau", "Vous investissez sur 10 ans minimum", "Vous voulez zéro endettement dans votre portefeuille"]
                },
                "remake-live": {
                    "description": "Remake Live est la SCPI sans frais de souscription de Remake AM, lancée en 2022. Elle s'est rapidement imposée grâce à une stratégie opportuniste dans des métropoles européennes dynamiques.\n\nAvec 78% de son patrimoine hors de France, elle offre un avantage fiscal important pour les TMI élevées. À fin 2025, son TOF atteint 98,86% et le prix de part reste stable. L'absence de frais d'entrée en fait la SCPI idéale pour les versements programmés dès 204€.",
                    "points_forts": ["0% de frais de souscription — idéale pour versements mensuels", "TD 2025 de 7,05%", "78% hors France — avantage fiscal TMI 30%+", "TOF de 98,86%", "Ticket minimum : 204€ (1 part)"],
                    "points_faibles": ["Frais de gestion de 18% TTC", "SCPI récente (2022) — 3 ans de track record", "TRI cible 10 ans de 7% — encore non démontré"],
                    "verdict_si": ["Vous souhaitez investir par versements programmés dès 204€/mois", "Vous avez une TMI à 30% ou plus", "Vous voulez 0% de frais d'entrée", "Vous débutez en SCPI avec un petit ticket"]
                },
                "iroko-atlas": {
                    "description": "Iroko Atlas est la petite sœur d'Iroko Zen, lancée en 2025 avec une ambition encore plus internationale : 100% hors de France. Comme Iroko Zen, elle applique 0% de frais et une approche ISR rigoureuse.\n\nEn quelques mois, elle a constitué un portefeuille de 12 actifs dans 6 pays européens (77,4 M€ de capitalisation). Sa répartition privilégie le Royaume-Uni (31%) et les Pays-Bas (29%), avec une forte orientation vers les commerces (56%).",
                    "points_forts": ["0% de frais de souscription", "100% hors de France — avantage fiscal maximal", "TOF à 100%", "TRI cible 10 ans de 7%", "Même équipe de gestion qu'Iroko Zen"],
                    "points_faibles": ["SCPI très récente (2025) — aucun track record", "Capitalisation encore faible (77,4 M€)", "Délai de jouissance de 5 mois", "Exposition GBP (31% UK) — risque de change"],
                    "verdict_si": ["Vous faites confiance à l'équipe Iroko", "Vous voulez une exposition 100% internationale", "Vous avez une TMI élevée", "Vous acceptez le risque d'une SCPI très récente"]
                },
                "log-in": {
                    "description": "Log In est la SCPI spécialisée dans l'immobilier logistique et industriel européen, gérée par Theoreim en partenariat avec Principal Real Estate Europe. Elle finance des entrepôts et plateformes logistiques, s'inscrivant dans la réindustrialisation européenne.\n\nUnique en son genre, Log In est la seule SCPI exclusivement logistique à l'échelle européenne. Son portefeuille est concentré en Italie (29%), Espagne (27%) et Royaume-Uni (24%).",
                    "points_forts": ["Thématique unique : logistique et industrie 100% européenne", "Exposition à la réindustrialisation européenne", "TOF à 100%", "PGA de 8,21%", "Double expertise : Theoreim + Principal Real Estate"],
                    "points_faibles": ["TRI cible 10 ans de 5% — plus modeste que les concurrents", "Frais de souscription de 10%", "Ticket minimum de 1 020€ (4 parts)", "Secteur cyclique"],
                    "verdict_si": ["Vous croyez à la thématique logistique en Europe", "Vous souhaitez une exposition sectorielle différenciante", "Vous complétez un portefeuille SCPI diversifié", "La réindustrialisation européenne est une conviction"]
                },
                "transitions-europe": {
                    "description": "Transitions Europe est la SCPI d'Arkéa REIM pensée pour accompagner les mutations de l'immobilier européen. 100% hors de France, elle investit dans des actifs liés aux nouveaux usages : bureaux repensés, logistique urbaine, commerces de proximité.\n\nElle capture les opportunités créées par la correction des marchés européens depuis 2022. Espagne (36%), Allemagne (21%) et Pays-Bas (15%) constituent son cœur de portefeuille.",
                    "points_forts": ["TD 2025 de 7,60%", "100% hors de France — avantage fiscal maximal", "Stratégie sur marchés décotés", "Frais de gestion compétitifs : 10% TTC", "Diversification sectorielle complète"],
                    "points_faibles": ["Prix de retrait nettement inférieur au prix d'achat (181,80€ vs 202€)", "Frais de souscription de 10%", "Pas de TRI communiqué — SCPI trop récente"],
                    "verdict_si": ["Vous cherchez un TD élevé avec exposition 100% européenne", "Vous croyez au rebond de l'immobilier européen", "Les frais de gestion compétitifs sont un critère", "Vous construisez un portefeuille SCPI diversifié"]
                },
                "principal-inside": {
                    "description": "Principal Inside est la première SCPI à investir des deux côtés de l'Atlantique, gérée par Principal Real Estate (filiale de Principal Asset Management, 600 Md$ d'actifs). C'est une SCPI récente en phase de déploiement.\n\nSon positionnement est unique : accéder à l'immobilier américain via une SCPI régulée AMF. À fin 2025, le portefeuille est concentré aux États-Unis dans le secteur santé (58%) — thématique portée par le vieillissement démographique.",
                    "points_forts": ["Exposition unique aux États-Unis via une SCPI AMF", "Gestionnaire mondial : Principal Asset Management (600 Md$)", "Thématique santé (58%) — secteur défensif", "TRI cible 10 ans de 6,50%", "Cashback de 5% via Louveinvest"],
                    "points_faibles": ["SCPI très récente — aucun track record", "100% USA actuellement", "Risque de change USD/EUR", "Frais de souscription de 10%", "TD cible de 6% — en dessous de la moyenne"],
                    "verdict_si": ["Vous souhaitez diversifier avec une exposition aux États-Unis", "Vous faites confiance à un gestionnaire mondial", "La thématique immobilier santé vous convainc", "Vous investissez sur 10 ans minimum"]
                },
                "upeka": {
                    "description": "Upêka est la SCPI value-add d'Axipit Real Estate Partners, lancée en 2023. Elle acquiert des actifs professionnels décotés à fort potentiel de valorisation, puis les repositionne via un asset management actif.\n\nSon modèle de frais est innovant : 0% de frais de souscription, avec des frais de sortie dégressifs qui disparaissent totalement au bout de 6 ans. Son TD de 5,71% en 2025 reste modeste mais le potentiel de revalorisation est réel.",
                    "points_forts": ["0% de frais de souscription", "Frais de sortie dégressifs — disparus après 6 ans", "Stratégie value-add — potentiel de plus-value", "TRI cible 10 ans de 6,50%", "Cashback de 3% via Louveinvest"],
                    "points_faibles": ["TD 2025 de 5,71% — en dessous des meilleures SCPI", "Frais de gestion de 18% TTC", "SCPI récente (2023)", "Rendement différé dans le temps"],
                    "verdict_si": ["Vous privilégiez la valorisation du capital", "Vous voulez 0% de frais avec un gestionnaire actif", "La stratégie value-add vous convainc", "Vous investissez sur 8 ans minimum"]
                }
            }
            slug = prod.get("slug", "")
            if slug in EDITORIAL:
                ed = EDITORIAL[slug]
                if not prod.get("description"):
                    prod["description"] = ed["description"]
                if not prod.get("points_forts"):
                    prod["points_forts"] = ed["points_forts"]
                if not prod.get("points_faibles"):
                    prod["points_faibles"] = ed["points_faibles"]
                if not prod.get("verdict_si") or prod.get("verdict_si") == []:
                    prod["verdict_si"] = ed["verdict_si"]

            # Construit verdict_si depuis les colonnes verdict_si_1/2/3
            # ou génère un fallback automatique si absent
            if "verdict_si" not in prod or not prod["verdict_si"]:
                vs = []
                for i in range(1, 4):
                    v = prod.get(f"verdict_si_{i}")
                    if v and str(v).strip():
                        vs.append(str(v).strip())
                if not vs:
                    # Fallback automatique basé sur les données disponibles
                    if prod.get("frais_souscription") == 0:
                        vs.append("Vous souhaitez éviter les frais d'entrée")
                    if prod.get("td") and float(prod.get("td", 0)) >= 7:
                        vs.append("Vous cherchez un rendement élevé")
                    if prod.get("delai_jouissance") and float(prod.get("delai_jouissance", 6)) <= 3:
                        vs.append("Vous voulez percevoir vos loyers rapidement")
                    vs.append("Vous souhaitez diversifier votre patrimoine immobilier")
                prod["verdict_si"] = vs

        return products

    except Exception as e:
        print(f"  ⚠ Sheet indisponible ({e}) → fallback products.yaml")
        return None


def build_seo(site: dict, seo_config: dict, prod_a: dict, prod_b: dict) -> dict:
    year = site["year"]
    return {
        "title": seo_config["title_pattern"]
            .replace("{A}", str(prod_a["nom"]))
            .replace("{B}", str(prod_b["nom"]))
            .replace("{year}", str(year)),
        "meta": seo_config["meta_pattern"]
            .replace("{A}", str(prod_a["nom"]))
            .replace("{B}", str(prod_b["nom"]))
            .replace("{year}", str(year)),
        "h1": seo_config["h1_pattern"]
            .replace("{A}", str(prod_a["nom"]))
            .replace("{B}", str(prod_b["nom"]))
            .replace("{year}", str(year)),
        "intro": seo_config["intro_pattern"]
            .replace("{A}", str(prod_a["nom"]))
            .replace("{B}", str(prod_b["nom"]))
            .replace("{prix_a}", f"{prod_a.get('prix', prod_a.get('prix_achat', ''))}€")
            .replace("{prix_b}", f"{prod_b.get('prix', prod_b.get('prix_achat', ''))}€"),
    }


def generate_editorial(prod_a: dict, prod_b: dict) -> dict:
    """
    Appelle l'API Claude pour générer un contenu éditorial unique
    pour chaque paire de SCPI. Retourne description_a, description_b,
    points_forts_a/b, points_faibles_a/b, verdict_si_a/b.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return {}

    def fmt(p):
        return {
            "nom": p.get("nom", ""),
            "marque": p.get("marque", ""),
            "type": p.get("type", ""),
            "td": p.get("td", ""),
            "tri": p.get("tri", ""),
            "tri_horizon": p.get("tri_horizon", ""),
            "frais_souscription": p.get("frais_souscription", ""),
            "frais_gestion": p.get("frais_gestion", ""),
            "prix_achat": p.get("prix_achat", ""),
            "prix_retrait": p.get("prix_retrait", ""),
            "tof": p.get("tof", ""),
            "endettement": p.get("endettement", ""),
            "capitalisation": p.get("capitalisation", ""),
            "delai_jouissance": p.get("delai_jouissance", ""),
            "pays": p.get("pays", ""),
            "geo": p.get("geo", ""),
            "secteurs": p.get("secteurs", ""),
            "investissement_min": p.get("investissement_min", ""),
        }

    prompt = f"""Tu es expert en SCPI (Sociétés Civiles de Placement Immobilier) et en rédaction SEO.
Tu dois rédiger un contenu éditorial UNIQUE et ORIGINAL pour une page comparatif entre deux SCPI spécifiques.

Le contenu doit :
- Être spécifique à CETTE comparaison (pas générique)
- Mettre en valeur ce qui distingue vraiment ces deux SCPI l'une par rapport à l'autre
- Utiliser tes connaissances du marché SCPI français et européen en 2025-2026
- Être rédigé en français, ton expert mais accessible
- NE PAS répéter les chiffres déjà dans le tableau — apporter du contexte et de l'analyse

SCPI A : {json.dumps(fmt(prod_a), ensure_ascii=False)}
SCPI B : {json.dumps(fmt(prod_b), ensure_ascii=False)}

Réponds UNIQUEMENT en JSON valide avec cette structure exacte :
{{
  "description_a": "2-3 paragraphes sur {prod_a.get('nom')} dans le contexte de cette comparaison avec {prod_b.get('nom')}. Pourquoi choisir A plutôt que B ?",
  "description_b": "2-3 paragraphes sur {prod_b.get('nom')} dans le contexte de cette comparaison avec {prod_a.get('nom')}. Pourquoi choisir B plutôt que A ?",
  "points_forts_a": ["point 1", "point 2", "point 3", "point 4"],
  "points_faibles_a": ["point 1", "point 2", "point 3"],
  "points_forts_b": ["point 1", "point 2", "point 3", "point 4"],
  "points_faibles_b": ["point 1", "point 2", "point 3"],
  "verdict_si_a": ["profil 1", "profil 2", "profil 3"],
  "verdict_si_b": ["profil 1", "profil 2", "profil 3"]
}}

Les descriptions doivent être contextualisées : qu'est-ce que cette comparaison révèle ? Où A excelle par rapport à B ? Dans quels cas B est supérieure à A ?"""

    try:
        payload = json.dumps({
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 2000,
            "messages": [{"role": "user", "content": prompt}]
        }).encode("utf-8")

        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=payload,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        text = data["content"][0]["text"]
        # Nettoie les backticks si présents
        text = text.strip()
        if text.startswith("```"):
            text = "\n".join(text.split("\n")[1:])
        if text.endswith("```"):
            text = "\n".join(text.split("\n")[:-1])

        return json.loads(text)

    except Exception as e:
        print(f"  ⚠ API Claude : {e}")
        return {}



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


def generate_sitemap(site: dict, pairs: list, output_dir: Path) -> None:
    domain = site["domain"]
    base   = site["base_path"].rstrip("/")
    today  = date.today().isoformat()
    lines  = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        f'  <url><loc>{domain}{base}/</loc><priority>1.0</priority></url>',
    ]
    for slug_a, slug_b in pairs:
        lines.append(
            f'  <url><loc>{domain}{base}/{slug_a}-vs-{slug_b}</loc>'
            f'<lastmod>{today}</lastmod>'
            f'<changefreq>monthly</changefreq>'
            f'<priority>0.8</priority></url>'
        )
    lines.append("</urlset>")
    (output_dir / "sitemap.xml").write_text("\n".join(lines), encoding="utf-8")
    print(f"  ✓ sitemap.xml ({len(pairs)} URLs)")


def copy_shared_assets(output_dir: Path, site_dir: Path) -> None:
    for source_dir in [site_dir, SHARED_DIR]:
        js_src = source_dir / "sheets.js"
        if js_src.exists():
            shutil.copy2(js_src, output_dir / "sheets.js")
            print(f"  ✓ sheets.js copié depuis {source_dir.name}/")
            return
    print("  ⚠ sheets.js introuvable")


# ── Générateur principal ───────────────────────────────────────────────────────
def generate_site(site_slug: str, dry_run: bool = False, filter_pair: tuple = None) -> None:
    site_dir = SITES_DIR / site_slug
    if not site_dir.exists():
        print(f"❌ Site introuvable : {site_dir}")
        sys.exit(1)

    config        = load_yaml(site_dir / "config.yaml")
    products_yaml = load_yaml(site_dir / "products.yaml")

    site     = config["site"]
    theme    = config["theme"]
    criteria = config["criteria"]

    print(f"\n🚀 Génération site : {site_slug}")

    # ── Produits : Sheet CSV en priorité, YAML en fallback ──────────────────
    sheet_url = site.get("sheet_csv_url", "")
    products  = None

    if sheet_url and not dry_run:
        products = load_products_from_sheet(sheet_url)

    if products is None:
        products = products_yaml.get("products", [])
        src = "products.yaml" if not sheet_url else "products.yaml (fallback)"
        print(f"  📦 {len(products)} produits depuis {src}")

    print(f"   {len(products)} produits → {math.comb(len(products), 2)} paires")

    # ── Jinja2 ──────────────────────────────────────────────────────────────
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["capitalize"] = lambda s: s.capitalize() if s else ""

    template_file = site.get("template", "comparatif-vs.html.j2")
    template      = env.get_template(template_file)
    print(f"  Template : {template_file}")

    output_dir = site_dir / "output"
    if not dry_run:
        output_dir.mkdir(exist_ok=True)

    # ── Paires ──────────────────────────────────────────────────────────────
    all_slugs = [p["slug"] for p in products]
    all_pairs = list(itertools.combinations(sorted(all_slugs), 2))

    if filter_pair:
        all_pairs = [p for p in all_pairs if set(p) == set(filter_pair)]

    generated = 0
    skipped   = 0

    for slug_a, slug_b in all_pairs:
        prod_a = products_by_slug(products, slug_a)
        prod_b = products_by_slug(products, slug_b)

        if not prod_a or not prod_b:
            print(f"  ⚠ Slug introuvable : {slug_a} ou {slug_b}")
            skipped += 1
            continue

        seo     = build_seo(site, config["seo"], prod_a, prod_b)
        related = build_related_pages(slug_a, slug_b, products)

        # ── Génération éditoriale unique via API Claude ──────────────────
        use_ai = site.get("ai_editorial", True) and not dry_run
        if use_ai:
            editorial = generate_editorial(prod_a, prod_b)
            if editorial:
                # Injecte les textes uniques dans les copies des produits
                prod_a = dict(prod_a)
                prod_b = dict(prod_b)
                prod_a["description"]   = editorial.get("description_a",  prod_a.get("description", ""))
                prod_a["points_forts"]  = editorial.get("points_forts_a",  prod_a.get("points_forts", []))
                prod_a["points_faibles"]= editorial.get("points_faibles_a",prod_a.get("points_faibles", []))
                prod_a["verdict_si"]    = editorial.get("verdict_si_a",    prod_a.get("verdict_si", []))
                prod_b["description"]   = editorial.get("description_b",  prod_b.get("description", ""))
                prod_b["points_forts"]  = editorial.get("points_forts_b",  prod_b.get("points_forts", []))
                prod_b["points_faibles"]= editorial.get("points_faibles_b",prod_b.get("points_faibles", []))
                prod_b["verdict_si"]    = editorial.get("verdict_si_b",    prod_b.get("verdict_si", []))
                print(f"  ✍ Éditorial généré : {slug_a} vs {slug_b}")
            else:
                print(f"  ⚠ Éditorial fallback : {slug_a} vs {slug_b}")

        context = {
            "site":          {**site, "seo": config.get("seo", {})},
            "theme":         theme,
            "criteria":      criteria,
            "prod_a":        prod_a,
            "prod_b":        prod_b,
            "slug_a":        slug_a,
            "slug_b":        slug_b,
            "seo":           seo,
            "related_pages": related,
            "build_date":    date.today().isoformat(),
        }

        if dry_run:
            print(f"  [DRY] {slug_a}-vs-{slug_b}.html")
            generated += 1
            continue

        html = template.render(**context)
        (output_dir / f"{slug_a}-vs-{slug_b}.html").write_text(html, encoding="utf-8")
        generated += 1

    if not dry_run:
        generate_sitemap(site, all_pairs, output_dir)
        copy_shared_assets(output_dir, site_dir)

        # ── Home ──────────────────────────────────────────────────────────
        index_tpl_name = site.get("index_template", f"index-{site_slug}.html.j2")
        if (TEMPLATES_DIR / index_tpl_name).exists():
            zero_frais = sum(1 for p in products if str(p.get("frais_souscription", "99")) == "0")
            top_pairs  = [
                {
                    "url":   f"{a}-vs-{b}.html",
                    "label": f"{products_by_slug(products, a)['nom']} vs {products_by_slug(products, b)['nom']}"
                }
                for a, b in all_pairs[:8]
            ]
            html = env.get_template(index_tpl_name).render(
                site={**site, "seo": config.get("seo", {})},
                theme=theme,
                products=products,
                total_pairs=len(all_pairs),
                zero_frais_count=zero_frais,
                top_pairs=top_pairs,
                build_date=date.today().isoformat(),
            )
            (output_dir / "index.html").write_text(html, encoding="utf-8")
            print(f"  ✓ index.html ({len(products)} produits, {len(all_pairs)} comparatifs)")
        else:
            print(f"  ⚠ Template index introuvable : {index_tpl_name}")

        # ── Légales ───────────────────────────────────────────────────────
        for tpl_name, out_name in [
            ("mentions-legales.html.j2",         "mentions-legales.html"),
            ("politique-confidentialite.html.j2", "politique-confidentialite.html"),
        ]:
            if (TEMPLATES_DIR / tpl_name).exists():
                html = env.get_template(tpl_name).render(
                    site={**site, "seo": config.get("seo", {})},
                    theme=theme,
                    build_date=date.today().isoformat(),
                )
                (output_dir / out_name).write_text(html, encoding="utf-8")
                print(f"  ✓ {out_name}")

    status = "[DRY RUN] " if dry_run else ""
    print(f"\n  {status}✅ {generated} pages générées, {skipped} ignorées")
    if not dry_run:
        print(f"  📁 Output : {output_dir}")


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Générateur comparatifs statiques")
    parser.add_argument("--site",    help="Slug du site (ex: scpi)")
    parser.add_argument("--all",     action="store_true", help="Génère tous les sites")
    parser.add_argument("--dry-run", action="store_true", help="Simule sans écrire")
    parser.add_argument("--pair",    help="Filtre une paire (ex: remake-live,iroko-zen)")
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