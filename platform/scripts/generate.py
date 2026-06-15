#!/usr/bin/env python3
"""
generate.py, Générateur de sites comparatifs statiques
Source données : Google Sheets CSV (priorité) ou products.yaml (fallback)
Textes éditoriaux : API Claude (un seul appel batch pour toutes les paires)
"""

import argparse
import csv
import hashlib
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

# ── Blog engine (markdown + frontmatter) ─────────────────────────────────────
try:
    sys.path.insert(0, str(Path(__file__).parent))
    import blog_engine
except ImportError:
    blog_engine = None  # Le blog est optionnel, ignore si absent

# ── Codes promo engine (depuis juin 2026) ────────────────────────────────────
try:
    import codes_promo_engine
except ImportError:
    codes_promo_engine = None  # Les codes promo sont optionnels (activés site par site)

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

def _post_categories(post):
    """Retourne la liste des catégories d'un article blog.

    Multi-catégories (depuis juin 2026) : un article peut être taggé sur plusieurs
    catégories via le champ `categories: [...]` du frontmatter. Cette helper
    retourne TOUJOURS une liste, avec fallback `[categorie]` pour les articles
    legacy qui n'ont que l'ancien champ `categorie` (string).

    Invariant garanti par le dashboard : si `categories` est présent et non vide,
    alors `categories[0] == categorie` (la principale). Mais on ne s'appuie pas
    dessus côté lecture : on parcourt simplement `categories`.
    """
    cats = post.get('categories')
    if isinstance(cats, list) and cats:
        return [c.strip() for c in cats if isinstance(c, str) and c.strip()]
    one = (post.get('categorie') or '').strip()
    return [one] if one else []

def md_to_html(text):
    if not text: return text
    import re as _re2
    # ── PRÉ-NORMALISATION DES BULLETS UNICODE ─────────────────────────────
    # L'IA renvoie parfois `• item` (U+2022) ou `· item` (U+00B7) au lieu
    # du markdown standard `- item`. On normalise pour que la logique de
    # liste ci-dessous reconnaisse correctement.
    # Cas A : tous les bullets sur la même ligne (séparateur inline) →
    #   "• item1 • item2 • item3" → on splitte sur les bullets
    # Cas B : un bullet par ligne → simple remplacement en début de ligne
    has_bullet = '•' in text or '·' in text
    has_newline_with_bullet = bool(_re2.search(r'\n\s*[•·]', text))
    if has_bullet and not has_newline_with_bullet:
        # Cas A : on splitte sur • ou · et on reconstruit en markdown standard
        items = [i.strip() for i in _re2.split(r'\s*[•·]\s*', text) if i.strip()]
        if len(items) >= 2:
            text = '\n'.join('- ' + item for item in items)
    elif has_bullet:
        # Cas B : remplacement en début de ligne (collapse les espaces post-bullet)
        text = _re2.sub(r'^(\s*)[•·]\s*', r'\1- ', text, flags=_re2.MULTILINE)
    # Convertir **bold** en <strong>bold</strong>
    text = _re2.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    # Supprimer les séparateurs markdown
    text = _re2.sub(r'^---+$', '', text, flags=_re2.MULTILINE)
    # Convertir les titres emoji (🎯 Titre, ⚠️ Titre, etc.)
    text = _re2.sub(r'^([\U0001F3AF\u26A0\U0001F4BC\u2705\U0001F511\U0001F4CC\u274C\u2713\u2192\u2022\u00B7]+)[ ]+(.+)$', lambda m: '<h3>' + m.group(2) + '</h3>', text, flags=_re2.MULTILINE)
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


def _get_current_month_fr() -> str:
    """Retourne le mois courant en français lowercase (ex: "juin").

    Utilisé pour alimenter les placeholders {month} / {Month} substitués
    dans les contenus rendus (blog posts, avis, classements). Convention
    alignée sur {year} / {Year}.
    """
    months = ["janvier", "février", "mars", "avril", "mai", "juin",
              "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    return months[date.today().month - 1]


def _load_enabled_classements(site_dir: Path):
    """Charge la liste blanche des classements activés pour ce site, depuis
    `platform/sites/<siteId>/enabled_classements.json`.

    Format du fichier :
        {
          "classements": ["logiciel-paie", "comptabilite-en-ligne", ...],
          "updated": "2026-05-22T18:43:21+02:00"
        }

    Comportements :
      - Fichier ABSENT       → retourne `None` (= mode legacy, tout activé,
        pour ne pas casser les sites existants avant la migration).
      - Fichier PRÉSENT      → retourne `set[str]` des slugs activés.
      - Fichier MAL FORMÉ    → log warning et retourne `None` (fail-safe).

    Le filtrage est appliqué via `_keyword_is_enabled` qui matche le slug
    du keyword (slugify_cat(nom)) contre cette liste.
    """
    import json as _json
    path = site_dir / "enabled_classements.json"
    if not path.exists():
        return None
    try:
        data = _json.loads(path.read_text(encoding="utf-8"))
        slugs = data.get("classements") or []
        if not isinstance(slugs, list):
            print(f"  ⚠ {path.name} : 'classements' doit être un array — tout activé par défaut")
            return None
        return set(s.strip().lower() for s in slugs if isinstance(s, str))
    except Exception as e:
        print(f"  ⚠ {path.name} illisible ({e}) — tout activé par défaut")
        return None


def _keyword_is_enabled(kw_name: str, enabled: set | None) -> bool:
    """Retourne True si le keyword `kw_name` doit être généré pour ce site.

    - `enabled is None` (fichier absent) → True pour tous (mode legacy)
    - `enabled is set()` (liste vide) → False pour tous (= aucun activé,
      conforme au nouveau comportement par défaut côté dashboard)
    - `enabled` peuplé → True ssi `slugify_cat(kw_name)` est dans le set
    """
    if enabled is None:
        return True
    return slugify_cat(kw_name) in enabled


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


# ── Substitution de placeholders {var} dans n'importe quel contenu ──────────
# Permet à l'utilisateur d'écrire `{year}` (ou `{site_name}`, etc.) dans
# n'importe quel champ de frontmatter de blog post / fichier d'avis / éditorial
# de classement, et que ce soit remplacé au moment du rendu.
#
# Utilisé par :
#   - Boucle blog posts        (substituer {year} dans titre, meta, content, FAQ…)
#   - Boucle avis posts        (substituer {year} dans h1, en_bref, sections_html…)
#   - Boucle classements       (en complément du _sub_vars local qui gère aussi
#                                {categorie}, {Categorie}, {count}, etc.)
def substitute_template_vars(obj, vars_map: dict):
    """Substitue récursivement les placeholders {var} dans tous les strings
    d'une structure (dict, list, str). Renvoie un nouvel objet (les inputs
    list/dict ne sont PAS mutés).
    """
    if isinstance(obj, str):
        out = obj
        for key, val in vars_map.items():
            out = out.replace("{" + key + "}", str(val))
        return out
    if isinstance(obj, dict):
        return {k: substitute_template_vars(v, vars_map) for k, v in obj.items()}
    if isinstance(obj, list):
        return [substitute_template_vars(item, vars_map) for item in obj]
    return obj


def normalize_table_html(html: str) -> str:
    """Normalise les <table> dans un HTML pour qu'ils soient bien stylés
    par le CSS partagé (_table_styles.html.j2) :
      1. Si une <table> n'est pas dans un <div class="table-wrap">,
         on l'enveloppe (pour scroll horizontal sur mobile).
      2. Si une <table> n'a pas de <thead>, on promeut la première <tr> :
         soit elle a déjà des <th> (juste wrap dans <thead>), soit on
         convertit ses <td> en <th> + wrap.
      3. Si les <tr> restantes ne sont pas dans <tbody>, on les wrappe.

    Idempotente : appliquer plusieurs fois ne change rien sur un HTML
    déjà conforme. Conservative : ne touche pas si tout est déjà bien.
    """
    if not html or "<table" not in html.lower():
        return html

    import re as _re_t

    # ── Étape 1 : envelopper les <table> nues dans <div class="table-wrap">
    def wrap_unwrapped_tables(html_in: str) -> str:
        out = []
        pos = 0
        for m in _re_t.finditer(r"<table\b[^>]*>.*?</table>", html_in, flags=_re_t.IGNORECASE | _re_t.DOTALL):
            out.append(html_in[pos:m.start()])
            before_window = html_in[max(0, m.start() - 100):m.start()]
            if 'class="table-wrap"' in before_window or "class='table-wrap'" in before_window:
                out.append(m.group(0))
            else:
                out.append('<div class="table-wrap">')
                out.append(m.group(0))
                out.append('</div>')
            pos = m.end()
        out.append(html_in[pos:])
        return "".join(out)

    html = wrap_unwrapped_tables(html)

    # ── Étape 2 + 3 : promouvoir la première ligne en <thead> + wrapper <tbody>
    def promote_first_row(table_match):
        table_html = table_match.group(0)
        # Si déjà <thead>, ne pas toucher
        if _re_t.search(r"<thead\b", table_html, _re_t.IGNORECASE):
            return table_html
        tr_match = _re_t.search(r"<tr\b[^>]*>.*?</tr>", table_html, _re_t.IGNORECASE | _re_t.DOTALL)
        if not tr_match:
            return table_html
        first_tr = tr_match.group(0)
        if _re_t.search(r"<th\b", first_tr, _re_t.IGNORECASE):
            new_first = "<thead>" + first_tr + "</thead>"
        else:
            new_first = first_tr
            new_first = _re_t.sub(r"<td\b", "<th", new_first, flags=_re_t.IGNORECASE)
            new_first = _re_t.sub(r"</td>", "</th>", new_first, flags=_re_t.IGNORECASE)
            new_first = "<thead>" + new_first + "</thead>"
        rest = table_html[tr_match.end():]
        closing_match = _re_t.search(r"</table>\s*$", rest, _re_t.IGNORECASE)
        closing = closing_match.group(0) if closing_match else "</table>"
        rest_before_close = _re_t.sub(r"</table>\s*$", "", rest, flags=_re_t.IGNORECASE)
        if "<tr" in rest_before_close.lower() and "<tbody" not in rest_before_close.lower():
            rest_before_close = "<tbody>" + rest_before_close + "</tbody>"
        opening = table_html[:tr_match.start()]
        return opening + new_first + rest_before_close + closing

    html = _re_t.sub(
        r"<table\b[^>]*>.*?</table>",
        promote_first_row,
        html,
        flags=_re_t.IGNORECASE | _re_t.DOTALL,
    )

    return html


def _post_process_normalize_tables(output_dir: Path) -> None:
    """Parcourt tous les .html générés et normalise les <table> trouvés.
    À appeler en fin de build, après que tous les fichiers HTML soient écrits.
    Idempotent : safe à rappeler plusieurs fois.
    """
    touched = 0
    scanned = 0
    for html_file in sorted(output_dir.rglob("*.html")):
        scanned += 1
        try:
            html = html_file.read_text(encoding="utf-8")
        except Exception:
            continue
        if "<table" not in html.lower():
            continue
        new_html = normalize_table_html(html)
        if new_html != html:
            html_file.write_text(new_html, encoding="utf-8")
            touched += 1
    if touched:
        print(f"  📋 Tables normalisées : {touched}/{scanned} fichiers HTML touchés")


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


def generate_sitemap(site: dict, pairs: list, products: list, output_dir: Path, site_dir: Path = None, config: dict = None) -> None:
    # Construire le domain avec www_preference
    raw_domain = site["domain"].rstrip("/")
    www_pref = site.get("www_preference") or (config or {}).get("www_preference", "www")
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

    # Pages blog (si dossier blog/posts/ présent avec articles publiés)
    blog_posts_for_sitemap = []
    if blog_engine is not None and site_dir is not None:
        try:
            blog_posts_for_sitemap = blog_engine.load_all_posts(site_dir, include_drafts=False)
        except Exception as _e:
            print(f"  ⚠ Sitemap : impossible de charger les articles blog : {_e}")
            blog_posts_for_sitemap = []
        if blog_posts_for_sitemap:
            BLOG_POSTS_PER_PAGE = 30
            total_posts = len(blog_posts_for_sitemap)
            total_pages = max(1, math.ceil(total_posts / BLOG_POSTS_PER_PAGE))
            # Page 1 + pages paginées (URLs avec slash final pour cohérence
            # avec la structure de fichiers /slug/index.html générée plus bas)
            lines.append(url(f"{domain}/blog/", "0.9", "weekly"))
            for p in range(2, total_pages + 1):
                lines.append(url(f"{domain}/blog/{p}/", "0.6", "weekly"))
            # Pages catégorie (avec pagination)
            cats = blog_engine.collect_categories(blog_posts_for_sitemap)
            for cat in cats:
                # Multi-catégories : un post apparaît dans CHAQUE catégorie où il est taggé
                cat_posts = [p for p in blog_posts_for_sitemap
                             if cat['name'].lower() in [c.lower() for c in _post_categories(p)]]
                cat_pages = max(1, math.ceil(len(cat_posts) / BLOG_POSTS_PER_PAGE))
                lines.append(url(f"{domain}/{cat['slug']}/", "0.7", "weekly"))
                for p in range(2, cat_pages + 1):
                    lines.append(url(f"{domain}/{cat['slug']}/{p}/", "0.5", "weekly"))
            # Articles individuels
            for post in blog_posts_for_sitemap:
                slug = post.get('slug', '')
                if slug:
                    lines.append(url(f"{domain}/{slug}/", "0.8", "monthly"))

    # ── Pages OUTILS (depuis platform/sites/<site>/outils.json) ──────
    # On scanne outils.json (qui contient les outils activés pour ce site)
    # et on ajoute leurs URLs au sitemap. Le slug d'index est dérivé du
    # menu_label (slugifié) — défaut "outils".
    n_outils = 0
    if site_dir is not None:
        outils_path = site_dir / "outils.json"
        if outils_path.exists():
            try:
                outils_data = json.loads(outils_path.read_text(encoding="utf-8"))
                outils_map = outils_data.get("outils", {}) or {}
                # Slug d'index (page liste des outils)
                menu_label = (outils_data.get("menu_label") or "Outils").strip() or "Outils"
                index_slug = slugify_cat(menu_label)
                # On ajoute la page d'index uniquement s'il y a au moins
                # un outil activé (sinon la page n'existe pas)
                if outils_map:
                    has_active = any(o.get("active") for o in outils_map.values())
                    if has_active:
                        lines.append(url(f"{domain}/{index_slug}", "0.6", "monthly"))
                    for outil_id, outil_state in outils_map.items():
                        if not outil_state.get("active"):
                            continue
                        outil_slug = (outil_state.get("slug") or outil_id).strip()
                        if outil_slug:
                            lines.append(url(f"{domain}/{outil_slug}", "0.7", "monthly"))
                            n_outils += 1
            except Exception as _e:
                print(f"  ⚠ Sitemap : lecture outils.json a échoué : {_e}")

    # ── Pages AVIS (nouveau système, depuis platform/sites/<site>/posts_avis/) ──
    # On scanne les .md du dossier et on ajoute leurs URLs. Aussi l'index /avis
    # et les pages catégorie /avis/<slug>/.
    n_avis = 0
    if site_dir is not None:
        avis_dir = site_dir / "posts_avis"
        if avis_dir.exists():
            avis_md = list(avis_dir.glob("*.md"))
            if avis_md:
                # Index /avis
                lines.append(url(f"{domain}/avis", "0.8", "weekly"))
                # Pages individuelles
                _cats_seen = set()
                for md in avis_md:
                    stem = md.stem
                    if stem:
                        lines.append(url(f"{domain}/{stem}", "0.7", "monthly"))
                        n_avis += 1
                        # Collecter les catégories pour ajouter /avis/<cat>/
                        try:
                            raw = md.read_text(encoding="utf-8")
                            if raw.startswith("---"):
                                parts = raw.split("---", 2)
                                if len(parts) >= 3:
                                    fm = yaml.safe_load(parts[1]) or {}
                                    cat = (fm.get("categorie") or "").strip()
                                    if cat:
                                        _cats_seen.add(slugify_cat(cat))
                        except Exception:
                            pass
                # Pages catégorie d'avis
                for cat_slug in sorted(_cats_seen):
                    lines.append(url(f"{domain}/avis/{cat_slug}/", "0.6", "weekly"))

    # ── Pages CODES PROMO (depuis platform/sites/<site>/codes_promo/) ──
    # Génère /codes-promo/ (listing) + /codes-promo/<marque-slug>/ par marque
    # publiée. Activé si dossier codes_promo/ existe et contient des .md.
    n_codes_promo = 0
    if site_dir is not None and codes_promo_engine is not None:
        cp_dir = site_dir / "codes_promo"
        if cp_dir.exists():
            cp_brands_sitemap = codes_promo_engine.load_all_brands(cp_dir.parent, include_drafts=False)
            if cp_brands_sitemap:
                lines.append(url(f"{domain}/codes-promo/", "0.8", "weekly"))
                for b in cp_brands_sitemap:
                    slug = b.get("slug", "")
                    if slug:
                        lines.append(url(f"{domain}/codes-promo/{slug}/", "0.7", "weekly"))
                        n_codes_promo += 1

    # ── Page À propos (si template a-propos.html.j2 existe pour ce site)
    has_apropos = False
    if site_dir is not None:
        # On vérifie dans les templates site-local OU base (qui héritent tous deux dans l'env Jinja)
        if (site_dir / "templates" / "a-propos.html.j2").exists() or (TEMPLATES_DIR / "a-propos.html.j2").exists():
            has_apropos = True
            lines.append(url(f"{domain}/a-propos/", "0.6", "monthly"))

    lines += [
        url(f"{domain}/mentions-legales", "0.3", "yearly"),
        url(f"{domain}/politique-confidentialite", "0.3", "yearly"),
        url(f"{domain}/contact", "0.4", "yearly"),
        "</urlset>",
    ]
    (output_dir / "sitemap.xml").write_text("\n".join(lines), encoding="utf-8")
    n_blog = len(blog_posts_for_sitemap)
    extras = []
    if n_blog:         extras.append(f"{n_blog} blog")
    if n_outils:       extras.append(f"{n_outils} outils")
    if n_avis:         extras.append(f"{n_avis} avis")
    if n_codes_promo:  extras.append(f"{n_codes_promo} codes-promo")
    extras_msg = (" + " + " + ".join(extras)) if extras else ""
    print(f"  ✓ sitemap.xml ({len(pairs)} comparatifs + {len(products)} avis-legacy + pages liste{extras_msg})")


def cleanup_removed_products(output_dir: Path, site_dir: Path, products: list, all_pairs: list, is_classement_template: bool = False, blog_expected: set | None = None) -> None:
    """Supprime les fichiers HTML et entrées editorial.json des produits supprimés."""
    current_slugs = {p["slug"] for p in products}

    # Fichiers HTML attendus
    expected_files = set()
    expected_files.add("index.html")
    expected_files.add("sitemap.xml")
    expected_files.add("_redirects")
    expected_files.add("sheets.js")
    # ── Blog : ajouter les pages attendues à expected_files ────────────────
    # `blog_expected` est passé en paramètre par generate_site() qui a fait le
    # load. Si présent, ses fichiers .html ne seront pas supprimés comme
    # orphelins. Évite le double appel à blog_engine.load_all_posts.
    if blog_expected:
        expected_files |= blog_expected

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
        # ── Plus de protection automatique de `avis-{slug}.html` ────────────
        # AVANT : on ajoutait inconditionnellement avis-{slug}.html à
        # expected_files pour chaque produit de la sheet (legacy SCPI), ce
        # qui empêchait `cleanup_removed_products` de supprimer les orphelins
        # quand un avis était dépublié via le dashboard. Désormais, la
        # protection vient EXCLUSIVEMENT de posts_avis/*.md (cf.
        # _avis_protected dans generate_site, unioné à blog_expected).
        # Si un .md d'avis est supprimé, son .html devient orphelin et est
        # nettoyé au prochain build. Conséquence : Cloudflare Pages sert sa
        # 404.html avec un vrai HTTP 404 sur l'URL dépubliée.
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


# ── Tracking de dateModified par page ─────────────────────────────────────────
# Au lieu de mettre date.today() sur toutes les pages à chaque deploy (problème
# SEO : Google voit toutes les pages "modifiées aujourd'hui" et finit par ignorer
# le signal), on utilise un fichier dates.json par site qui stocke pour chaque
# page un hash stable de son contenu + sa dernière vraie date de modif.
#
# Au build N+1 :
#   - Si le hash stable (= HTML rendu, sans les occurrences de today) matche
#     celui stocké → le contenu n'a pas réellement changé, on patche le HTML
#     pour remettre l'ancienne date partout. dateModified reste figée.
#   - Sinon → on garde today comme dateModified et on enregistre le nouveau hash.
#
# dates.json est committé dans le repo (cf workflow generate-site.yml qui add
# platform/sites/<site>/), donc le tracking persiste entre runs.
def _post_process_dates_tracking(output_dir: Path, site_dir: Path,
                                  today_iso: str, today_fr: str, fr_date_fn) -> None:
    dates_file = site_dir / "dates.json"
    dates_db: dict = {}
    if dates_file.exists():
        try:
            dates_db = json.loads(dates_file.read_text(encoding="utf-8"))
        except Exception:
            dates_db = {}

    patched = 0
    new_pages = 0
    updated_pages = 0
    processed = 0
    new_db: dict = {}

    for html_file in sorted(output_dir.rglob("*.html")):
        rel = str(html_file.relative_to(output_dir))
        # On exclut les vraies pages dynamiques où la date "build_date" est un
        # affichage légitime ("Dernière mise à jour") qu'on veut figer aussi.
        # Donc on traite TOUS les .html.
        html = html_file.read_text(encoding="utf-8")
        processed += 1
        # Hash stable : on neutralise les 2 formes possibles de la date du jour
        # (ISO 2026-05-18 et FR "18 mai 2026") pour que le hash ne dépende pas
        # de la date courante.
        cleaned = html.replace(today_iso, "<<DATE_ISO>>").replace(today_fr, "<<DATE_FR>>")
        h = hashlib.sha256(cleaned.encode("utf-8")).hexdigest()
        rec = dates_db.get(rel)

        if rec and rec.get("hash") == h:
            # Contenu identique au dernier build où on a enregistré ce hash.
            # On patche le HTML pour remplacer la date d'aujourd'hui par
            # l'ancienne date stockée (date de la dernière vraie modif).
            old_iso = rec.get("date") or today_iso
            old_fr = fr_date_fn(old_iso)
            new_html = html.replace(today_iso, old_iso).replace(today_fr, old_fr)
            if new_html != html:
                html_file.write_text(new_html, encoding="utf-8")
                patched += 1
            new_db[rel] = rec  # on conserve le record tel quel
        else:
            # Contenu nouveau ou modifié → today devient la nouvelle dateModified.
            new_db[rel] = {"date": today_iso, "hash": h}
            if rec:
                updated_pages += 1
            else:
                new_pages += 1

    # Écriture finale : on sauvegarde le NOUVEAU dict (les pages supprimées
    # disparaissent automatiquement).
    dates_file.write_text(
        json.dumps(new_db, indent=2, sort_keys=True, ensure_ascii=False),
        encoding="utf-8",
    )
    removed = max(0, len(dates_db) - len(new_db))
    msg_parts = []
    if patched:
        msg_parts.append(f"{patched} datée(s) préservée(s)")
    if updated_pages:
        msg_parts.append(f"{updated_pages} modifiée(s)")
    if new_pages:
        msg_parts.append(f"{new_pages} nouvelle(s)")
    if removed:
        msg_parts.append(f"{removed} supprimée(s)")
    summary = ", ".join(msg_parts) if msg_parts else "rien à faire"
    print(f"  📅 dates.json ({processed} pages scannées) : {summary}")


# ── Générateur principal ───────────────────────────────────────────────────────
def generate_site(site_slug: str, dry_run: bool = False, filter_pair: tuple = None) -> None:
    # ⚠⚠⚠ DEBUG MARKER v15 — au TOUT DÉBUT de generate_site ⚠⚠⚠
    # Si tu vois cette ligne dans le log : v11 est bien exécuté, on peut
    # creuser le reste. Si tu ne la vois PAS : le fichier exécuté n'est
    # PAS v11 (problème de checkout/cache GitHub Actions).
    import sys as _sys
    print(f"  🟢 DEBUG v15 ENTRÉE generate_site : site_slug={site_slug}", flush=True)
    _sys.stdout.flush()

    site_dir = SITES_DIR / site_slug
    if not site_dir.exists():
        print(f"❌ Site introuvable : {site_dir}")
        sys.exit(1)

    config        = load_yaml(site_dir / "config.yaml")
    products_yaml_path = site_dir / "products.yaml"
    products_yaml = load_yaml(products_yaml_path) if products_yaml_path.exists() else {"products": []}
    site          = config["site"]
    theme         = config["theme"]

    # ── Liste blanche des classements activés pour ce site ────────────
    # Fichier `enabled_classements.json` édité depuis le dashboard
    # `/sites/<siteId>/classements`. Si absent → mode legacy (tous activés)
    # pour ne pas casser les sites existants. Si présent → seul les slugs
    # listés sont rendus. Cf. _load_enabled_classements pour la spec.
    _enabled_classements = _load_enabled_classements(site_dir)
    if _enabled_classements is None:
        print(f"  ⚙ enabled_classements.json absent — mode legacy (tous activés)")
    else:
        print(f"  ⚙ {len(_enabled_classements)} classement(s) activé(s) sur ce site")

    # ── SEO global du site ─────────────────────────────────────────────
    # Initialisé tôt pour que TOUS les chemins de rendu (blog, classement,
    # avis index, avis catégories) puissent passer `site={**site, 'seo': _seo}`
    # aux templates. Bug d'origine : `_seo` n'était défini que dans le bloc
    # blog (`if blog_posts`), donc un site sans articles blog mais AVEC des
    # avis crashait à la ligne ~1875 (`UnboundLocalError: _seo`). Cas observé
    # sur entreprendrepourapprendre-org avec 312 .md d'avis et 0 blog.
    _seo = config.get("seo", {}) or {}

    # ── Patch défensif : certaines clés métier peuvent se retrouver mal
    # placées dans le YAML (typiquement tombées dans `seo:`, `author:` ou
    # une autre section) suite à des éditions du dashboard. On les rapatrie
    # dans `site` si elles se trouvent ailleurs, pour que les templates qui
    # utilisent `site.<key>` continuent de marcher quel que soit l'historique
    # d'édition. Si la clé existe DÉJÀ dans `site`, on ne touche à rien.
    SITE_KEYS_TO_RESCUE = [
        'analytics_clicky', 'google_site_verification',
        'www_preference', 'home_title', 'home_description', 'home_h1',
        'blog_sheet_csv_url', 'blog_sheet_edit_url', 'contact_form_key',
    ]
    for _k in SITE_KEYS_TO_RESCUE:
        if site.get(_k):
            continue
        # Top-level
        if config.get(_k):
            site[_k] = config[_k]
            continue
        # Sections dict (seo, author, theme, page_types, etc.)
        for _sk, _sv in config.items():
            if _sk == 'site' or not isinstance(_sv, dict):
                continue
            if _sv.get(_k):
                site[_k] = _sv[_k]
                break

    # ── Normalisation site.domain selon www_preference ────────────────────
    # `domain` est utilisé tel quel par tous les templates pour les canonicals,
    # og:url, schema.org. Sans cette normalisation, un config avec
    # `domain: https://editions-dp.com` + `www_preference: www` génère des
    # canonicals sans www (incohérents avec les redirects Cloudflare qui,
    # eux, forcent www → 301).
    import re as _re_dom
    _raw_domain = (site.get("domain") or "").rstrip("/")
    if _raw_domain:
        _www_pref = site.get("www_preference") or config.get("www_preference", "www")
        _bare = _re_dom.sub(r"^https?://(www\.)?", "", _raw_domain)
        if _www_pref == "www":
            site["domain"] = f"https://www.{_bare}"
        else:
            site["domain"] = f"https://{_bare}"

    # ── Détection précoce des avis ────────────────────────────────────────
    # On set `site["has_avis"] = True` AU TOUT DÉBUT de generate_site pour
    # que TOUS les templates (home, classements, pages VS, articles de blog,
    # contact, etc.) affichent le lien "Avis" dans la nav. Le rendu effectif
    # des pages d'avis lui-même se fait plus bas dans la fonction.
    _avis_dir_early = site_dir / "posts_avis"
    if _avis_dir_early.exists() and any(_avis_dir_early.glob("*.md")):
        site["has_avis"] = True

    # Injecter cta_color et cta_text_color (theme: ou racine du config)
    if "cta_color" not in theme:
        theme["cta_color"] = config.get("cta_color", "")
    if "cta_text_color" not in theme:
        theme["cta_text_color"] = config.get("cta_text_color", "")
    criteria      = config.get("criteria", [])

    print(f"\n🚀 Génération site : {site_slug}")

    # ── Variables globales du site (utilisées pour la substitution de
    # placeholders {year}, {site_name}, etc. dans tous les contenus rendus
    # par ce build). Calculées ici une seule fois pour rester cohérentes
    # entre tous les rendus (blog, avis, classements, comparatifs).
    _site_year = str(site.get("year", date.today().year))
    _current_month_fr = _get_current_month_fr()
    _global_vars = {
        "year": _site_year,
        "site_name": site.get("name", ""),
        "month": _current_month_fr,
        "Month": _current_month_fr.capitalize(),
    }

    # Chargement produits
    sheet_url = site.get("sheet_csv_url", "")
    products  = None
    if sheet_url and not dry_run:
        products = load_products_from_sheet(sheet_url)
    if products is None:
        products = products_yaml.get("products", [])
        print(f"  📦 {len(products)} produits depuis products.yaml")

    print(f"   {len(products)} produits → {math.comb(len(products), 2)} paires")

    # Jinja2 — ChoiceLoader pour permettre les overrides par site.
    # Ordre de résolution des templates :
    #   1. platform/sites/<site>/templates/   (override local du site)
    #   2. platform/templates/                 (templates globaux, fallback)
    # Permet à chaque site d'avoir son `index.html.j2`, `_nav.html.j2`, etc.
    # sans polluer le dossier global. Convention recommandée pour les sites
    # avec home custom : `index_template: "index.html.j2"` dans config.yaml +
    # fichier dans `platform/sites/<site>/templates/index.html.j2`.
    from jinja2 import ChoiceLoader as _ChoiceLoader
    _site_templates_dir = site_dir / "templates"
    _jinja_loaders = []
    if _site_templates_dir.exists():
        _jinja_loaders.append(FileSystemLoader(str(_site_templates_dir)))
    _jinja_loaders.append(FileSystemLoader(str(TEMPLATES_DIR)))
    env = Environment(
        loader=_ChoiceLoader(_jinja_loaders),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True, lstrip_blocks=True,
    )
    env.filters["capitalize"] = lambda s: s.capitalize() if s else ""

    env.filters["md_to_html"] = lambda s: s

    MOIS_FR = ["janvier","février","mars","avril","mai","juin",
               "juillet","août","septembre","octobre","novembre","décembre"]
    def fr_date(d):
        # Accepte plusieurs formats : 2026-05-18, 2026-05-18T14:13:46.839371+02:00,
        # 2026-05-18 14:13:46 etc. On tronque tout après le 'T' ou l'espace.
        try:
            s = str(d).strip()
            # Sépare la partie date de la partie heure si présente
            s = s.split("T")[0].split(" ")[0]
            parts = s.split("-")
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
                    # Filtre liste blanche : skip si ce classement n'est pas
                    # activé pour ce site (cf. enabled_classements.json).
                    if not _keyword_is_enabled(_kw_name, _enabled_classements):
                        continue
                    _kw_url = _kw_data.get("__sheet_url", "")
                    if not _kw_url:
                        continue
                    # ── Anti-doublon : skip si la sheet principale du site
                    # contient déjà des produits avec EXACTEMENT cette categorie.
                    # Bug d'origine : un check `in` au lieu de `==` faisait
                    # silencieusement sauter un keyword préfixe d'un autre
                    # déjà chargé (ex: "Logiciel de comptabilité" skipé après
                    # "Logiciel de comptabilité gratuit").
                    _kw_norm = _kw_name.strip().lower()
                    _covered = any(
                        p.get("categorie", "").strip().lower() == _kw_norm
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
            "page_types": config.get("page_types", {}),
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
        print(f"  🟢 DEBUG v15 ENTRÉE bloc 'if not dry_run' (ligne ~923)", flush=True)
        generate_sitemap(site, all_pairs, products, output_dir, site_dir=site_dir, config=config)
        # ── Blog : chargement des articles avant le cleanup ──────────────
        # On marque les pages attendues du blog pour qu'elles ne soient pas
        # supprimées par cleanup_removed_products. Aussi, on set
        # site["has_blog"] DÈS MAINTENANT pour que TOUTES les pages (home,
        # classements, etc.) affichent le lien Blog dans la nav, pas
        # seulement les pages blog elles-mêmes.
        # On charge aussi author_* dans site pour que les pages blog
        # utilisent le bon auteur (cohérence avec les pages classement).
        blog_posts = []
        blog_categories = []
        blog_expected: set = set()
        blog_load_failed = False
        if blog_engine is not None:
            try:
                blog_posts = blog_engine.load_all_posts(site_dir, include_drafts=False)
            except Exception as _e:
                print(f"  ⚠ Blog : erreur chargement posts : {_e}")
                blog_posts = []
                blog_load_failed = True
            # Filet de sécurité : si le chargement a planté, on protège AU MOINS
            # les fichiers .html existants pour ne pas les supprimer accidentellement
            # via cleanup_removed_products. On scan blog/posts/ pour récupérer les
            # slugs et les ajouter à blog_expected.
            if blog_load_failed:
                posts_dir = site_dir / 'blog' / 'posts'
                if posts_dir.exists():
                    blog_expected.add("blog/index.html")
                    for md_file in posts_dir.glob('*.md'):
                        blog_expected.add(f"{md_file.stem}/index.html")
                    print(f"  🛡 Filet : {len(blog_expected) - 1} slugs blog protégés depuis le disque")
            if blog_posts:
                site["has_blog"] = True
                blog_categories = blog_engine.collect_categories(blog_posts)
                blog_expected.add("blog/index.html")
                for post in blog_posts:
                    slug = post.get('slug', '')
                    if slug:
                        blog_expected.add(f"{slug}/index.html")
                for cat in blog_categories:
                    blog_expected.add(f"{cat['slug']}/index.html")
                # ── Enrichissement des posts (excerpt, date_display, reading_time)
                # On le fait ICI pour que la home puisse utiliser ces champs
                # dans la section "Articles récents". L'enrichissement est
                # idempotent (réutilisé tel quel par les autres renders blog).
                import datetime as _dt_blog
                _months_fr = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                              'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
                def _fmt_date_fr(d):
                    if not isinstance(d, _dt_blog.datetime) or d == _dt_blog.datetime.min:
                        return ''
                    return f"{d.day} {_months_fr[d.month]} {d.year}"
                def _reading_time(md_content):
                    words = len((md_content or '').split())
                    return max(1, round(words / 200))
                for post in blog_posts:
                    post['excerpt'] = blog_engine.excerpt_from_md(post.get('content_md', ''))
                    post['date_display'] = _fmt_date_fr(post.get('date_obj'))
                    post['reading_time'] = _reading_time(post.get('content_md', ''))
                    if post.get('categorie'):
                        post['categorie_slug'] = blog_engine.categorie_slug(post['categorie'])
                    # Auto-fix typo : ajout du '?' sur les titres interrogatifs
                    # (filet de sécurité au cas où l'IA aurait oublié).
                    fixed_html, _n_q = blog_engine.fix_question_marks(post.get('content_html', ''))
                    post['content_html'] = fixed_html
                    # Injection ancres + extraction TOC (avant le maillage interne
                    # pour que les liens ne soient pas placés dans des h2/h3, et
                    # pour que le sommaire reflète bien la structure finale).
                    post['content_html'], post['toc'] = blog_engine.inject_anchors_and_extract_toc(post['content_html'])
                    # Détection automatique FAQ et HowTo (pour les schemas SEO).
                    # Les schemas ne sont émis dans le template que si au moins
                    # 2 Q/A (FAQ) ou 3 étapes (HowTo) sont trouvées.
                    post['faq'] = blog_engine.extract_faq_from_html(post['content_html'])
                    post['howto_steps'] = blog_engine.extract_howto_from_html(
                        post['content_html'], post.get('title', ''), post.get('toc')
                    )

                # ── Maillage interne automatique ─────────────────────────
                # Pour chaque article cible qui déclare des `link_anchors`,
                # on parcourt tous les autres articles et on insère un lien
                # vers la cible en remplaçant la première occurrence d'une
                # ancre dans leur HTML (1 lien max par source vers la même
                # cible, 15 liens entrants max par cible, quota par ancre).
                try:
                    _linking_stats = blog_engine.apply_internal_links(blog_posts)
                    if _linking_stats.get('links_added', 0) > 0:
                        print(f"  🔗 Maillage interne : {_linking_stats['links_added']} lien(s) ajouté(s)")
                except Exception as _e:
                    print(f"  ⚠ Maillage interne : erreur {_e}")
        # Charger author_* depuis config.yaml → toujours dans site, utile
        # pour le blog (et harmonisé avec site_with_author des classements).
        # NOTE : on OVERRIDE volontairement les éventuels champs legacy
        # `author_name` qui pourraient traîner au top-level du config.yaml
        # de certains sites ; la source de vérité est `config.author.*`.
        author_cfg_main = config.get("author", {}) or {}
        if author_cfg_main:
            _photo_raw_main = author_cfg_main.get("photo", "")
            if _photo_raw_main and ("http://" in _photo_raw_main or "https://" in _photo_raw_main):
                _photo_clean_main = "/" + _photo_raw_main.split("/public/")[-1].split("?")[0] if "/public/" in _photo_raw_main else ""
            else:
                _photo_clean_main = _photo_raw_main
            site["author_name"] = author_cfg_main.get("name", "") or site.get("author_name", "")
            site["author_bio"] = author_cfg_main.get("bio", "") or site.get("author_bio", "")
            site["author_job"] = author_cfg_main.get("job_title", "") or site.get("author_job", "")
            site["author_photo"] = _photo_clean_main or site.get("author_photo", "")
        # Protection des pages d'avis (similaire à blog_expected) pour ne pas
        # qu'elles soient supprimées comme orphelines par cleanup_removed_products.
        # Le set est unioné à blog_expected avant l'appel.
        _avis_protected: set = set()
        _avis_dir_chk = site_dir / "posts_avis"
        if _avis_dir_chk.exists():
            _avis_protected.add("avis.html")
            for _md in _avis_dir_chk.glob("*.md"):
                _avis_protected.add(f"{_md.stem}.html")
        _protected = (blog_expected or set()) | _avis_protected
        cleanup_removed_products(output_dir, site_dir, products, all_pairs, is_classement_template, blog_expected=_protected)
        print(f"  🟢 DEBUG v15 APRÈS cleanup, avant la suite (is_classement_template={is_classement_template})", flush=True)

        # ── Détection précoce des avis ────────────────────────────────────
        # On set `site["has_avis"] = True` AVANT la génération des autres
        # pages (home, classements, comparatifs) pour que TOUTES leurs
        # navigations affichent le lien "Avis". Sans ce check précoce, le
        # lien n'apparaissait que sur les pages d'avis elles-mêmes parce que
        # la section principale de chargement/rendu des avis arrive tout en
        # bas de generate_site, après le rendu de la home & co.
        if _avis_dir_chk.exists() and any(_avis_dir_chk.glob("*.md")):
            site["has_avis"] = True

        # Pour les sites classement : écraser les anciennes pages avis SCPI avec la 404 actuelle
        # ⚠ INDENT FIX v11 (mai 2026) : ce bloc était à 4 espaces, ce qui
        # le sortait de `if not dry_run:` et englobait toute la suite (Home,
        # _redirects, légales) dans `if is_classement_template:` → bloc Home
        # jamais exécuté pour les sites non-classement (404 garanti).
        if is_classement_template:
            try:
                html_404 = (output_dir / "404.html").read_text(encoding="utf-8")
            except Exception:
                html_404 = "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>404</title></head><body><h1>Page introuvable</h1></body></html>"
            slugs_to_block = [p.get("slug", "") for p in products if p.get("slug")]
            slugs_to_block += ["scpi"]
            # ── Protection des nouvelles pages d'avis ────────────────────────
            # Ce bloc legacy nettoie les anciennes pages /avis-<slug>.html héritées
            # du template SCPI. Mais désormais on a un VRAI système d'avis dans
            # posts_avis/ qui génère des pages /avis-<marque>.html à conserver.
            # Si une marque d'avis matche un slug de produit (ex: legalplace est
            # à la fois un produit du classement Expert-comptable ET une marque
            # ayant un avis), on doit garder la page d'avis et NE PAS l'écraser.
            _avis_dir_protect = site_dir / "posts_avis"
            _avis_skip_slugs: set = set()
            if _avis_dir_protect.exists():
                for _md in _avis_dir_protect.glob("*.md"):
                    # Le fichier est `avis-<marque>.md`. La page générée s'appelle
                    # `avis-<marque>.html`. Pour ce nettoyage on stocke directement
                    # le slug PRODUIT correspondant (sans préfixe "avis-") afin de
                    # le matcher contre `slugs_to_block`.
                    _stem = _md.stem
                    if _stem.startswith("avis-"):
                        _avis_skip_slugs.add(_stem[len("avis-"):])
            _written = 0
            for slug in slugs_to_block:
                if slug in _avis_skip_slugs:
                    # On a un vrai avis pour cette marque → on garde la page
                    continue
                (output_dir / f"avis-{slug}.html").write_text(html_404, encoding="utf-8")
                _written += 1
            (output_dir / "avis-scpi.html").write_text(html_404, encoding="utf-8")
            (output_dir / "comparatifs-scpi.html").write_text(html_404, encoding="utf-8")
            print(f"  ✓ {_written} pages avis écrasées avec 404 ({len(_avis_skip_slugs)} préservées car vrai avis)")


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

            from datetime import datetime as _dt
            redirects += f"# Generated: {_dt.utcnow().isoformat()}\n"
            (output_dir / "_redirects").write_text(redirects, encoding="utf-8")
            print(f"  ✓ _redirects ({www_preference})")
        copy_shared_assets(output_dir, site_dir)

        # ── Copie public/ (récursif) ─────────────────────────────────────
        # On copie tout l'arbre public/ tel quel, ce qui inclut :
        # - logo.{png,svg,jpg,...} et favicon.* au top-level
        # - blog/<slug>/featured-XXXXX.{jpg,png,...} dans les sous-dossiers
        # - tout autre asset uploadé via le dashboard
        public_dir = site_dir / "public"
        if public_dir.exists():
            for src in public_dir.rglob("*"):
                if src.is_file():
                    rel = src.relative_to(public_dir)
                    dst = output_dir / rel
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dst)
                    # Détecter logo/favicon au top-level pour les variables `site.*`
                    if src.parent == public_dir:
                        if src.stem == "logo":
                            site["logo_img"] = f"/{src.name}"
                        elif src.stem == "favicon":
                            site["favicon_file"] = f"/{src.name}"
            logos = [f for f in public_dir.iterdir() if f.is_file() and f.stem == "logo"]
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
                        if not _keyword_is_enabled(_kw_name2, _enabled_classements):
                            continue
                        _cat_parent2 = _kw_data2.get("__categorie", "Autres") or "Autres"
                        _cat_slug2 = slugify_cat(_kw_name2)
                        _count2 = len(_kw_data2.get("__products", []))
                        if _cat_parent2 not in classements_by_category:
                            classements_by_category[_cat_parent2] = []
                        classements_by_category[_cat_parent2].append({
                            "slug": _cat_slug2, "label": _kw_name2, "count": _count2
                        })

        # Home
        # ⚠⚠⚠ DEBUG MARKER v10 — si tu vois cette ligne dans le log, c'est
        # que v10 est bien déployé et que le code arrive jusqu'ici. Si tu ne
        # la vois pas, c'est qu'un truc plus haut a sauté tout ce bloc OU
        # que v10 n'a pas été push. À RETIRER une fois le bug compris.
        print(f"  🟡 DEBUG v15 : entrée bloc Home, output_dir={output_dir}, exists={output_dir.exists()}")
        # ── Pré-écriture d'un placeholder index.html garantie ────────────
        # On écrit TOUJOURS un placeholder avant la tentative de render réel
        # du template index. Si le template existe et le render réussit, son
        # `.write_text(...)` plus bas écrase le placeholder. Si le template
        # n'existe pas (ou que le render plante), le placeholder reste et
        # garantit que l'URL Cloudflare Pages renvoie quelque chose au lieu
        # d'un 404 sec.
        #
        # Bug d'origine (laboxentrepreneuriat-fr mai 2026) : nouveau site
        # sans products, sans template index-<site>.j2, sans classements
        # cochés → aucun index.html écrit → 404 sur la racine. Le fallback
        # `if not exists` placé APRÈS le bloc render ne se déclenchait pas
        # de manière fiable (un index.html résiduel ou une condition annexe
        # masquait l'écriture). Force-write au début résout définitivement.
        _site_name = site.get("name") or site.get("home_h1") or site_slug
        _theme_bg = theme.get("bg", "#FAF9F6")
        _theme_ink = theme.get("ink", "#0F1419")
        _theme_accent = theme.get("accent2") or theme.get("accent") or "#1E5F8B"
        _theme_font_title = theme.get("font_title", "Georgia")
        _logo_html = ""
        if site.get("logo_img"):
            _logo_html = f'<img src="{site["logo_img"]}" alt="{_site_name}" style="height:56px;width:auto;margin-bottom:36px">'
        _placeholder = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>{_site_name} — site en cours de configuration</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:{_theme_bg};color:{_theme_ink};min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;line-height:1.6}}
.box{{max-width:520px;text-align:center}}
.tag{{display:inline-block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:{_theme_accent};padding:7px 16px;border:1px solid {_theme_accent};border-radius:30px;margin-bottom:28px}}
h1{{font-family:'{_theme_font_title}',Georgia,serif;font-size:clamp(28px,5vw,44px);font-weight:400;color:{_theme_ink};margin-bottom:18px;letter-spacing:-.02em;line-height:1.2}}
.msg{{color:{_theme_ink};opacity:.7;font-size:16px;max-width:420px;margin:0 auto}}
.foot{{margin-top:56px;font-size:11px;color:{_theme_ink};opacity:.4;letter-spacing:.05em;text-transform:uppercase}}
</style>
</head>
<body>
<div class="box">
{_logo_html}
<div class="tag">🚧 En préparation</div>
<h1>{_site_name}</h1>
<p class="msg">Ce site est en cours de construction. Le contenu sera bientôt disponible.</p>
<p class="foot">Build {date.today().isoformat()}</p>
</div>
</body>
</html>"""
        (output_dir / "index.html").write_text(_placeholder, encoding="utf-8")
        _placeholder_written = True  # flag : on l'écrasera si vrai render réussit

        # ── Pré-load léger des avis pour exposer `recent_avis` à la home ──
        # Le chargement complet + rendu des pages d'avis se fait plus bas
        # dans la section AVIS dédiée (avec sanitisation, tri, catégories).
        # Ici on lit juste le frontmatter des .md pour pouvoir injecter les
        # 6 derniers avis dans le render de l'index, en miroir de
        # `recent_blog_posts`. Idempotent (la section AVIS recharge tout).
        _recent_avis_for_home: list[dict] = []
        _avis_pre_dir = site_dir / "posts_avis"
        if _avis_pre_dir.exists():
            for _md_pre in sorted(_avis_pre_dir.glob("*.md")):
                try:
                    _raw_pre = _md_pre.read_text(encoding="utf-8")
                    if not _raw_pre.startswith("---"):
                        continue
                    _parts_pre = _raw_pre.split("---", 2)
                    if len(_parts_pre) < 3:
                        continue
                    _fm_pre = yaml.safe_load(_parts_pre[1]) or {}
                    if not _fm_pre.get("slug"):
                        _fm_pre["slug"] = _md_pre.stem
                    _fm_pre["_sort_date"] = str(_fm_pre.get("date") or "")
                    _recent_avis_for_home.append(_fm_pre)
                except Exception:
                    continue
            _recent_avis_for_home.sort(key=lambda p: p.get("_sort_date", ""), reverse=True)
            _recent_avis_for_home = _recent_avis_for_home[:6]

        index_tpl = site.get("index_template", f"index-{site_slug}.html.j2")
        # On utilise env.get_template() avec try/except plutôt qu'un check
        # sur disque limité à TEMPLATES_DIR — ainsi ChoiceLoader peut trouver
        # le template dans platform/sites/<site>/templates/ aussi.
        from jinja2 import TemplateNotFound as _TemplateNotFound
        try:
            _index_template_obj = env.get_template(index_tpl)
            _index_template_found = True
        except _TemplateNotFound:
            _index_template_obj = None
            _index_template_found = False
        if _index_template_found:
            zero_frais = sum(1 for p in products if str(p.get("frais_souscription", 99)).replace('.0','') == "0")
            top_pairs  = [{"url": f"{a}-vs-{b}", "label": f"{products_by_slug(products, a)['nom']} vs {products_by_slug(products, b)['nom']}"} for a, b in all_pairs[:8]]
            home_title = site.get("home_title") or f"{site.get('name', '')} | Comparatifs {site.get('year', '')}"
            home_desc = site.get("home_description", "")
            # ── Stats home ────────────────────────────────────────────────
            # `total_categories` = nombre de types de logiciels (= nombre
            # de classements générés). Pour un site classement, on somme
            # toutes les listes de classements_by_category. Pour un site
            # non-classement, on compte les categories distinctes des
            # produits (fallback raisonnable).
            if is_classement_template and classements_by_category:
                total_categories = sum(len(v) for v in classements_by_category.values())
            else:
                total_categories = len({p.get("categorie") for p in products if p.get("categorie")})
            try:
                html = _index_template_obj.render(
                    site={**site, "seo": config.get("seo", {})}, theme=theme, products=products,
                    total_pairs=len(all_pairs), zero_frais_count=zero_frais,
                    total_products=len(products), total_categories=total_categories,
                    classements_by_category=classements_by_category,
                    top_pairs=top_pairs, build_date=date.today().isoformat(),
                    site_editorial=site_editorial,
                    page_types=config.get("page_types", {}),
                    recent_blog_posts=substitute_template_vars(blog_posts[:6], _global_vars) if blog_posts else [],
                    recent_avis=substitute_template_vars(_recent_avis_for_home, _global_vars) if _recent_avis_for_home else [],
                    home_title=home_title, home_description=home_desc, home_h1=site.get('home_h1', ''),
                )
                # Cache-buster pour forcer Cloudflare à re-uploader
                html = html.replace("</body>", f"<!-- build:20260504122856 --></body>", 1)
                (output_dir / "index.html").write_text(html, encoding="utf-8")
                _placeholder_written = False
                print(f"  ✓ index.html ({len(products)} produits, {len(all_pairs)} comparatifs)")
            except Exception as _e:
                # Si le render plante, le placeholder pré-écrit reste en place.
                # On logge l'erreur pour debug sans planter le build entier.
                print(f"  ⚠ Render index.html échec : {_e} — placeholder conservé")
        else:
            print(f"  ✓ index.html (placeholder — template {index_tpl} introuvable)")

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
                page_types=config.get("page_types", {}),
                build_date=date.today().isoformat(),
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
                    page_types=config.get("page_types", {}),
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
                    page_types=config.get("page_types", {}),
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
        # Filtrer par selected_keywords si défini dans config
        selected_keywords = config.get('selected_keywords', [])

        # Dédupliquer les produits par slug (les sheets keywords peuvent créer des doublons)
        _seen_slugs: set = set()
        _deduped_products = []
        for prod in products:
            slug = prod.get("slug", "").strip()
            if slug and slug not in _seen_slugs:
                _seen_slugs.add(slug)
                _deduped_products.append(prod)
            elif not slug:
                _deduped_products.append(prod)
        products = _deduped_products

        categories: dict = {}
        for prod in products:
            cat = prod.get("categorie", "").strip()
            if cat:
                if cat not in categories:
                    categories[cat] = []
                categories[cat].append(prod)
        # Appliquer le filtre selected_keywords
        if selected_keywords:
            categories = {k: v for k, v in categories.items()
                         if any(kw.lower() in k.lower() or k.lower() in kw.lower() for kw in selected_keywords)}
            if categories:
                print(f"  🎯 {len(categories)} catégories actives (filtre selected_keywords)")

        if categories:
            classement_count = 0
            for cat, cat_products in categories.items():
                cat_slug = slugify_cat(cat)
                # ── Liste blanche enabled_classements : skip si ce slug de
                # catégorie n'est pas activé. Note : le matching se fait sur
                # le slug de la catégorie (pas du keyword), donc on accepte
                # aussi un match direct sur slugify_cat(cat) qui correspond
                # au slugify_cat(kw_name) lorsque kw_name == cat.
                if _enabled_classements is not None and cat_slug not in _enabled_classements:
                    # Cleanup orphan : si le .html avait été déployé lors d'un
                    # précédent build (mode legacy ou classement décoché), on
                    # le supprime pour que Cloudflare renvoie une 404 native.
                    # `missing_ok=True` rend l'opération idempotente : aucun
                    # crash si le fichier n'a jamais existé. Cf. décision
                    # Julien mai 2026 (Q3 du changement architectural).
                    _orphan = output_dir / f"meilleur-{cat_slug}.html"
                    if _orphan.exists():
                        _orphan.unlink(missing_ok=True)
                        print(f"  🗑 {cat_slug} : .html orphelin supprimé (classement désactivé)")
                    else:
                        print(f"  ⏭ {cat_slug} skipé (non activé dans enabled_classements.json)")
                    continue
                page_slug = f"meilleur-{cat_slug}"
                seo_cfg = config.get("seo", {})
                cat_editorial = editorials_fresh.get(f"classement-{cat_slug}", {})
                # ── Substitution des placeholders {year}, {categorie}, {Categorie}, {count}, {site_name}
                # Bug d'origine : seul le H1 et les fallbacks de pattern recevaient un .replace().
                # Si l'utilisateur éditait meta_title / meta_description / titre_analyse via
                # le dashboard, son texte était passé tel quel au template → {year} brut visible.
                # Fix : on substitue récursivement TOUTES les strings de cat_editorial
                # (intro, en_bref, contenu_custom, faq, titre_analyse, meta_*, h1, etc.)
                # ainsi que les patterns de fallback. Tout futur champ ajouté à l'éditorial
                # hérite automatiquement de la substitution.
                # Variants de casse et de nombre :
                #   {categorie}   → singulier lowercase     ("logiciel de paie")
                #   {Categorie}   → singulier capitalisé    ("Logiciel de paie")
                #   {categories}  → pluriel lowercase       ("logiciels de paie")
                #   {Categories}  → pluriel capitalisé      ("Logiciels de paie")
                # Règle de pluralisation : ajoute 's' au premier mot s'il ne se
                # termine pas déjà par s/x/z (mots invariables ou déjà au pluriel).
                def _pluralize_first(s):
                    if not s: return s
                    parts = s.split(" ", 1)
                    first = parts[0]
                    rest = parts[1] if len(parts) > 1 else ""
                    if first.lower().endswith(("s", "x", "z")):
                        return s
                    return first + "s" + ((" " + rest) if rest else "")
                _cat_lower = cat.lower() if cat else ""
                _cat_cap = (_cat_lower[0].upper() + _cat_lower[1:]) if _cat_lower else ""
                _cat_plural_lower = _pluralize_first(_cat_lower)
                _cat_plural_cap = (_cat_plural_lower[0].upper() + _cat_plural_lower[1:]) if _cat_plural_lower else ""
                _vars = {
                    "year": str(site.get("year", "")),
                    "month": _current_month_fr,
                    "Month": _current_month_fr.capitalize(),
                    "categorie": _cat_lower,
                    "Categorie": _cat_cap,
                    "categories": _cat_plural_lower,
                    "Categories": _cat_plural_cap,
                    "count": str(len(cat_products)),
                    "site_name": site.get("name", ""),
                }
                def _sub_vars(obj):
                    if isinstance(obj, str):
                        for k, v in _vars.items():
                            obj = obj.replace("{" + k + "}", v)
                        return obj
                    if isinstance(obj, dict):
                        return {k: _sub_vars(v) for k, v in obj.items()}
                    if isinstance(obj, list):
                        return [_sub_vars(x) for x in obj]
                    return obj
                # Avant le _sub_vars : si pas de titre_analyse édité par catégorie,
                # injecter le pattern global SEO (sera substitué juste après comme
                # le reste des champs éditoriaux). Sinon, fallback hardcodé du template.
                if not cat_editorial.get("titre_analyse") and seo_cfg.get("classement_titre_analyse_pattern"):
                    cat_editorial = dict(cat_editorial)
                    cat_editorial["titre_analyse"] = seo_cfg["classement_titre_analyse_pattern"]
                cat_editorial = _sub_vars(cat_editorial)
                classement_title = cat_editorial.get("meta_title") or _sub_vars(seo_cfg.get("classement_title_pattern", "Meilleur {categorie} {year} : Top {count}"))
                classement_meta = cat_editorial.get("meta_description") or _sub_vars(seo_cfg.get("classement_meta_pattern", "Comparez les meilleurs {categorie} en {year}."))
                # H1 : priorité (1) édition manuelle de la catégorie, (2) pattern SEO global
                # `classement_h1_pattern`, (3) fallback sur le Title.
                classement_h1 = cat_editorial.get("h1") or _sub_vars(seo_cfg.get("classement_h1_pattern", "")) or classement_title
                # ── Résolution de l'extension de screenshot ──────────────
                # Le template attendait historiquement `<slug>-screenshot.png`,
                # mais les images uploadées via le dashboard peuvent être en .jpg,
                # .jpeg ou .webp. On résout ici l'extension réelle en regardant
                # le fichier présent dans schemas/images/<schema_name>/, et on
                # expose `screenshot_file` directement sur le produit pour que
                # le template n'ait plus à supposer l'extension.
                _schema_imgs_dir = None
                _schema_name_for_img = config.get("page_types", {}).get("classement", "")
                if _schema_name_for_img:
                    _candidate = ROOT / "schemas" / "images" / _schema_name_for_img
                    if _candidate.exists():
                        _schema_imgs_dir = _candidate
                enriched_products = []
                for prod in cat_products:
                    p = dict(prod)
                    slug = prod.get("slug", "")
                    # Résolution screenshot — premier fichier trouvé parmi les
                    # extensions usuelles. Si aucune n'existe, on tombe sur le
                    # default .png (qui déclenchera le `onerror` côté template).
                    if slug and _schema_imgs_dir:
                        for _ext in ("png", "jpg", "jpeg", "webp"):
                            if (_schema_imgs_dir / f"{slug}-screenshot.{_ext}").exists():
                                p["screenshot_file"] = f"{slug}-screenshot.{_ext}"
                                break
                    if "screenshot_file" not in p and slug:
                        p["screenshot_file"] = f"{slug}-screenshot.png"
                    # descriptions_produits ignoré — classement-prod-{slug} a la priorité
                    # Points forts/faibles depuis classement-prod-{slug}
                    prod_ed_key = f"classement-prod-{slug}"
                    if prod_ed_key in editorials_fresh:
                        prod_ed = editorials_fresh[prod_ed_key]
                        if not p.get("points_forts") and prod_ed.get("points_forts"):
                            p["points_forts"] = prod_ed["points_forts"]
                        if not p.get("points_faibles") and prod_ed.get("points_faibles"):
                            p["points_faibles"] = prod_ed["points_faibles"]
                        if not p.get("description") and prod_ed.get("description"):
                            p["description"] = md_to_html(prod_ed["description"])
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

                # Convertir markdown en HTML pour intro, en_bref et contenu_custom
                # (utile quand l'IA renvoie du markdown brut au lieu de HTML —
                # md_to_html détecte automatiquement les contenus déjà HTML
                # via les balises <ul>/<li>/<p> et les laisse tels quels.)
                if cat_editorial.get("intro"):
                    cat_editorial = dict(cat_editorial)
                    cat_editorial["intro"] = md_to_html(cat_editorial["intro"])
                if cat_editorial.get("en_bref"):
                    cat_editorial = dict(cat_editorial)
                    _eb = cat_editorial["en_bref"]
                    # Si déjà HTML (présence de <ul>, <li>, <p>), on garde tel quel
                    if not _re.search(r'<(ul|ol|li|p|div)\b', _eb, _re.I):
                        cat_editorial["en_bref"] = md_to_html(_eb)
                if cat_editorial.get("contenu_custom"):
                    cat_editorial = dict(cat_editorial)
                    cat_editorial["contenu_custom"] = md_to_html(cat_editorial["contenu_custom"])

                # ── Substitution finale {year} sur les produits enrichis ──
                # Le _sub_vars ci-dessus traite cat_editorial. Mais les
                # produits enrichis (description manuelle, points forts/faibles)
                # peuvent aussi contenir des `{year}` saisis manuellement par
                # l'utilisateur ou générés par l'IA. On les substitue ici.
                enriched_products = substitute_template_vars(
                    enriched_products,
                    {"year": _site_year}
                )

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
                    cat_name=cat,
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
                    if not _keyword_is_enabled(kw_name, _enabled_classements):
                        continue
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

    # ── Blog : génération des pages ───────────────────────────────────────
    # Articles individuels + index + pages catégorie. Tournera uniquement si
    # le site a un dossier blog/posts/ avec au moins un article publié
    # (chargé plus haut dans `blog_posts`).
    if not dry_run and blog_posts and blog_engine is not None:
        # SEO params depuis le config seo: ou défauts
        _seo = config.get('seo', {})
        blog_title = _seo.get('blog_title') or f"Blog | {site.get('name', '')}"
        blog_meta = _seo.get('blog_meta') or f"Articles, guides et conseils — {site.get('name', '')}"
        blog_h1 = _seo.get('blog_h1') or 'Le Blog'
        blog_intro = _seo.get('blog_intro') or ''

        # 1) Index blog paginé (30 articles par page)
        BLOG_POSTS_PER_PAGE = 30
        if (TEMPLATES_DIR / "blog-index.html.j2").exists():
            total_posts = len(blog_posts)
            total_pages = max(1, math.ceil(total_posts / BLOG_POSTS_PER_PAGE))

            def _render_blog_page(posts_slice: list, page_num: int, total: int,
                                  base_url: str, h1: str, intro: str,
                                  meta_title: str, meta_desc: str) -> str:
                # URL de la page précédente : page 1 = base_url, page N>2 = base_url/N-1
                prev_url = None
                if page_num == 2:
                    prev_url = base_url
                elif page_num > 2:
                    prev_url = f"{base_url}/{page_num - 1}"
                next_url = f"{base_url}/{page_num + 1}" if page_num < total else None
                # On signale dans le titre si page > 1 (mais SEO : meta dupliquée)
                title = meta_title if page_num == 1 else f"{meta_title} — Page {page_num}"
                # Substitution {year} sur les posts affichés dans l'index/catégorie.
                # Sans ça, les cards de la liste affichaient `{year}` non substitué
                # dans les titres / excerpts (cf. editions-dp.com/blog).
                posts_slice_rendered = substitute_template_vars(posts_slice, _global_vars)
                return env.get_template("blog-index.html.j2").render(
                    site={**site, "seo": _seo}, theme=theme,
                    page_types=config.get("page_types", {}),
                    build_date=date.today().isoformat(),
                    posts=posts_slice_rendered, categories=blog_categories,
                    blog_title=title, blog_meta=meta_desc,
                    blog_h1=h1, blog_intro=intro,
                    current_page=page_num, total_pages=total,
                    base_url=base_url,
                    prev_url=prev_url, next_url=next_url,
                )

            for page_num in range(1, total_pages + 1):
                start = (page_num - 1) * BLOG_POSTS_PER_PAGE
                end = start + BLOG_POSTS_PER_PAGE
                page_posts = blog_posts[start:end]
                html = _render_blog_page(
                    page_posts, page_num, total_pages,
                    base_url="/blog",
                    h1=blog_h1, intro=blog_intro,
                    meta_title=blog_title, meta_desc=blog_meta,
                )
                # ── /blog/ (page 1) + /blog/N/ (pages 2+) ────────────────────
                blog_root = output_dir / "blog"
                blog_root.mkdir(parents=True, exist_ok=True)
                if page_num == 1:
                    (blog_root / "index.html").write_text(html, encoding="utf-8")
                    blog_expected.add("blog/index.html")
                else:
                    page_dir = blog_root / str(page_num)
                    page_dir.mkdir(parents=True, exist_ok=True)
                    (page_dir / "index.html").write_text(html, encoding="utf-8")
                    blog_expected.add(f"blog/{page_num}/index.html")
            pagination_msg = f" + {total_pages - 1} page(s) paginée(s)" if total_pages > 1 else ""
            print(f"  ✓ blog.html (index, {total_posts} articles, {BLOG_POSTS_PER_PAGE}/page){pagination_msg}")

            # 2) Pages catégorie (réutilise le template index, filtré, paginé)
            for cat in blog_categories:
                # Multi-catégories : un post apparaît dans CHAQUE catégorie où il est taggé
                cat_posts = [p for p in blog_posts
                             if cat['name'].lower() in [c.lower() for c in _post_categories(p)]]
                cat_total = len(cat_posts)
                cat_pages = max(1, math.ceil(cat_total / BLOG_POSTS_PER_PAGE))
                cat_h1 = cat['name']
                cat_intro = f"{cat['count']} article{'s' if cat['count'] > 1 else ''}"
                cat_title = f"{cat['name']} — Blog | {site.get('name', '')}"
                cat_meta = f"Articles {cat['name'].lower()} — {site.get('name', '')}"
                cat_base_url = f"/{cat['slug']}"
                for page_num in range(1, cat_pages + 1):
                    start = (page_num - 1) * BLOG_POSTS_PER_PAGE
                    end = start + BLOG_POSTS_PER_PAGE
                    page_posts = cat_posts[start:end]
                    html = _render_blog_page(
                        page_posts, page_num, cat_pages,
                        base_url=cat_base_url,
                        h1=cat_h1, intro=cat_intro,
                        meta_title=cat_title, meta_desc=cat_meta,
                    )
                    # ── /<cat>/ (page 1) + /<cat>/N/ (pages 2+) ──────────────
                    cat_root = output_dir / cat['slug']
                    cat_root.mkdir(parents=True, exist_ok=True)
                    if page_num == 1:
                        (cat_root / "index.html").write_text(html, encoding="utf-8")
                        blog_expected.add(f"{cat['slug']}/index.html")
                    else:
                        page_dir = cat_root / str(page_num)
                        page_dir.mkdir(parents=True, exist_ok=True)
                        (page_dir / "index.html").write_text(html, encoding="utf-8")
                        blog_expected.add(f"{cat['slug']}/{page_num}/index.html")
            if blog_categories:
                print(f"  ✓ {len(blog_categories)} pages catégories blog générées")

        # 3) Articles individuels
        if (TEMPLATES_DIR / "blog-post.html.j2").exists():
            tpl_post = env.get_template("blog-post.html.j2")
            for post in blog_posts:
                slug = post.get('slug', '')
                if not slug:
                    continue
                # Maillage interne : 4 articles de la même catégorie (figé)
                related = blog_engine.compute_related_posts(post, blog_posts, n=4)
                # Enrichir les related avec excerpt si pas déjà fait
                for rp in related:
                    if 'excerpt' not in rp:
                        rp['excerpt'] = blog_engine.excerpt_from_md(rp.get('content_md', ''), 90)
                # ── Substitution {year} dans tout le post et ses related ──
                # Permet à l'utilisateur d'écrire `{year}` dans le titre, le
                # H1, la meta, le contenu, la FAQ etc. au moment d'éditer ses
                # .md, et que ce soit remplacé par 2026 au moment du rendu.
                # Important : on opère sur des COPIES pour ne pas muter les
                # objets blog_posts utilisés ailleurs (sitemap, related).
                post_rendered = substitute_template_vars(post, _global_vars)
                related_rendered = substitute_template_vars(related, _global_vars)
                html = tpl_post.render(
                    site={**site, "seo": _seo}, theme=theme,
                    page_types=config.get("page_types", {}),
                    build_date=date.today().isoformat(),
                    post=post_rendered, related_posts=related_rendered,
                    blog_categories=blog_categories,
                    all_posts=blog_posts,
                )
                # ── Écriture en /<slug>/index.html (URLs avec slash final) ───
                # Format WordPress-compatible : Cloudflare Pages sert /<slug>/
                # et redirige automatiquement /<slug> → /<slug>/ en 301.
                article_dir = output_dir / slug
                article_dir.mkdir(parents=True, exist_ok=True)
                (article_dir / "index.html").write_text(html, encoding="utf-8")
            print(f"  ✓ {len(blog_posts)} articles de blog générés")

    # ───────────────────────────────────────────────────────────────────────
    # ── CODES PROMO (template codes-promo.html.j2) ────────────────────────
    # 1 marque = 1 page /codes-promo/<slug>/. Listing global /codes-promo/.
    # Activé site par site via `has_codes_promo: true` dans hub.config.json
    # OU si le dossier codes_promo/ existe et contient des .md.
    # ───────────────────────────────────────────────────────────────────────
    has_codes_promo = bool(config.get("has_codes_promo")) or (site_dir / "codes_promo").exists()
    if has_codes_promo and codes_promo_engine is not None:
        cp_dir = site_dir / "codes_promo"
        cp_brands = codes_promo_engine.load_all_brands(cp_dir.parent, include_drafts=False) if cp_dir.exists() else []
        if cp_brands:
            cp_index_tpl_path = TEMPLATES_DIR / "codes-promo.html.j2"
            cp_listing_tpl_path = TEMPLATES_DIR / "codes-promo-index.html.j2"
            # Vérifier que les templates existent (site-local d'abord, fallback base)
            try:
                cp_tpl = env.get_template("codes-promo.html.j2")
            except Exception as _e:
                print(f"  ⚠ Codes promo : template codes-promo.html.j2 absent — skip ({_e})")
                cp_tpl = None
            try:
                cp_listing_tpl = env.get_template("codes-promo-index.html.j2")
            except Exception as _e:
                print(f"  ⚠ Codes promo : template codes-promo-index.html.j2 absent — skip listing ({_e})")
                cp_listing_tpl = None

            if cp_tpl is not None:
                # ── Données partagées : auteur, date construite, mois courant
                _cp_author = config.get("author", {}) or {}
                # Fallback : si pas de bloc `author:` top-level, dérive de site.author_name/photo
                if not _cp_author.get("name") and config.get("site", {}).get("author_name"):
                    _cp_author = {
                        "name": config["site"].get("author_name"),
                        "photo": config["site"].get("author_photo"),
                        "job_title": config["site"].get("author_job_title"),
                    }
                today = date.today()
                _cp_months_fr = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                                 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
                _cp_month_year = f"{_cp_months_fr[today.month]} {today.year}"
                _cp_date_fr = f"{today.day} {_cp_months_fr[today.month]} {today.year}"
                _cp_date_short = f"{today.day:02d}/{today.month:02d}"

                # ── Pré-résolution des related_brands pour chaque marque
                # (figé au 1er rendu si pas déjà défini, override dashboard)
                for b in cp_brands:
                    b["_related_resolved"] = codes_promo_engine.resolve_related_brands(b, cp_brands, n=8)

                # ── Rendering de chaque marque ──────────────────────────
                cp_site_url = (config.get("site", {}).get("url") or "").rstrip("/")
                if not cp_site_url and config.get("site", {}).get("domain"):
                    cp_site_url = f"https://{config['site']['domain']}"
                n_cp = 0
                for b in cp_brands:
                    slug = b.get("slug", "")
                    if not slug:
                        continue
                    jsonld_blocks = codes_promo_engine.build_jsonld_blocks(b, cp_site_url)
                    steps = codes_promo_engine.extract_steps_from_content(b)
                    try:
                        html = cp_tpl.render(
                            site={**site, "url": cp_site_url, "seo": config.get("seo", {})},
                            theme=theme,
                            author=_cp_author,
                            brand=b,
                            jsonld_blocks=jsonld_blocks,
                            how_to_steps=steps,
                            related_brands=b["_related_resolved"],
                            build_date=today.isoformat(),
                            build_date_fr=_cp_date_fr,
                            build_date_short_fr=_cp_date_short,
                            build_month_year=_cp_month_year,
                            year=today.year,
                            format_mois_court=codes_promo_engine.format_mois_court_fr,
                        )
                    except Exception as _e:
                        print(f"  ⚠ Codes promo : render échec pour {slug} : {_e}")
                        continue
                    cp_brand_dir = output_dir / "codes-promo" / slug
                    cp_brand_dir.mkdir(parents=True, exist_ok=True)
                    (cp_brand_dir / "index.html").write_text(html, encoding="utf-8")
                    n_cp += 1
                if n_cp:
                    print(f"  ✓ {n_cp} pages codes promo générées (/codes-promo/<marque>/)")

            # ── Listing /codes-promo/ ────────────────────────────────────
            if cp_listing_tpl is not None:
                # Enrichir chaque marque avec best_offer_label pour le listing
                for b in cp_brands:
                    b["best_offer_label"] = codes_promo_engine._best_offer_label(b)
                # Catégories de marques pour le filtre
                cp_cats: dict = {}
                for b in cp_brands:
                    cm = (b.get("categorie_marque") or "").strip()
                    if not cm:
                        continue
                    key = cm.lower()
                    if key not in cp_cats:
                        cp_cats[key] = {
                            "name": cm,
                            "slug": cm.lower().replace(" ", "-"),
                            "count": 0,
                        }
                    cp_cats[key]["count"] += 1
                cp_cats_list = sorted(cp_cats.values(), key=lambda x: x["count"], reverse=True)
                total_codes = sum(b.get("n_total", 0) for b in cp_brands)
                try:
                    html = cp_listing_tpl.render(
                        site={**site, "url": cp_site_url, "seo": config.get("seo", {})},
                        theme=theme,
                        author=_cp_author,
                        brands=cp_brands,
                        categories=cp_cats_list,
                        total_codes=total_codes,
                        build_date=today.isoformat(),
                        build_date_fr=_cp_date_fr,
                        build_month_year=_cp_month_year,
                        year=today.year,
                    )
                    cp_root = output_dir / "codes-promo"
                    cp_root.mkdir(parents=True, exist_ok=True)
                    (cp_root / "index.html").write_text(html, encoding="utf-8")
                    print(f"  ✓ /codes-promo/ (listing : {len(cp_brands)} marques, {total_codes} codes actifs)")
                except Exception as _e:
                    print(f"  ⚠ Codes promo : render listing échec : {_e}")

    # ───────────────────────────────────────────────────────────────────────
    # ── PAGE À PROPOS (template a-propos.html.j2) ─────────────────────────
    # Page statique simple. Générée si le template existe pour ce site.
    # URL : /a-propos/index.html
    # ───────────────────────────────────────────────────────────────────────
    apropos_tpl = None
    try:
        apropos_tpl = env.get_template("a-propos.html.j2")
    except Exception:
        pass
    if apropos_tpl is not None:
        _apropos_author = config.get("author", {}) or {}
        # Fallback : si pas de bloc author top-level, dérive de site.author_*
        if not _apropos_author.get("name") and config.get("site", {}).get("author_name"):
            _apropos_author = {
                "name": config["site"].get("author_name"),
                "photo": config["site"].get("author_photo"),
                "job_title": config["site"].get("author_job_title"),
                "bio": config["site"].get("author_bio"),
            }
        _apropos_site_url = (config.get("site", {}).get("url") or "").rstrip("/")
        if not _apropos_site_url and config.get("site", {}).get("domain"):
            _apropos_site_url = f"https://{config['site']['domain']}"
        try:
            html = apropos_tpl.render(
                site={**site, "url": _apropos_site_url, "seo": config.get("seo", {})},
                theme=theme,
                author=_apropos_author,
                year=date.today().year,
                build_date=date.today().isoformat(),
            )
            apropos_dir = output_dir / "a-propos"
            apropos_dir.mkdir(parents=True, exist_ok=True)
            (apropos_dir / "index.html").write_text(html, encoding="utf-8")
            print(f"  ✓ /a-propos/ (page À propos)")
        except Exception as _e:
            print(f"  ⚠ À propos : render échec : {_e}")

    # ───────────────────────────────────────────────────────────────────────
    # ── AVIS (template avis-post.html.j2) ─────────────────────────────────
    # Structure parallèle au blog mais avec une template dédiée et des données
    # entièrement structurées (note, tarifs, FAQ, etc.) dans le frontmatter
    # plutôt qu'un body markdown. Une page index /avis liste tous les avis.
    # ───────────────────────────────────────────────────────────────────────
    avis_posts: list[dict] = []
    avis_categories: list[dict] = []
    avis_dir = site_dir / "posts_avis"
    if avis_dir.exists() and (TEMPLATES_DIR / "avis-post.html.j2").exists():
        # Chargement des fichiers .md (frontmatter only, body vide)
        for md in sorted(avis_dir.glob("*.md")):
            try:
                raw = md.read_text(encoding="utf-8")
            except Exception as e:
                print(f"  ⚠ Avis : {md.name} illisible : {e}")
                continue
            if not raw.startswith("---"):
                continue
            parts = raw.split("---", 2)
            if len(parts) < 3:
                continue
            try:
                fm = yaml.safe_load(parts[1]) or {}
            except Exception as e:
                print(f"  ⚠ Avis : frontmatter invalide {md.name} : {e}")
                continue
            if not fm.get("slug"):
                fm["slug"] = md.stem
            # Date au format ISO (string), pour pouvoir trier
            d = fm.get("date") or ""
            fm["_sort_date"] = str(d)
            avis_posts.append(fm)

        # Tri par date décroissante (plus récents en premier)
        avis_posts.sort(key=lambda p: p.get("_sort_date", ""), reverse=True)

        # Collecte des catégories distinctes
        cats_map: dict[str, dict] = {}
        for p in avis_posts:
            c = (p.get("categorie") or "").strip()
            if not c:
                continue
            key = c.lower()
            if key not in cats_map:
                cats_map[key] = {"name": c, "slug": slugify_cat(c), "count": 0}
            cats_map[key]["count"] += 1
        avis_categories = sorted(cats_map.values(), key=lambda x: x["name"].lower())

        # Permet aux templates de nav d'afficher l'onglet "Avis"
        if avis_posts:
            site["has_avis"] = True

    # Génération des pages d'avis individuelles + index /avis
    # ⚠ Important : on entre dans ce bloc MÊME quand `avis_posts` est vide, pour
    # forcer la regénération de `output/avis.html` (qui sinon resterait à sa
    # version précédente avec les avis désormais supprimés).
    # Le template `avis-index.html.j2` gère nativement le cas liste vide.
    if (TEMPLATES_DIR / "avis-post.html.j2").exists():
        tpl_avis = env.get_template("avis-post.html.j2")
        avis_rendered = 0
        for post in avis_posts:
            slug = post.get("slug")
            if not slug:
                continue
            # ── Sanitisation défensive ──────────────────────────────────────
            # Le template avis-post fait `post.note | int` et `post.faq | length`
            # qui plantent si la valeur est None ou de mauvais type. On garantit
            # les bons types avant le rendu pour éviter un échec silencieux qui
            # laisserait la page en 404 (cf bug rapporté par Julien).
            if not isinstance(post.get("note"), (int, float)):
                try:
                    post["note"] = float(post.get("note") or 4.0)
                except Exception:
                    post["note"] = 4.0
            for _list_field in ("points_forts", "points_faibles", "faq", "tarifs", "link_anchors"):
                if not isinstance(post.get(_list_field), list):
                    post[_list_field] = []
            for _dict_field in ("h2_fonctionnalites", "h2_support", "h2_qualite_prix", "h2_avis_clients"):
                if not isinstance(post.get(_dict_field), dict):
                    post[_dict_field] = {"titre": "", "contenu_html": ""}
            for _str_field in ("marque", "categorie", "h1", "en_bref", "verdict",
                               "cta_url", "cta_label", "cible", "meta_title",
                               "meta_description", "sentiment", "date"):
                if not isinstance(post.get(_str_field), str):
                    post[_str_field] = "" if post.get(_str_field) is None else str(post.get(_str_field))
            if not post.get("sentiment"):
                post["sentiment"] = "positif"
            # ── Enrichissement façon blog ────────────────────────────────────
            # Pour aligner les meta d'avis sur celles du blog (catégorie · date ·
            # temps de lecture · auteur), on précalcule ici :
            #   - categorie_slug : slug brut (PAS le `categorie-<slug>` du blog,
            #                      car les avis sont déjà namespacés sous /avis/<slug>/).
            #                      Doit matcher la page catégorie créée plus bas
            #                      avec `slugify_cat(c)` (cf cats_map).
            #   - date_display   : date FR formatée
            #   - reading_time   : minutes, basé sur le total des mots dans tous
            #                      les champs textuels (en_bref + h2_* + sections_html
            #                      + faq + verdict + points forts/faibles).
            post["categorie_slug"] = slugify_cat(post.get("categorie", "")) if post.get("categorie") else ""
            post["date_display"] = fr_date(post.get("date", ""))
            # Mots : on additionne tous les blocs textuels visibles côté lecteur
            _text_chunks = [
                post.get("en_bref", ""),
                post.get("verdict", ""),
                post.get("h2_fonctionnalites", {}).get("contenu_html", ""),
                post.get("h2_support", {}).get("contenu_html", ""),
                post.get("h2_qualite_prix", {}).get("contenu_html", ""),
                # h2_avis_clients : structure nouvelle (aiment + regrettent) ou
                # legacy (contenu_html). On lit les 3 pour rester rétro-compat
                # avec les anciens posts non régénérés.
                post.get("h2_avis_clients", {}).get("aiment", ""),
                post.get("h2_avis_clients", {}).get("regrettent", ""),
                post.get("h2_avis_clients", {}).get("contenu_html", ""),
                # sections_html : bloc HTML libre généré par Claude depuis le
                # prompt custom du brouillon (cf. avis_publish_scheduled.py).
                # Souvent le morceau le plus long du contenu — sans lui le
                # reading_time est très sous-estimé.
                post.get("sections_html", ""),
            ]
            # Points forts/faibles (listes de chaînes)
            for _liste in (post.get("points_forts") or []), (post.get("points_faibles") or []):
                for _pt in _liste:
                    if isinstance(_pt, str):
                        _text_chunks.append(_pt)
            for _f in (post.get("faq") or []):
                if isinstance(_f, dict):
                    _text_chunks.append(_f.get("q", ""))
                    _text_chunks.append(_f.get("r", ""))
            _total_text = " ".join(str(c) for c in _text_chunks)
            # Strip basique des tags HTML pour ne compter que les mots réels
            import re as _re_avis
            _stripped = _re_avis.sub(r"<[^>]+>", " ", _total_text)
            _words = len([w for w in _stripped.split() if w.strip()])
            post["reading_time"] = max(1, round(_words / 200))

            # ── Substitution {year} dans tout le post d'avis ──────────────
            # Permet à l'utilisateur d'écrire `{year}` dans le H1, en_bref,
            # sections_html, verdict, FAQ etc. du frontmatter .md, et que
            # ce soit remplacé par 2026 au moment du rendu.
            # Opère sur une COPIE pour ne pas muter l'avis (utilisé ailleurs
            # pour all_avis et pour les pages catégorie).
            post_rendered = substitute_template_vars(post, _global_vars)
            all_avis_rendered = substitute_template_vars(avis_posts, _global_vars)

            try:
                html = tpl_avis.render(
                    site={**site, "seo": _seo}, theme=theme,
                    page_types=config.get("page_types", {}),
                    build_date=date.today().isoformat(),
                    post=post_rendered,
                    avis_categories=avis_categories,
                    all_avis=all_avis_rendered,
                )
            except Exception as e:
                # Log détaillé pour identifier la cause exacte (type d'erreur,
                # ligne du template, etc.). Permet à Julien de copier-coller
                # depuis les logs GitHub Actions.
                import traceback as _tb
                print(f"  ⚠ Avis : rendu échoué pour '{slug}' (marque={post.get('marque','?')}) : {type(e).__name__}: {e}")
                _tb_str = _tb.format_exc()
                # Limite à 800 chars pour pas spammer les logs
                print("     " + _tb_str.replace("\n", "\n     ")[:800])
                continue
            (output_dir / f"{slug}.html").write_text(html, encoding="utf-8")
            avis_rendered += 1
        print(f"  ✓ {avis_rendered}/{len(avis_posts)} avis générés (échecs : {len(avis_posts) - avis_rendered})")

        # Index /avis + pages catégorie /avis/<cat>
        if (TEMPLATES_DIR / "avis-index.html.j2").exists():
            tpl_avis_idx = env.get_template("avis-index.html.j2")
            site_name = site.get("name", "")
            year = site.get("year", date.today().year)
            # Index général /avis.html — substitution {year} sur la liste
            avis_posts_rendered = substitute_template_vars(avis_posts, _global_vars)
            html = tpl_avis_idx.render(
                site={**site, "seo": _seo}, theme=theme,
                page_types=config.get("page_types", {}),
                build_date=date.today().isoformat(),
                posts=avis_posts_rendered,
                categories=avis_categories,
                base_url="/avis",
                avis_title=f"Avis et tests {site_name} {year}",
                avis_meta=f"Tous nos avis détaillés sur les services et plateformes. Notes, tests, comparatifs.",
                avis_h1=f"Nos avis détaillés",
                avis_intro=f"Retrouvez {len(avis_posts)} avis indépendants et structurés, avec notes, tarifs et verdict.",
            )
            (output_dir / "avis.html").write_text(html, encoding="utf-8")
            print(f"  ✓ avis.html (index, {len(avis_posts)} avis)")

            # Pages catégorie /avis/<slug>/index.html
            for cat in avis_categories:
                cat_posts = [p for p in avis_posts
                             if (p.get("categorie") or "").strip().lower() == cat["name"].lower()]
                cat_dir = output_dir / "avis" / cat["slug"]
                cat_dir.mkdir(parents=True, exist_ok=True)
                # Substitution {year} sur les avis de cette catégorie
                cat_posts_rendered = substitute_template_vars(cat_posts, _global_vars)
                html = tpl_avis_idx.render(
                    site={**site, "seo": _seo}, theme=theme,
                    page_types=config.get("page_types", {}),
                    build_date=date.today().isoformat(),
                    posts=cat_posts_rendered,
                    categories=avis_categories,
                    current_category=cat["name"],
                # IMPORTANT : trailing slash conservé dans base_url car les
                # pages catégorie sont servies depuis avis/<cat>/index.html.
                # Cloudflare Pages redirige automatiquement /avis/<cat> → /avis/<cat>/.
                # Sans le slash dans le canonical, Google "canonicalise" l'URL
                # (bug rapporté par Julien : URL indexable avec slash mais canonical sans).
                    base_url=f"/avis/{cat['slug']}/",
                    avis_title=f"Avis {cat['name'].lower()} — {site_name}",
                    avis_meta=f"Avis détaillés sur les {cat['name'].lower()} : tests, notes, comparatifs.",
                    avis_h1=f"Avis {cat['name'].lower()}",
                    avis_intro=f"{cat['count']} avis dans la catégorie « {cat['name']} ».",
                )
                (cat_dir / "index.html").write_text(html, encoding="utf-8")
            if avis_categories:
                print(f"  ✓ {len(avis_categories)} page(s) catégorie d'avis")

    print(f"\n  {'[DRY] ' if dry_run else ''}✅ {generated} pages générées, {skipped} ignorées")
    if not dry_run:
        print(f"  📁 Output : {output_dir}")
        # ── DEBUG : liste les fichiers avis-*.html présents juste avant le
        # deploy Cloudflare. Permet de vérifier qu'un avis attendu (.md dans
        # posts_avis/) a bien été RENDU et est PHYSIQUEMENT là, pas écrasé.
        _avis_html = sorted(output_dir.glob("avis-*.html"))
        print(f"  🔍 DEBUG fichiers avis-*.html dans output ({len(_avis_html)}) :")
        for _f in _avis_html[:10]:
            try:
                _sz = _f.stat().st_size
                # Lit la première vraie ligne H1 ou title pour confirmer le contenu
                _content = _f.read_text(encoding="utf-8", errors="replace")
                _title_m = re.search(r"<title[^>]*>([^<]+)</title>", _content)
                _h1_m = re.search(r"<h1[^>]*>([^<]+)</h1>", _content)
                _hint = (_title_m.group(1) if _title_m else (_h1_m.group(1) if _h1_m else _content[:60])).strip()[:80]
                print(f"     • {_f.name} ({_sz}o) → {_hint!r}")
            except Exception as _err:
                print(f"     • {_f.name} (lecture impossible: {_err})")
        if len(_avis_html) > 10:
            print(f"     ... et {len(_avis_html) - 10} autres")
        # Cherche spécifiquement les avis attendus depuis posts_avis/
        _expected_avis_dir = site_dir / "posts_avis"
        if _expected_avis_dir.exists():
            _missing = []
            for _md in _expected_avis_dir.glob("*.md"):
                _expected_html = output_dir / f"{_md.stem}.html"
                if not _expected_html.exists():
                    _missing.append(_md.stem)
            if _missing:
                print(f"  ⚠ AVIS MANQUANTS (présents en .md mais .html absent) : {_missing}")
            else:
                print(f"  ✓ Tous les avis du dossier posts_avis ont leur .html ({len(list(_expected_avis_dir.glob('*.md')))} attendus)")
        # Post-traitement : tracking persistant des dateModified pour éviter
        # que chaque deploy ne marque toutes les pages comme modifiées
        # aujourd'hui (mauvais signal SEO). Cf _post_process_dates_tracking.
        try:
            today_iso_pp = date.today().isoformat()
            today_fr_pp = fr_date(today_iso_pp)
            _post_process_dates_tracking(output_dir, site_dir, today_iso_pp, today_fr_pp, fr_date)
        except Exception as e:
            print(f"  ⚠ Tracking dates.json a échoué : {e}")

        # Normalisation finale des <table> dans tous les .html générés.
        # Ajoute <div class="table-wrap"> + <thead>/<tbody> aux tables nues
        # (générées par l'IA, ou par markdown sans header explicite).
        # Le CSS de base/_table_styles.html.j2 s'occupe du visuel.
        try:
            _post_process_normalize_tables(output_dir)
        except Exception as e:
            print(f"  ⚠ Normalisation tables a échoué : {e}")


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
