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
import re as _re
import sys
import time
import unicodedata as _unicodedata
import urllib.request
from pathlib import Path

def slugify_cat(s: str) -> str:
    s = s.replace('’', ' ').replace('‘', ' ').replace("'", ' ').replace("'", ' ')
    s = _unicodedata.normalize('NFD', s)
    s = s.encode('ascii', 'ignore').decode('ascii')
    s = s.lower()
    s = _re.sub(r"[^a-z0-9]+", '-', s)
    return s.strip('-')

# ── Config ────────────────────────────────────────────────────────────────────
ROOT      = Path(__file__).parent.parent
SITES_DIR = ROOT / "sites"
MODEL     = "claude-sonnet-4-20250514"
MAX_TOKENS = 4096
MAX_RETRIES = 100
RETRY_CYCLE = [30, 60, 300, 900, 1800, 3600]  # pattern cyclique : 30s, 1min, 5min, 15min, 30min, 1h

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
if not ANTHROPIC_API_KEY:
    print("❌ ANTHROPIC_API_KEY manquante dans l'environnement")
    sys.exit(1)

# ── API Claude ────────────────────────────────────────────────────────────────
def call_claude_fast(prompt: str, system: str = None, max_retries: int = 3) -> str:
    """Appel API Claude avec peu de retries — pour génération classement."""
    body: dict = {
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "messages": [{"role": "user", "content": prompt}]
    }
    if system:
        body["system"] = system
    payload = json.dumps(body).encode("utf-8")

    for attempt in range(max_retries):
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
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read())
                return data["content"][0]["text"]
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', errors='replace')
            print(f"    ⚠ Tentative {attempt+1}/{max_retries} : HTTP {e.code} — {body[:300]}")
            if attempt < max_retries - 1:
                time.sleep([10, 30, 60][attempt])
            else:
                raise
        except Exception as e:
            print(f"    ⚠ Tentative {attempt+1}/{max_retries} : {e}")
            if attempt < max_retries - 1:
                time.sleep([10, 30, 60][attempt])
            else:
                raise
    return ""


def call_claude(prompt: str, system: str = None) -> str:
    """Appel API Claude avec retry et backoff exponentiel."""
    body: dict = {
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "messages": [{"role": "user", "content": prompt}]
    }
    if system:
        body["system"] = system
    payload = json.dumps(body).encode("utf-8")

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
            print(f"    ⚠ Tentative {attempt+1}/{MAX_RETRIES} échouée : {e}")
            if attempt < MAX_RETRIES - 1:
                wait = RETRY_CYCLE[attempt % len(RETRY_CYCLE)]
                mins = wait // 60
                secs = wait % 60
                wait_str = f"{mins}min {secs}s" if mins > 0 else f"{secs}s"
                print(f"    ⏳ Nouvelle tentative dans {wait_str}... ({attempt+1}/{MAX_RETRIES})")
                time.sleep(wait)
            else:
                print(f"    ❌ Échec définitif après {MAX_RETRIES} tentatives")
                raise
    return ""


def clean_quotes_in_values(obj):
    """Supprime les guillemets autour des chiffres dans les valeurs texte.
    Ex: 'taux de "5,71%"' → 'taux de 5,71%'
    """
    import re
    if isinstance(obj, dict):
        return {k: clean_quotes_in_values(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_quotes_in_values(i) for i in obj]
    elif isinstance(obj, str):
        # Supprime les guillemets autour des nombres/pourcentages
        import re as _re
        obj = _re.sub('"(\\d[\\d\\s,.€%M ]*)"', lambda m: m.group(1), obj)
        return obj
    return obj


def clean_json_text(text: str) -> str:
    """Nettoie le texte avant parsing JSON."""
    import re
    # Enlève backticks markdown
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        start = 1
        end = len(lines) - 1
        if lines[-1].strip() == "```":
            end = len(lines) - 1
        text = "\n".join(lines[start:end]).strip()
    # Guillemets français
    text = text.replace("«", "").replace("»", "")
    text = text.replace("\u00ab", "").replace("\u00bb", "")
    # Markdown bold
    text = re.sub(r"\*\*([^\*]*)\*\*", r"\1", text)
    return text


def fix_inner_quotes(text: str) -> str:
    """
    Répare les guillemets droits DANS les valeurs de string JSON.
    Haiku écrit : "intro": "valeur " 9 % " suite"
    On doit produire : "intro": "valeur 9 % suite"
    """
    import re
    result = []
    i = 0
    in_string = False
    escape_next = False
    string_start = -1

    while i < len(text):
        ch = text[i]
        if escape_next:
            result.append(ch)
            escape_next = False
            i += 1
            continue
        if ch == "\\":
            result.append(ch)
            escape_next = True
            i += 1
            continue
        if ch == '"' and not in_string:
            in_string = True
            string_start = i
            result.append(ch)
            i += 1
            continue
        if ch == '"' and in_string:
            # Vérifie si c'est une vraie fin de string ou un guillemet intérieur parasite
            # Fin de string = suivi de : , } ] \n ou espace+:
            rest = text[i+1:].lstrip()
            if rest and rest[0] in (',', '}', ']', '\n', ':'):
                in_string = False
                result.append(ch)
            else:
                # C'est un guillemet parasite à l'intérieur — on le remplace par rien
                result.append(' ')
            i += 1
            continue
        result.append(ch)
        i += 1

    return "".join(result)


def parse_json(text: str, context: str = "") -> dict:
    """Parse JSON depuis la réponse Claude avec nettoyage agressif."""
    text = clean_json_text(text)
    # Essai 1 : direct
    try:
        result = json.loads(text)
        return clean_quotes_in_values(result)
    except json.JSONDecodeError:
        pass
    # Essai 2 : fix guillemets intérieurs
    try:
        fixed = fix_inner_quotes(text)
        result = json.loads(fixed)
        return clean_quotes_in_values(result)
    except json.JSONDecodeError as e:
        print(f"    ⚠ JSON invalide ({context}) : {e}")
        print(f"    Réponse brute : {text[:200]}...")
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
def generate_pairs(products: list, site_dir: Path, year: int, skip_existing: bool = False) -> None:
    """Génère editorial.json — un appel par paire."""
    editorial_path = site_dir / "editorial.json"
    editorial = load_json(editorial_path) if skip_existing else {}  # Charge existants si skip_existing

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

        if skip_existing and key in editorial:
            print("⏭ déjà généré")
            continue

        success = False
        for json_attempt in range(5):
            try:
                response = call_claude(prompt_pair(pa, pb, year))
                data = parse_json(response, key)
                if data:
                    editorial[key] = data
                    save_json(editorial_path, editorial)
                    print("✓" if json_attempt == 0 else f"✓ (retry JSON {json_attempt})")
                    success = True
                    break
                else:
                    if json_attempt < 4:
                        wait = [5, 15, 30, 60][json_attempt]
                        print(f"\n    ⚠ JSON vide, retry {json_attempt+1}/4 dans {wait}s...", end=" ", flush=True)
                        time.sleep(wait)
                    else:
                        print("\n    ⚠ JSON vide après 4 retries")
            except Exception as e:
                print(f"\n    ❌ {e}")
                break
        if not success:
            failures.append(key)
        time.sleep(3)  # Pause entre appels pour éviter 529

    # Sauvegarde le statut (paires manquantes)
    status = load_json(site_dir / "generation_status.json")
    status["pairs_total"] = len(pairs)
    status["pairs_done"] = len(editorial)
    status["pairs_failed"] = failures
    status["pairs_complete"] = len(failures) == 0
    save_json(site_dir / "generation_status.json", status)

    if failures:
        print(f"  ⚠ {len(failures)} paires incomplètes (seront retentées) : {failures}")
    print(f"  ✅ {len(editorial)}/{len(pairs)} paires générées → editorial.json")


def generate_products(products: list, site_dir: Path, year: int, skip_existing: bool = False) -> None:
    """Génère products_editorial.json — un appel par produit."""
    products_editorial_path = site_dir / "products_editorial.json"
    products_editorial = load_json(products_editorial_path) if skip_existing else {}

    print(f"\n  👤 Génération produits ({len(products)} appels API)...")

    failures = []
    for i, prod in enumerate(products, 1):
        slug = prod["slug"]
        print(f"  [{i:02d}/{len(products)}] {prod['nom']}...", end=" ", flush=True)

        if skip_existing and slug in products_editorial:
            print("⏭ déjà généré")
            continue

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

    status = load_json(site_dir / "generation_status.json")
    status["products_total"] = len(products)
    status["products_done"] = len(products_editorial)
    status["products_failed"] = failures
    status["products_complete"] = len(failures) == 0
    save_json(site_dir / "generation_status.json", status)

    if failures:
        print(f"  ⚠ {len(failures)} produits incomplets (seront retentés)")
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
            print("⚠ JSON vide, sera retenté")
    except Exception as e:
        print(f"⚠ Erreur site editorial : {e}, sera retenté")


def load_schema_keywords(site_dir: Path) -> dict:
    """Charge les keywords (types de logiciels + prompts) depuis le schema classement."""
    # Chercher le schema via config.yaml
    config_path = site_dir / "config.yaml"
    if not config_path.exists():
        return {}
    import yaml
    with open(config_path, encoding='utf-8') as f:
        config = yaml.safe_load(f)
    page_types = config.get('page_types', {})
    schema_name = page_types.get('classement', '')
    if not schema_name:
        return {}
    schema_path = site_dir.parent.parent / 'schemas' / f'{schema_name}.json'
    if not schema_path.exists():
        return {}
    import json
    with open(schema_path, encoding='utf-8') as f:
        schema = json.load(f)
    return schema.get('keywords', {})


def generate_classement(products: list, site_dir: Path, year: int, skip_existing: bool = False) -> None:
    """Génère les textes éditoriaux pour les pages classement (groupées par catégorie)."""
    editorial_path = site_dir / "editorial.json"
    editorial = load_json(editorial_path) if editorial_path.exists() else {}

    # Charger les keywords et prompts custom depuis le schema
    schema_keywords = load_schema_keywords(site_dir)

    # Grouper par catégorie
    categories: dict = {}
    for prod in products:
        cat = prod.get("categorie", "").strip()
        if cat:
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(prod)

    if not categories:
        return

    print(f"\n  📊 Génération classements ({len(categories)} catégories)...")

    for cat, cat_products in categories.items():
        cat_slug = slugify_cat(cat)
        key = f"classement-{cat_slug}"

        if skip_existing and key in editorial:
            print(f"  [{cat}] ⏭ déjà généré")
            continue

        print(f"  [{cat}] {len(cat_products)} produits...", end=" ", flush=True)

        produits_str = ", ".join([p.get("nom", "") for p in cat_products[:8]])

        # Chercher le keyword correspondant dans le schema (correspondance par nom)
        keyword_data = {}
        for kw_name, kw_data in schema_keywords.items():
            if kw_name.lower() == cat.lower() or cat.lower() in kw_name.lower() or kw_name.lower() in cat.lower():
                keyword_data = kw_data
                break

        # Utiliser les prompts custom si disponibles, sinon fallback générique
        prompt_intro = keyword_data.get('prompt_intro', '').replace('{produits}', produits_str).replace('{year}', str(year)).replace('{theme}', cat)
        prompt_classement = keyword_data.get('prompt_classement', '').replace('{produits}', produits_str).replace('{year}', str(year)).replace('{theme}', cat)
        prompt_contenu = keyword_data.get('prompt_contenu', '').replace('{produits}', produits_str).replace('{year}', str(year)).replace('{theme}', cat)
        prompt_faq = keyword_data.get('prompt_faq', '').replace('{produits}', produits_str).replace('{year}', str(year)).replace('{theme}', cat)

        if prompt_intro or prompt_contenu:
            # Génération avec prompts custom
            print(f"\n    → prompts custom détectés")
            result = {}

            for section_key, section_prompt, is_json in [
                ('intro', prompt_intro, False),
                ('contenu_custom', prompt_contenu, False),
                ('faq', prompt_faq, True),
            ]:
                if not section_prompt:
                    continue
                print(f"    [{section_key}]...", end=" ", flush=True)
                sys_prompt = 'Tu es un expert rédacteur SEO. Réponds UNIQUEMENT en JSON valide sans backticks, sans preamble.' if is_json else 'Tu es un expert rédacteur SEO. Aucun tiret long (— ou –). Aucun markdown. Réponds uniquement avec le contenu HTML demandé.'
                for attempt in range(3):
                    try:
                        response = call_claude_fast(section_prompt, system=sys_prompt)
                        if is_json:
                            clean = response.replace('```json', '').replace('```', '').strip()
                            try:
                                result[section_key] = json.loads(clean)
                                print("✓"); break
                            except:
                                if attempt < 4: time.sleep([5, 15, 30, 60][attempt])
                        else:
                            result[section_key] = response.strip()
                            print("✓"); break
                    except Exception as e:
                        print(f"❌ {e}"); break
                time.sleep(2)

            # Descriptions produit par produit
            if prompt_classement:
                descriptions = {}
                for prod in cat_products:
                    nom = prod.get('nom', '')
                    p_prompt = prompt_classement.replace('[NOM DU SITE]', nom).replace('{nom}', nom)
                    print(f"    [desc {nom}]...", end=" ", flush=True)
                    for attempt in range(3):
                        try:
                            response = call_claude_fast(p_prompt)
                            descriptions[prod.get('slug', nom)] = response.strip()
                            print("✓"); break
                        except Exception as e:
                            print(f"❌ {e}"); break
                    time.sleep(2)
                result['descriptions_produits'] = descriptions

            editorial[key] = result
            save_json(editorial_path, editorial)
            print(f"  ✓ {cat} généré")

        else:
            # Fallback : prompt générique
            niche = cat_products[0].get("niche", "") if cat_products else ""
            niche_context = f" (niche : {niche})" if niche else ""
            prompt_generic = f"""Expert en logiciels et rédacteur SEO. Génère les textes éditoriaux pour une page classement des meilleurs {cat}{niche_context} en {year}.

Produits à classer : {produits_str}

Règles : paragraphes 3 lignes max, <strong> sur les chiffres/mots clés, aucun tiret long.

Réponds UNIQUEMENT en JSON valide sans backticks :
{{
  "intro": "3 paragraphes HTML sur les enjeux du choix",
  "en_bref": "<ul> avec 5 items logiciel + profil cible idéal",
  "criteres_choix": "3 paragraphes HTML sur les critères de sélection",
  "fonctionnalites": "3 paragraphes HTML sur les fonctionnalités indispensables",
  "faq": [{{"q": "question", "a": "réponse"}}, ...]
}}"""
            for attempt in range(3):
                try:
                    response = call_claude_fast(prompt_generic)
                    data = parse_json(response, key)
                    if data:
                        editorial[key] = data
                        save_json(editorial_path, editorial)
                        print(f"✓" if attempt == 0 else f"✓ (retry {attempt})")
                        break
                    else:
                        if attempt < 4:
                            time.sleep([5, 15, 30, 60][attempt])
                except Exception as e:
                    print(f"\n    ❌ {e}"); break

        time.sleep(3)

    # Génère aussi la description de chaque produit dans sa catégorie
    for cat, cat_products in categories.items():
        for prod in cat_products:
            slug = prod.get("slug", "")
            prod_key = f"classement-prod-{slug}"
            if skip_existing and prod_key in editorial:
                continue

            nom = prod.get("nom", "")
            marque = prod.get("marque", "")
            print(f"  [desc {nom}]...", end=" ", flush=True)

            niche_prod = prod.get("niche", "")
            niche_prod_ctx = f" ({niche_prod})" if niche_prod else ""
            prompt = f"""Expert rédacteur SEO. Génère les textes pour la fiche du logiciel {nom} ({marque}) dans un classement des meilleurs {cat}{niche_prod_ctx}.

Réponds UNIQUEMENT en JSON valide sans backticks :
{{
  "description": "3 paragraphes HTML de 200 mots sur {nom}, ses fonctionnalités clés, sa cible, ce qui le différencie. <strong> sur les points clés. Aucun tiret long.",
  "points_forts": ["point fort 1", "point fort 2", "point fort 3", "point fort 4"],
  "points_faibles": ["point faible 1", "point faible 2", "point faible 3"]
}}"""

            for attempt in range(5):
                try:
                    response = call_claude(prompt)
                    data = parse_json(response, prod_key)
                    if data:
                        editorial[prod_key] = data
                        save_json(editorial_path, editorial)
                        print("✓")
                        break
                    else:
                        if attempt < 4:
                            time.sleep([5, 15, 30, 60][attempt])
                except Exception as e:
                    print(f"❌ {e}")
                    break
            time.sleep(2)


def is_generation_complete(site_dir: Path) -> bool:
    """Vérifie si tous les textes sont générés."""
    status = load_json(site_dir / "generation_status.json")
    return (
        status.get("pairs_complete", False) and
        status.get("products_complete", False) and
        (site_dir / "site_editorial.json").exists() and
        load_json(site_dir / "site_editorial.json") != {}
    )


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    import yaml

    parser = argparse.ArgumentParser(description="Génération IA des textes éditoriaux")
    parser.add_argument("--site", required=True, help="Slug du site (ex: scpi)")
    parser.add_argument("--only", choices=["pairs", "products", "site"],
                        help="Générer seulement une catégorie")
    parser.add_argument("--skip-existing", action="store_true",
                        help="Saute les entrées déjà générées (économise les tokens)")
    parser.add_argument("--schedule", help="Heure de lancement au format HH:MM (ex: 02:00)")
    args = parser.parse_args()

    # Attendre l'heure programmée si --schedule est spécifié
    if args.schedule:
        from datetime import datetime, timedelta
        target_h, target_m = map(int, args.schedule.split(":"))
        now = datetime.now()
        target = now.replace(hour=target_h, minute=target_m, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)  # Demain si l'heure est déjà passée
        wait_sec = (target - now).total_seconds()
        print(f"  ⏰ Démarrage programmé à {args.schedule} (dans {int(wait_sec//3600)}h{int((wait_sec%3600)//60)}min)")
        time.sleep(wait_sec)
        print(f"  🚀 Démarrage !")

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
        # Site classement sans sheet global — pas d'erreur
        page_types = config.get("page_types", {})
        sheet_url = site_config.get("sheet_csv_url", "")
        if page_types.get("classement") and not sheet_url:
            print("ℹ️ Site classement sans sheet global — génération ignorée")
            print("  Configurez les sheets par catégorie dans le dashboard Modèles → Mots clés")
            sys.exit(0)
        print("❌ Aucun produit chargé")
        sys.exit(1)

    only = args.only
    page_types = config.get("page_types", {})
    is_classement_site = bool(page_types.get("classement")) and not page_types.get("vs") and not page_types.get("avis")

    if is_classement_site:
        # Site classement SaaS — uniquement generate_classement
        print(f"  📊 Site classement détecté — génération classements uniquement")
        generate_classement(products, site_dir, year, skip_existing=args.skip_existing)
    else:
        # Site comparatif SCPI — pipeline normal
        if only in (None, "site"):
            generate_site(site_config, site_dir)

        if only in (None, "products"):
            generate_products(products, site_dir, year, skip_existing=args.skip_existing)

        if only in (None, "pairs"):
            generate_pairs(products, site_dir, year, skip_existing=args.skip_existing)

        # Génération classements si aussi configurés
        if page_types.get("classement") and only in (None, "classement"):
            generate_classement(products, site_dir, year, skip_existing=args.skip_existing)

    print(f"\n✅ Enrichissement terminé pour {args.site}")


if __name__ == "__main__":
    main()
