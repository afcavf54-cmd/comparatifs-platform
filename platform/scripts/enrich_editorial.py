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

# Compteurs de tokens API
_total_input_tokens = 0
_total_output_tokens = 0
import re as _re

def strip_html_for_prompt(text: str) -> str:
    """Nettoie le HTML produit par l'éditeur visuel avant envoi à Claude."""
    if not text:
        return ''
    # Remplacer les <br> par des sauts de ligne
    text = _re.sub(r'<br\s*/?>', '\n', text)
    # Remplacer les </p>, </div>, </li> par des sauts de ligne
    text = _re.sub(r'</(p|div|li|h[1-6]|pre|code)>', '\n', text)
    # Supprimer toutes les autres balises HTML
    text = _re.sub(r'<[^>]+>', '', text)
    # Décoder les entités HTML basiques
    text = text.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&').replace('&nbsp;', ' ').replace('&quot;', '"')
    # Nettoyer les lignes vides multiples
    text = _re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()
from pathlib import Path

def slugify_cat(s: str) -> str:
    s = s.replace('’', ' ').replace('‘', ' ').replace("'", ' ').replace("'", ' ')
    s = _unicodedata.normalize('NFD', s)
    s = s.encode('ascii', 'ignore').decode('ascii')
    s = s.lower()
    s = _re.sub(r"[^a-z0-9]+", '-', s)
    return s.strip('-')


def _load_enabled_classements(site_dir):
    """Charge la liste blanche `enabled_classements.json` du site.
    Mêmes règles que dans generate.py :
      - Fichier absent      → None (= mode legacy, tout activé)
      - Fichier présent     → set[str] des slugs activés
      - Fichier mal formé   → None + warning (fail-safe)
    """
    path = site_dir / "enabled_classements.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        slugs = data.get("classements") or []
        if not isinstance(slugs, list):
            print(f"  ⚠ {path.name} : 'classements' doit être un array — tout activé par défaut")
            return None
        return set(s.strip().lower() for s in slugs if isinstance(s, str))
    except Exception as e:
        print(f"  ⚠ {path.name} illisible ({e}) — tout activé par défaut")
        return None


def _keyword_is_enabled(kw_name, enabled):
    """True si ce keyword doit être enrichi pour ce site."""
    if enabled is None:
        return True
    return slugify_cat(kw_name) in enabled


# ── Config ────────────────────────────────────────────────────────────────────
ROOT      = Path(__file__).parent.parent
SITES_DIR = ROOT / "sites"
# Modèle Claude : source de vérité UNIQUE dans platform/scripts/_ai_model.py.
# Changer la version là-bas la met à jour partout (enrich, blog, avis).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _ai_model import CLAUDE_MODEL as MODEL
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
    global_prompt = schema.get('global_prompt', '').strip()
    default_prompts = schema.get('default_prompts', {})
    keywords = schema.get('keywords', {})
    for kw in keywords.values():
        if global_prompt:
            kw['__global_prompt'] = global_prompt
        if default_prompts:
            # Normaliser : accepter ancien format str et nouveau format {text, words_min, words_max}
            normalized = {}
            for k, v in default_prompts.items():
                if isinstance(v, str):
                    normalized[k] = {'text': v, 'words_min': 0, 'words_max': 0}
                else:
                    normalized[k] = v
            kw['__default_prompts'] = normalized
    return keywords


def generate_classement(products: list, site_dir: Path, year: int, skip_existing: bool = False) -> None:
    """Génère les textes éditoriaux pour les pages classement (groupées par catégorie)."""
    editorial_path = site_dir / "editorial.json"
    editorial = load_json(editorial_path) if editorial_path.exists() else {}

    # Lire global_prompt depuis le schema pour l'injecter dans les descriptions produit
    _schema_for_global = site_dir.parent.parent / "schemas" / "classement-saas.json"
    global_prompt = ""
    if _schema_for_global.exists():
        import json as _jsgp
        with open(_schema_for_global, encoding="utf-8") as _fgp:
            global_prompt = _jsgp.load(_fgp).get("global_prompt", "").strip()

    # Charger les keywords et prompts custom depuis le schema
    schema_keywords = load_schema_keywords(site_dir)

    # ── Liste blanche enabled_classements ─────────────────────────────────
    # Si le fichier `enabled_classements.json` existe pour ce site, on filtre
    # les keywords pour ne traiter QUE ceux activés. Sans ça, ce script
    # chargeait les sheets ET enrichissait via Claude pour TOUS les keywords
    # du schema, ce qui pollue editorial.json + brûle des tokens API inutiles
    # (observé sur laboxentrepreneuriat-fr : 1 classement coché mais 34
    # générés). Cohérent avec generate.py.
    _enabled_cls = _load_enabled_classements(site_dir)
    if _enabled_cls is not None:
        before = len(schema_keywords)
        schema_keywords = {
            kw_name: kw_data
            for kw_name, kw_data in schema_keywords.items()
            if _keyword_is_enabled(kw_name, _enabled_cls)
        }
        print(f"  ⚙ enabled_classements.json : {len(schema_keywords)}/{before} keyword(s) activé(s)")
    else:
        print(f"  ⚙ enabled_classements.json absent — mode legacy (tous activés)")

    # Charger persona_prompt depuis config.yaml et l'attacher à chaque keyword
    import yaml as _yaml
    _cfg_path = site_dir / 'config.yaml'
    _persona_prompt = ''
    if _cfg_path.exists():
        with open(_cfg_path, encoding='utf-8') as _cf:
            _site_cfg = _yaml.safe_load(_cf) or {}
        _persona_prompt = _site_cfg.get('persona_prompt', '') or ''
        _persona_prompt = _persona_prompt.strip()
        # Nettoyer les '|' résiduels de la corruption YAML
        if _persona_prompt.startswith('|'):
            _persona_prompt = _persona_prompt.lstrip('|').strip()
    if _persona_prompt:
        for kw in schema_keywords.values():
            kw['__persona_prompt'] = _persona_prompt

    # Charger les produits depuis les sheets individuels des keywords
    for kw_name, kw_data in schema_keywords.items():
        kw_sheet_url = kw_data.get("__sheet_url", "")
        if not kw_sheet_url:
            continue
        # ── Anti-doublon : skip si la sheet principale du site contient déjà
        # des produits avec EXACTEMENT cette categorie. Bug d'origine : un
        # check `in` au lieu de `==` faisait silencieusement sauter un
        # keyword préfixe d'un autre déjà chargé (ex: "Logiciel de
        # comptabilité" skipé après "Logiciel de comptabilité gratuit").
        kw_norm = kw_name.strip().lower()
        already_covered = any(
            p.get("categorie", "").strip().lower() == kw_norm
            for p in products
        )
        if already_covered:
            continue
        # Charger les produits depuis le sheet du keyword
        try:
            req = urllib.request.Request(kw_sheet_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                text = resp.read().decode("utf-8")
            import csv as _csv, io as _io
            reader = _csv.DictReader(_io.StringIO(text))
            kw_products = []
            for row in reader:
                slug = row.get("slug", "").strip()
                if not slug: continue
                prod = {k.strip(): v.strip() for k, v in row.items() if k.strip()}
                prod["categorie"] = kw_name  # Forcer la catégorie = nom du keyword
                if str(prod.get("disponible", "1")) != "0":
                    kw_products.append(prod)
            if kw_products:
                products = products + kw_products
                print(f"  ✓ {len(kw_products)} produits chargés depuis sheet de '{kw_name}'")
        except Exception as e:
            print(f"  ⚠ Sheet '{kw_name}' indisponible: {e}")

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

        # Vérifier si au moins un produit nouveau est à générer
        existing = editorial.get(key, {})
        existing_descs = existing.get("descriptions_produits", {})
        new_products = [p for p in cat_products if p.get("slug","") not in existing_descs]

        if skip_existing and key in editorial and not new_products:
            existing_entry = editorial.get(key, {})
            # Vérifier que les sections principales sont non vides
            has_intro = len(existing_entry.get('intro', '')) > 50
            has_en_bref = len(existing_entry.get('en_bref', '')) > 20
            has_contenu = len(existing_entry.get('contenu_custom', '')) > 50
            has_prompt_contenu = bool((keyword_data.get('prompt_contenu', '') or '').strip())
            # Sauter seulement si tout ce qui est demandé est déjà là
            if has_intro and has_en_bref and (has_contenu or not has_prompt_contenu):
                print(f"  [{cat}] ⏭ déjà généré ({len(cat_products)} produits)")
                continue
            print(f"  [{cat}] sections manquantes — régénération...")

        if skip_existing and key in editorial and new_products:
            print(f"  [{cat}] {len(new_products)} nouveau(x) produit(s) à générer...")

        print(f"  [{cat}] {len(cat_products)} produits...", end=" ", flush=True)

        produits_str = ", ".join([p.get("nom", "") for p in cat_products[:8]])

        # Chercher le keyword correspondant dans le schema (correspondance par nom)
        keyword_data = {}
        for kw_name, kw_data in schema_keywords.items():
            if kw_name.lower() == cat.lower() or cat.lower() in kw_name.lower() or kw_name.lower() in cat.lower():
                keyword_data = kw_data
                break

        # Utiliser les prompts custom si disponibles, sinon fallback générique
        def _prep(raw):
            return strip_html_for_prompt(raw).replace('{produits}', produits_str).replace('{year}', str(year)).replace('{theme}', cat).replace('{produits}', produits_str).replace('{year}', str(year)).replace('{theme}', cat)
        prompt_intro = _prep(keyword_data.get('prompt_intro', ''))
        prompt_classement = _prep(keyword_data.get('prompt_classement', ''))
        prompt_contenu = _prep(keyword_data.get('prompt_contenu', ''))
        prompt_faq = _prep(keyword_data.get('prompt_faq', ''))
        prompt_en_bref = _prep(keyword_data.get('prompt_en_bref', ''))

        # Générer si au moins un prompt custom OU un prompt par défaut existe
        _has_any_prompt = bool(prompt_intro or prompt_contenu or prompt_faq or prompt_en_bref or keyword_data.get('__default_prompts', {}))
        if _has_any_prompt:
            # Génération avec prompts custom
            print(f"\n    → prompts custom détectés")
            result = {}

            # Combiner prompts par défaut + prompts custom + contrainte de mots
            import random as _random
            _dp = keyword_data.get('__default_prompts', {})
            def _word_constraint(default_key, per_line=False):
                dp_entry = _dp.get(default_key, {})
                if isinstance(dp_entry, dict):
                    wmin = dp_entry.get('words_min', 0)
                    wmax = dp_entry.get('words_max', 0)
                    if wmin and wmax:
                        target = _random.randint(wmin, wmax)
                        if per_line:
                            return f'\n\nGénère exactement {target} mots par ligne/bullet point.'
                        return f'\n\nGénère exactement {target} mots (entre {wmin} et {wmax}).'
                return ''
            def _combine(default_key, custom_prompt, per_line=False):
                dp_entry = _dp.get(default_key, {})
                _default = (dp_entry.get('text', '') if isinstance(dp_entry, dict) else str(dp_entry or '')).strip()
                # Remplacer les variables dans le prompt par défaut
                _default = strip_html_for_prompt(_default).replace('{produits}', produits_str).replace('{year}', str(year)).replace('{theme}', cat)
                # Remplacer aussi les variables dans le prompt custom du keyword
                # (bug d'origine : seul _default recevait la sub, donc {produits}
                # restait littéral si l'utilisateur l'avait mis dans le prompt
                # custom du keyword au lieu du default_prompts du schema).
                _custom = (custom_prompt or '').strip().replace('{produits}', produits_str).replace('{year}', str(year)).replace('{theme}', cat)
                _words = _word_constraint(default_key, per_line)
                combined = (_default + '\n\n' + _custom).strip() if (_default and _custom) else (_custom or _default)
                return combined + _words

            # Fallbacks si prompt vide
            # ── en_bref : pas de fallback hardcoded ──────────────────────────
            # Le prompt vient exclusivement du dashboard /templates/classement-saas
            # (global_prompt + default_prompts.prompt_en_bref dans le schema, +
            # éventuel prompt_en_bref custom au niveau du keyword).
            # Si tout est vide → on skip la génération du en_bref pour ne pas
            # envoyer un prompt bidon à l'IA. Le check ci-dessous gère aussi le
            # cas où _combine n'a renvoyé que la contrainte de mots du
            # word_constraint sans aucun prompt utile.
            _en_bref_prompt = _combine('prompt_en_bref', prompt_en_bref, per_line=True)
            if _en_bref_prompt.strip().startswith('Génère exactement'):
                _en_bref_prompt = ''

            _intro_prompt = _combine('prompt_intro', prompt_intro)
            if not _intro_prompt.strip():
                _intro_prompt = f'Rédige une introduction de 3 paragraphes HTML sur les enjeux du choix d\'un {cat} en {year}. Aucun tiret long.'

            for section_key, section_prompt, is_json in [
                ('intro', _intro_prompt, False),
                ('en_bref', _en_bref_prompt, False),
                ('contenu_custom', _combine('prompt_contenu', prompt_contenu), False),
                ('faq', _combine('prompt_faq', prompt_faq) + '\n\nIMPORTANT: Réponds UNIQUEMENT avec un tableau JSON simple : [{"q": "question", "a": "réponse"}, ...]. Pas de structure imbriquée, pas de clé "faq" parent.', True),
            ]:
                if not section_prompt:
                    continue
                # Skip si déjà remplie et non vide dans editorial existant
                if skip_existing:
                    existing_val = editorial.get(key, {}).get(section_key, '')
                    # Convertir liste/dict en string pour le check de longueur
                    existing_str = str(existing_val) if isinstance(existing_val, (list, dict)) else (existing_val or '')
                    _bad_markers = ['I can see', 'I see that', "I don't see", "I'm here",
                                    'Je ne peux pas', 'Je ne vois pas', 'Pourriez-vous',
                                    'Could you please', 'appears to be empty', '[MOT-CLE]',
                                    "n'avez pas spécifié"]
                    _is_bad = any(m in existing_str for m in _bad_markers)
                    if len(existing_str) > 50 and not _is_bad:
                        continue
                print(f"    [{section_key}]...", end=" ", flush=True)
                _base_sys = 'Tu es un expert rédacteur SEO. Réponds UNIQUEMENT en JSON valide sans backticks, sans preamble.' if is_json else 'Tu es un expert rédacteur SEO. Aucun tiret long (— ou –). Aucun markdown. Réponds uniquement avec le contenu HTML demandé.'
                _global = keyword_data.get('__global_prompt', '').strip()
                _persona = keyword_data.get('__persona_prompt', '').strip()
                # ── Anti-hallucination : on force la liste exacte des produits du
                # classement dans le system prompt. Sans ça, si le user prompt
                # configuré dans le dashboard ne contient pas {produits},
                # l'IA invente des noms de logiciels qu'elle "connaît" pour
                # le thème (ex: cite Pennylane et QuickBooks sur une page
                # "Expert-comptable en ligne" alors que ce sont des logiciels
                # de comptabilité).
                _products_ctx = f"PRODUITS DU CLASSEMENT — utilise EXCLUSIVEMENT ces noms (n'en invente AUCUN autre, ne mentionne AUCUN autre logiciel) :\n{produits_str}" if produits_str else ''
                _layers = [p for p in [_global, _persona, _products_ctx, _base_sys] if p]
                sys_prompt = '\n\n'.join(_layers)
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
                            # Strip code fences markdown si l'IA a enveloppé sa réponse :
                            #   ```html\n<contenu>\n```   ou   ```\n<contenu>\n```
                            # Bug fréquent qui faisait apparaître les triple-backticks
                            # bruts dans le HTML rendu (ex: encart En bref).
                            cleaned = response.strip()
                            cleaned = _re.sub(r'^```(?:html|HTML|markdown|md)?[ \t]*\n?', '', cleaned)
                            cleaned = _re.sub(r'\n?[ \t]*```[ \t]*$', '', cleaned)
                            result[section_key] = cleaned.strip()
                            print("✓"); break
                    except Exception as e:
                        print(f"❌ {e}"); break
                time.sleep(2)

            # Descriptions produit par produit (skip les déjà générés)
            if prompt_classement:
                descriptions = dict(existing_descs)  # Partir des descriptions existantes
                products_to_generate = new_products if (skip_existing and existing_descs) else cat_products
                for prod in products_to_generate:
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

            # Merger avec l'existant si skip_existing (ne pas écraser intro/contenu si déjà générés)
            if skip_existing and key in editorial:
                merged = dict(editorial[key])
                for k, v in result.items():
                    if v:  # Ne remplacer que si la nouvelle valeur n'est pas vide
                        merged[k] = v
                editorial[key] = merged
            else:
                editorial[key] = result
            save_json(editorial_path, editorial)
            print(f"  ✓ {cat} généré")

        else:
            # Fallback : prompt générique
            niche = cat_products[0].get("niche", "") if cat_products else ""
            niche_context = f" (niche : {niche})" if niche else ""
            prompt_generic = f"""Expert en logiciels et rédacteur SEO. Génère les textes éditoriaux pour une page classement des meilleurs {cat}{niche_context} en {year}.

Produits à classer : {produits_str}

Règles : paragraphes 3 lignes max, aucun tiret long.

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
    # Respecter le filtre --only si défini
    # categories est déjà filtré par --only avant l'appel de cette fonction
    _seen_prod_slugs = set()
    for cat, cat_products in categories.items():
        for prod in cat_products:
            slug = prod.get("slug", "")
            if slug in _seen_prod_slugs:
                continue
            _seen_prod_slugs.add(slug)
            prod_key = f"classement-prod-{slug}"
            if skip_existing and prod_key in editorial:
                # Ignorer les descriptions cassées (réponses Claude invalides)
                existing_desc = editorial.get(prod_key, {}).get('description', '')
                if existing_desc and 'I can see' not in existing_desc and 'I see that' not in existing_desc and "I'm here" not in existing_desc and '🎯' not in existing_desc and '---' not in existing_desc and len(existing_desc) > 100:
                    continue

            nom = prod.get("nom", "")
            marque = prod.get("marque", "")
            print(f"  [desc {nom}]...", end=" ", flush=True)

            niche_prod = prod.get("niche", "")
            niche_prod_ctx = f" ({niche_prod})" if niche_prod else ""
            # Combiner avec le prompt_classement du keyword si défini
            _prod_custom = strip_html_for_prompt(keyword_data.get('prompt_classement', '') or '').replace('{produits}', nom).replace('{year}', str(year)).replace('{theme}', cat).strip()
            _prod_default_entry = keyword_data.get('__default_prompts', {}).get('prompt_classement', {})
            _prod_default = strip_html_for_prompt((_prod_default_entry.get('text', '') if isinstance(_prod_default_entry, dict) else str(_prod_default_entry or ''))).replace('{produits}', nom).replace('{year}', str(year)).replace('{theme}', cat).strip()
            _prod_extra = (_prod_default + '\n\n' + _prod_custom).strip() if (_prod_default and _prod_custom) else (_prod_custom or _prod_default)

            prompt = f"""Expert rédacteur SEO. Génère les textes pour la fiche du logiciel {nom} dans un classement des meilleurs {cat}{niche_prod_ctx} en {year}.
{('Consignes supplémentaires : ' + _prod_extra) if _prod_extra else ''}

Réponds UNIQUEMENT en JSON valide sans backticks :
{{
  "description": "<p>3 paragraphes HTML sur {nom}, fonctionnalités clés, cible idéale. Aucun tiret long.</p>",
  "points_forts": ["avantage concret 1", "avantage concret 2", "avantage concret 3", "avantage concret 4"],
  "points_faibles": ["limite réelle 1", "limite réelle 2", "limite réelle 3"]
}}"""

            # Injecter le global_prompt dans le system prompt des descriptions produit
            _prod_sys = "Tu es un expert SEO. JSON uniquement sans backticks." + ("\n\n" + global_prompt if global_prompt else "")
            for attempt in range(5):
                try:
                    response = call_claude(prompt, system=_prod_sys)
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
    page_types = config.get("page_types", {})
    is_classement = bool(page_types.get("classement")) and not page_types.get("vs") and not page_types.get("avis")
    if not products:
        if is_classement:
            # Site classement SaaS — les produits viennent des keyword sheets, pas d'un sheet global
            products = []  # generate_classement chargera les produits via load_schema_keywords
        else:
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
