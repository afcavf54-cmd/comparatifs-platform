#!/usr/bin/env python3
"""
enrich_editorial.py — Génération IA de tous les textes éditoriaux
À exécuter AVANT generate.py dans le workflow GitHub Actions.

Usage:
  python platform/scripts/enrich_editorial.py --site scpi
  python platform/scripts/enrich_editorial.py --site scpi --only pairs
  python platform/scripts/enrich_editorial.py --site scpi --only products
  python platform/scripts/enrich_editorial.py --site scpi --only site
"""

import argparse
import csv
import io
import itertools
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
ROOT      = Path(__file__).parent.parent
SITES_DIR = ROOT / "sites"
MODEL     = "claude-sonnet-4-20250514"
MAX_TOKENS = 4096
MAX_RETRIES = 3
RETRY_DELAY = 3  # secondes

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
if not ANTHROPIC_API_KEY:
    print("❌ ANTHROPIC_API_KEY manquante dans l'environnement")
    sys.exit(1)

# ── API Claude ────────────────────────────────────────────────────────────────
def call_claude(prompt: str) -> str:
    """Appel API Claude avec retry et backoff exponentiel."""
    payload = json.dumps({
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "messages": [{"role": "user", "content": prompt}]
    }).encode("utf-8")

    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                "https://api.anthropic.com/v1/messages",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                }
            )
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read())
                return data["content"][0]["text"]

        except Exception as e:
            wait = RETRY_DELAY * (2 ** attempt)
            print(f"    ⚠ Tentative {attempt+1}/{MAX_RETRIES} échouée : {e}")
            if attempt < MAX_RETRIES - 1:
                print(f"    ⏳ Nouvelle tentative dans {wait}s...")
                time.sleep(wait)
            else:
                print(f"    ❌ Échec définitif après {MAX_RETRIES} tentatives")
                raise
    return ""


def parse_json(text: str, context: str = "") -> dict:
    """Parse JSON depuis la réponse Claude (enlève les backticks markdown si présents)."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Trouve le début et la fin du bloc
        start = 1
        end = len(lines) - 1
        if lines[-1].strip() == "```":
            end = len(lines) - 1
        text = "\n".join(lines[start:end])
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        print(f"    ⚠ JSON invalide ({context}) : {e}")
        print(f"    Réponse brute : {text[:300]}...")
        return {}


# ── Chargement produits ───────────────────────────────────────────────────────
STRING_FIELDS = {
    'geo', 'secteurs', 'pays', 'investissement_min', 'tri_horizon',
    'nom', 'marque', 'type', 'slug', 'description', 'url_affiliation',
}

def cast(val):
    if val in ("", None): return None
    try: return int(val)
    except: pass
    try: return float(val)
    except: pass
    return val

def load_products(site_dir: Path, config: dict) -> list:
    """Charge les produits depuis le Google Sheet ou products.yaml."""
    import yaml
    sheet_url = config.get("site", {}).get("sheet_csv_url", "")
    if sheet_url:
        try:
            req = urllib.request.Request(
                sheet_url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; SCPI-Enricher/1.0)"}
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                text = resp.read().decode("utf-8")
            reader = csv.DictReader(io.StringIO(text))
            products = []
            for row in reader:
                slug = row.get("slug", "").strip()
                if not slug: continue
                prod = {k.strip(): (v.strip() if k.strip() in STRING_FIELDS else cast(v.strip()))
                        for k, v in row.items() if k.strip()}
                if str(prod.get("disponible", "1")) != "0":
                    products.append(prod)
            print(f"  ✓ {len(products)} produits depuis Sheet")
            return products
        except Exception as e:
            print(f"  ⚠ Sheet indisponible ({e}), fallback products.yaml")

    products_path = site_dir / "products.yaml"
    if products_path.exists():
        import yaml
        with open(products_path) as f:
            data = yaml.safe_load(f)
        return data.get("products", [])
    return []


# ── Prompts ───────────────────────────────────────────────────────────────────
def prod_summary(prod: dict) -> str:
    """Résumé compact d'un produit pour inclusion dans les prompts."""
    fields = ["nom", "marque", "type", "td", "tri", "tri_horizon", "pga", "tof",
              "prix_achat", "prix_retrait", "frais_souscription", "frais_gestion",
              "delai_jouissance", "endettement", "capitalisation", "investissement_min",
              "pays", "geo", "secteurs"]
    return json.dumps({k: prod[k] for k in fields if k in prod and prod[k] is not None},
                      ensure_ascii=False)


def prompt_pair(prod_a: dict, prod_b: dict, year: int) -> str:
    return f"""Tu es rédacteur expert en investissement immobilier SCPI. Tu vas générer tous les textes éditoriaux pour la page comparatif {prod_a['nom']} vs {prod_b['nom']} en {year}.

DONNÉES {prod_a['nom'].upper()} : {prod_summary(prod_a)}
DONNÉES {prod_b['nom'].upper()} : {prod_summary(prod_b)}

RÈGLES ÉDITORIALES :
- Style direct, chiffré, avec les vrais nombres entre guillemets gras dans les descriptions
- Pas de superlatif vide (excellent, remarquable), des faits concrets
- Paragraphes séparés par \\n\\n dans les champs texte
- Les listes sont des tableaux JSON de chaînes courtes (max 15 mots par item)
- Les FAQ répondent précisément avec les chiffres réels

Réponds UNIQUEMENT avec le JSON suivant, sans markdown, sans preamble :
{{
  "intro_edito": "Paragraphe d'accroche 3-4 phrases unique et personnalisé pour {prod_a['nom']} vs {prod_b['nom']}, avec les vrais chiffres TD et TRI",
  "description_a": "Présentation {prod_a['nom']} en 3-4 paragraphes séparés par \\n\\n, style analytique, chiffres en avant",
  "description_b": "Présentation {prod_b['nom']} en 3-4 paragraphes séparés par \\n\\n, style analytique, chiffres en avant",
  "points_forts_a": ["point fort 1 avec chiffre", "point fort 2", "point fort 3", "point fort 4"],
  "points_faibles_a": ["point faible 1", "point faible 2", "point faible 3"],
  "points_forts_b": ["point fort 1 avec chiffre", "point fort 2", "point fort 3", "point fort 4"],
  "points_faibles_b": ["point faible 1", "point faible 2", "point faible 3"],
  "verdict_si_a": ["Vous cherchez [critère spécifique]", "Votre TMI [situation]", "Vous [profil]"],
  "verdict_si_b": ["Vous cherchez [critère spécifique]", "Votre TMI [situation]", "Vous [profil]"],
  "mix_text": "2-3 phrases sur la complémentarité de {prod_a['nom']} et {prod_b['nom']} dans un portefeuille",
  "expert_performance": "2 phrases d'analyse experte sur la performance de CETTE paire spécifiquement (TD et TRI comparés)",
  "expert_fiscalite": "2 phrases sur l'avantage fiscal de cette paire pour les TMI élevées (% hors France des deux SCPI)",
  "expert_frais": "2 phrases sur la structure de frais de cette paire comparée (frais souscription + gestion)",
  "expert_decote": "2 phrases sur le coût réel de sortie de cette paire (décote prix retrait/achat)",
  "faq_vs": [
    {{"q": "{prod_a['nom']} ou {prod_b['nom']} : laquelle choisir en {year} ?", "a": "Réponse détaillée avec chiffres"}},
    {{"q": "Quel est le meilleur rendement entre {prod_a['nom']} et {prod_b['nom']} ?", "a": "Réponse avec TD et TRI réels"}},
    {{"q": "Peut-on combiner {prod_a['nom']} et {prod_b['nom']} ?", "a": "Réponse sur la diversification"}},
    {{"q": "Question spécifique à cette paire sur les frais ?", "a": "Réponse chiffrée"}},
    {{"q": "Question sur la géographie ou la fiscalité ?", "a": "Réponse précise"}},
    {{"q": "Question sur le profil investisseur idéal ?", "a": "Réponse profilée"}}
  ]
}}"""


def prompt_product(prod: dict, year: int) -> str:
    return f"""Tu es rédacteur expert en investissement immobilier SCPI. Tu vas générer tous les textes éditoriaux pour la page avis {prod['nom']} en {year}.

DONNÉES : {prod_summary(prod)}

RÈGLES : style direct, chiffres concrets, paragraphes séparés par \\n\\n, listes courtes (max 15 mots/item). INTERDIT : tiret long (—) et demi-tiret (–) partout.

Réponds UNIQUEMENT avec le JSON suivant, sans markdown, sans preamble :
{{
  "short_desc": "Description de 250 caractères max pour la page liste comparatifs, accrocheur avec chiffre clé",
  "description": "Présentation approfondie de {prod['nom']} en 4-5 paragraphes séparés par \\n\\n, stratégie, historique, différenciants",
  "td_analyse": "2-3 phrases d'analyse du TD et TRI de {prod['nom']} spécifiquement, avec contexte marché",
  "points_forts": ["point 1 avec chiffre", "point 2", "point 3", "point 4"],
  "points_faibles": ["point 1", "point 2", "point 3"],
  "risk_note": "1-2 phrases sur les risques spécifiques à {prod['nom']} (pas génériques)",
  "verdict_text": "3-4 phrases de verdict expert personnalisé sur {prod['nom']} pour quel profil d'investisseur",
  "verdict_si": ["Vous cherchez [critère]", "Vous avez une TMI [situation]", "Votre horizon [durée]", "Vous [profil]"],
  "concurrents_text": "2-3 phrases sur comment choisir entre {prod['nom']} et ses principales alternatives",
  "faq_avis": [
    {{"q": "Qu'est-ce que {prod['nom']} ?", "a": "Réponse complète et précise"}},
    {{"q": "Comment souscrire à {prod['nom']} ?", "a": "Réponse avec montants réels"}},
    {{"q": "Quels sont les frais de {prod['nom']} ?", "a": "Détail frais souscription + gestion"}},
    {{"q": "Quel est le rendement de {prod['nom']} en {year} ?", "a": "Réponse avec TD, TRI, PGA"}},
    {{"q": "{prod['nom']} est-elle une bonne SCPI en {year} ?", "a": "Verdict nuancé avec pour/contre"}}
  ]
}}"""


def prompt_site(site_config: dict) -> str:
    name = site_config.get("name", "le site")
    return f"""Tu es rédacteur expert en investissement SCPI. Génère les textes des 3 cards "Pourquoi comparer les SCPI ?" pour {name}.

Réponds UNIQUEMENT avec le JSON suivant, sans markdown, sans preamble :
{{
  "why_cards": [
    {{"icon": "📊", "title": "Données officielles", "text": "2-3 phrases percutantes sur la fiabilité et la source des données (rapports annuels, bulletins trimestriels)"}},
    {{"icon": "🔍", "title": "Analyse indépendante", "text": "2-3 phrases sur l'indépendance éditoriale et la méthode d'analyse (frais réels, TRI, fiscalité)"}},
    {{"icon": "💡", "title": "Conseil fiscal inclus", "text": "2-3 phrases sur l'intégration de la fiscalité (TMI, prélèvements sociaux 17,2%, SCPI européennes)"}}
  ]
}}"""


# ── Sauvegarde incrémentale ───────────────────────────────────────────────────
def save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_json(path: Path) -> dict:
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {}


# ── Génération ────────────────────────────────────────────────────────────────
def generate_pairs(products: list, site_dir: Path, year: int) -> None:
    """Génère editorial.json — un appel par paire."""
    editorial_path = site_dir / "editorial.json"
    editorial = {}  # On repart de zéro à chaque run

    slugs = [p["slug"] for p in products]
    pairs = list(itertools.combinations(sorted(slugs), 2))
    prod_map = {p["slug"]: p for p in products}

    print(f"\n  📝 Génération paires ({len(pairs)} appels API)...")

    failures = []
    for i, (slug_a, slug_b) in enumerate(pairs, 1):
        pa = prod_map[slug_a]
        pb = prod_map[slug_b]
        key = f"{slug_a}-vs-{slug_b}"
        print(f"  [{i:02d}/{len(pairs)}] {pa['nom']} vs {pb['nom']}...", end=" ", flush=True)

        try:
            response = call_claude(prompt_pair(pa, pb, year))
            data = parse_json(response, key)
            if data:
                editorial[key] = data
                save_json(editorial_path, editorial)
                print("✓")
            else:
                print("⚠ JSON vide")
                failures.append(key)
        except Exception as e:
            print(f"❌ {e}")
            failures.append(key)

    if failures:
        print(f"  ❌ {len(failures)} paires échouées : {failures}")
        sys.exit(1)
    print(f"  ✅ {len(editorial)}/{len(pairs)} paires générées → editorial.json")


def generate_products(products: list, site_dir: Path, year: int) -> None:
    """Génère products_editorial.json — un appel par produit."""
    products_editorial_path = site_dir / "products_editorial.json"
    products_editorial = {}

    print(f"\n  👤 Génération produits ({len(products)} appels API)...")

    failures = []
    for i, prod in enumerate(products, 1):
        slug = prod["slug"]
        print(f"  [{i:02d}/{len(products)}] {prod['nom']}...", end=" ", flush=True)

        try:
            response = call_claude(prompt_product(prod, year))
            data = parse_json(response, slug)
            if data:
                products_editorial[slug] = data
                save_json(products_editorial_path, products_editorial)
                print("✓")
            else:
                print("⚠ JSON vide")
                failures.append(slug)
        except Exception as e:
            print(f"❌ {e}")
            failures.append(slug)

    if failures:
        print(f"  ❌ {len(failures)} produits échoués : {failures}")
        sys.exit(1)
    print(f"  ✅ {len(products_editorial)}/{len(products)} produits générés → products_editorial.json")


def generate_site(site_config: dict, site_dir: Path) -> None:
    """Génère site_editorial.json — 1 appel."""
    site_editorial_path = site_dir / "site_editorial.json"

    print(f"\n  🌐 Génération site (1 appel API)...", end=" ", flush=True)

    try:
        response = call_claude(prompt_site(site_config))
        data = parse_json(response, "site")
        if data:
            save_json(site_editorial_path, data)
            print("✓ → site_editorial.json")
        else:
            print("⚠ JSON vide")
            sys.exit(1)
    except Exception as e:
        print(f"❌ {e}")
        sys.exit(1)


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    import yaml

    parser = argparse.ArgumentParser(description="Génération IA des textes éditoriaux")
    parser.add_argument("--site", required=True, help="Slug du site (ex: scpi)")
    parser.add_argument("--only", choices=["pairs", "products", "site"],
                        help="Générer seulement une catégorie")
    args = parser.parse_args()

    site_dir = SITES_DIR / args.site
    if not site_dir.exists():
        print(f"❌ Site introuvable : {site_dir}")
        sys.exit(1)

    config_path = site_dir / "config.yaml"
    with open(config_path, encoding="utf-8") as f:
        config = yaml.safe_load(f)

    site_config = config["site"]
    year = site_config.get("year", 2026)

    print(f"\n🤖 Enrich editorial — site : {args.site} ({year})")
    print(f"   Modèle : {MODEL}")

    products = load_products(site_dir, config)
    if not products:
        print("❌ Aucun produit chargé")
        sys.exit(1)

    only = args.only

    if only in (None, "site"):
        generate_site(site_config, site_dir)

    if only in (None, "products"):
        generate_products(products, site_dir, year)

    if only in (None, "pairs"):
        generate_pairs(products, site_dir, year)

    print(f"\n✅ Enrichissement terminé pour {args.site}")


if __name__ == "__main__":
    main()
