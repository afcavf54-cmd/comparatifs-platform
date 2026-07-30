#!/usr/bin/env python3
"""
blog_publish_scheduled.py — Cron job pour publier les articles de blog programmés.

Pour chaque site qui a un `blog_sheet_csv_url` configuré dans son config.yaml :
1. Lit le CSV de la sheet
2. Filtre les lignes dont date_publication + heure_publication <= maintenant
3. Compare avec `blog/schedule_processed.json` (slugs déjà traités)
4. Pour les nouvelles lignes : appelle Claude API → génère HTML → écrit `blog/posts/<slug>.md`

Output (GITHUB_OUTPUT) :
    sites_to_deploy=<site1>,<site2>,...   liste des sites à redéployer

Variables d'env requises :
    ANTHROPIC_API_KEY    pour la génération d'articles

Variables d'env optionnelles :
    MAX_ARTICLES_PER_RUN  Limite GLOBALE d'articles générés par run, tous sites
                          confondus. Défaut : 10. Sert à borner la durée d'un
                          run et le coût Claude/OpenAI en cas de rattrapage
                          massif (ex. 96 articles dont la date est passée).
                          Mettre 999 pour désactiver la limite.

Format attendu du CSV (colonnes) :
    titre              (obligatoire)
    categorie          (obligatoire)
    prompt_custom      (optionnel)
    date_publication   (obligatoire — date OU marqueur brouillon)
                       3 cas acceptés :
                         • date au format YYYY-MM-DD → article publié à cette date
                         • vide → article publié immédiatement
                         • mot-clé "draft" / "brouillon" / "wip" / "pending" /
                           "todo" / "à valider" → article généré par Claude
                           mais marqué status: draft dans le frontmatter
                           (invisible sur le site live, validable manuellement
                           ensuite en passant status: published)
    heure_publication  (optionnel, format HH:MM, défaut 09:00)
    slug               (optionnel, dérivé du titre sinon)
    meta_title         (optionnel)
    meta_description   (optionnel)
    nombre_mots_minimum  (optionnel, défaut 750, plage 300-3000)
    link_anchors       (optionnel)
    mots_imposes       (optionnel)

Format de slug : cf. blog_slug_format dans config.yaml ('prefix' | 'clean').
Global prompt : cf. thematic | blog_global_prompt | schema fallback.
"""
from __future__ import annotations
import csv
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
import urllib.error
from datetime import datetime
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")
from pathlib import Path

import yaml

try:
    sys.path.insert(0, str(Path(__file__).parent))
    from _image_generator import generate_featured_image  # type: ignore
except Exception:
    generate_featured_image = None  # type: ignore

ROOT = Path(__file__).parent.parent
SITES_DIR = ROOT / "sites"
THEMATICS_DIR = ROOT / "thematics"

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
# ── Modèle Claude ─────────────────────────────────────────────────────────
# Source de vérité UNIQUE dans platform/scripts/_ai_model.py.
# Changer la version là-bas la met à jour partout (enrich, blog, avis).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _ai_model import CLAUDE_MODEL

# ── Limite globale d'articles par run (tous sites confondus) ──────────────
# Évite qu'un rattrapage massif (ex. 96 articles d'un coup sur cadeauclic)
# n'explose la durée du workflow (timeout GitHub Actions) ni le coût Claude
# en un seul shot. Le cron quotidien continuera à grignoter la liste sur
# plusieurs jours. Override via env var MAX_ARTICLES_PER_RUN.
MAX_ARTICLES_PER_RUN = int(os.environ.get("MAX_ARTICLES_PER_RUN", "10"))


# ─── Helpers ──────────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    s = unicodedata.normalize("NFD", str(text or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s.lower())
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "article"


def assign_slug(slug: str, existing: set[str], use_prefix: bool = True) -> str:
    if not use_prefix:
        if slug not in existing:
            return slug
        for i in range(2, 1000):
            candidate = f"{slug}-{i}"
            if candidate not in existing:
                print(f"   ⚠ Slug '{slug}' déjà pris, utilisation de '{candidate}'")
                return candidate
        return f"{slug}-{int(time.time())}"
    if re.match(r"^\d{3,5}-", slug):
        return slug
    import random
    for _ in range(30):
        candidate = f"{random.randint(1000, 9999)}-{slug}"
        if candidate not in existing:
            return candidate
    return f"{int(time.time()) % 10000:04d}-{slug}"


def add_random_prefix(slug: str, existing: set[str], use_prefix: bool = True) -> str:
    return assign_slug(slug, existing, use_prefix=use_prefix)


def fetch_csv(url: str) -> list[dict]:
    if not url:
        return []
    if '/pubhtml' in url:
        url = re.sub(r'/pubhtml(\?[^#]*)?(#.*)?$', '/pub?output=csv', url)
        print(f"   ℹ URL normalisée → {url[:80]}...")
    elif re.search(r'/pub(\?|$)', url) and 'output=csv' not in url:
        if '?' in url:
            url = url + '&output=csv'
        else:
            url = url + '?output=csv'
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8-sig", errors="replace")
    except Exception as e:
        print(f"   ⚠ Erreur fetch sheet : {e}")
        return []
    reader = csv.DictReader(io.StringIO(raw))
    rows: list[dict] = []
    for row in reader:
        rows.append({(k or "").strip(): (v or "").strip() for k, v in row.items() if k})
    return rows


def parse_pub_datetime(date_str: str, time_str: str = "09:00") -> datetime | None:
    if not date_str:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            d = datetime.strptime(date_str.strip(), fmt)
            break
        except ValueError:
            continue
    else:
        return None
    ts = (time_str or "09:00").strip() or "09:00"
    hour, minute, second = 9, 0, 0
    for fmt in ("%H:%M:%S", "%H:%M", "%Hh%M", "%H h %M"):
        try:
            t = datetime.strptime(ts, fmt).time()
            hour, minute, second = t.hour, t.minute, t.second
            break
        except ValueError:
            continue
    return d.replace(hour=hour, minute=minute, second=second, tzinfo=PARIS)


# Marqueurs de brouillon dans la colonne date_publication de la sheet.
# Quand l'un de ces mots-clés est utilisé à la place d'une date, l'article
# est GÉNÉRÉ par Claude (texte + image + meta) mais marqué `status: draft`
# dans le frontmatter. Du coup il N'APPARAÎT PAS sur le site live (le filtre
# include_drafts=False de blog_engine l'écarte), mais existe dans le repo
# et est éditable par l'utilisateur. Workflow : marquer "draft" dans la
# sheet pour la rédaction → valider le contenu auprès du client → passer
# manuellement status: draft → published dans le .md (ou via dashboard).
DRAFT_MARKERS = {"draft", "brouillon", "wip", "pending", "todo", "à valider", "a valider"}


def is_draft_marker(date_str: str) -> bool:
    """True si la valeur du champ date_publication est un marqueur de
    brouillon (cf. DRAFT_MARKERS) plutôt qu'une vraie date."""
    return (date_str or "").strip().lower() in DRAFT_MARKERS


def call_claude(system: str, user: str, retries: int = 3, max_tokens: int = 4000) -> str:
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY manquante")
    body = json.dumps({
        "model": CLAUDE_MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "stream": True,
    }).encode("utf-8")
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                "https://api.anthropic.com/v1/messages",
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                },
                method="POST",
            )
            chunks: list[str] = []
            with urllib.request.urlopen(req, timeout=120) as resp:
                for raw_line in resp:
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line.startswith("data: "):
                        continue
                    payload = line[len("data: "):]
                    if payload == "[DONE]":
                        break
                    try:
                        event = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    if event.get("type") == "content_block_delta":
                        delta = event.get("delta") or {}
                        if delta.get("type") == "text_delta":
                            chunks.append(delta.get("text", ""))
                    elif event.get("type") == "error":
                        err_info = event.get("error") or {}
                        raise RuntimeError(
                            f"Erreur API streaming : {err_info.get('type', '?')} — "
                            f"{err_info.get('message', '')}"
                        )
            text = "".join(chunks)
            if not text:
                raise RuntimeError("Réponse streaming vide (aucun text_delta reçu)")
            return text
        except Exception as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep([5, 15, 30][attempt])
    raise RuntimeError(f"Claude API a échoué après {retries} tentatives : {last_err}")


def strip_code_fences(text: str) -> str:
    text = re.sub(r"^```(?:html|HTML|markdown|md)?\s*\n?", "", text.strip())
    text = re.sub(r"\n?\s*```\s*$", "", text)
    return text.strip()


def get_config_value(config: dict, key: str):
    if key in config:
        return config[key]
    for k, v in (config or {}).items():
        if isinstance(v, dict) and key in v:
            return v[key]
    return None


def _resolve_slug_format(config: dict) -> str:
    raw = (get_config_value(config, "blog_slug_format") or "").strip().lower()
    if not raw:
        return "prefix"
    if raw not in ("prefix", "clean"):
        print(f"   ⚠ blog_slug_format={raw!r} non reconnu — fallback 'prefix'")
        return "prefix"
    return raw


def _load_thematic_prompt(thematic: str) -> str:
    name = (thematic or "").strip()
    if not name:
        return ""
    path = THEMATICS_DIR / name / "global_prompt.md"
    if not path.exists():
        print(f"   ⚠ Thématique '{name}' demandée mais fichier absent : {path.relative_to(ROOT)}")
        return ""
    try:
        text = path.read_text(encoding="utf-8").strip()
        if text:
            print(f"   📚 Thématique '{name}' chargée ({len(text)} car.)")
        return text
    except Exception as e:
        print(f"   ⚠ Erreur lecture thématique '{name}' : {e}")
        return ""


def load_prompts(site_dir: Path, config: dict) -> tuple[str, str]:
    persona = (get_config_value(config, "persona_prompt") or "").strip()
    thematic = get_config_value(config, "thematic")
    if thematic:
        thematic_prompt = _load_thematic_prompt(str(thematic))
        if thematic_prompt:
            return thematic_prompt, persona
        return "", persona
    inline = (get_config_value(config, "blog_global_prompt") or "").strip()
    if inline:
        print(f"   📝 Global prompt inline depuis config.yaml ({len(inline)} car.)")
        return inline, persona
    template_name = None
    page_types = config.get("page_types") or {}
    template_name = page_types.get("classement") or page_types.get("blog") or "classement-saas"
    schema_path = ROOT / "schemas" / f"{template_name}.json"
    global_prompt = ""
    if schema_path.exists():
        try:
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
            global_prompt = (schema.get("global_prompt") or "").strip()
        except Exception:
            pass
    return global_prompt, persona


def generate_meta_description(title: str, content_html: str) -> str:
    plain = re.sub(r'<[^>]+>', ' ', content_html or '')
    plain = re.sub(r'&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;', ' ', plain)
    plain = re.sub(r'\s+', ' ', plain).strip()[:2000]
    system = """Tu es un expert SEO. Tu rédiges des meta descriptions optimisées en français.

CONTRAINTES STRICTES :
- Réponds UNIQUEMENT avec le texte de la meta description, rien d'autre
- Pas de guillemets, pas de préambule, pas de balises
- LONGUEUR IMPÉRATIVE : entre 145 et 160 caractères. CIBLE : 155 CARACTÈRES.
  Google tronque les meta < 120 caractères (mauvais CTR) et > 165 caractères.
  Compte mentalement les caractères avant de répondre, et étoffe si tu es sous 145.
- Style accrocheur, informatif, donne envie de cliquer
- Inclure idéalement le mot-clé principal du titre
- Pas de tiret long — ni –
- Pas de point d'exclamation"""
    base_user = f"Rédige une meta description SEO pour cet article :\n\nTitre : {title}\n\nContenu (extrait) : {plain[:1500]}"
    MIN_LEN = 130
    MAX_LEN = 165
    best_text = ''
    for attempt in range(2):
        user_msg = base_user
        if attempt == 1:
            user_msg = (
                f"{base_user}\n\n"
                f"ATTENTION : ta première réponse faisait seulement {len(best_text)} caractères, "
                f"c'est BEAUCOUP TROP COURT. Rédige cette fois IMPÉRATIVEMENT une meta description "
                f"de 150 à 160 caractères. Étoffe avec un bénéfice client concret, un chiffre clé "
                f"ou un détail spécifique de l'article. Ne descends pas sous 145 caractères."
            )
        try:
            text = call_claude(system, user_msg, max_tokens=200).strip()
            text = text.strip('"\'')
            if len(text) > MAX_LEN:
                text = text[:MAX_LEN - 1].rsplit(' ', 1)[0] + '…'
            best_text = text
            if len(text) >= MIN_LEN:
                return text
            if attempt == 0:
                print(f"meta trop courte ({len(text)} car.), retry...", end=" ", flush=True)
        except Exception as e:
            print(f"   ⚠ Meta auto : erreur Claude ({e})")
            return best_text
    if best_text:
        print(f"(meta finale {len(best_text)} car., sous le seuil {MIN_LEN})", end=" ", flush=True)
    return best_text


def generate_article_html(title: str, categorie: str, prompt_custom: str,
                           global_prompt: str, persona_prompt: str,
                           min_words: int = 750,
                           mots_imposes: list[str] | None = None) -> str:
    max_w = int(min_words * 1.5)
    base_sys = """Tu es un rédacteur SEO expérimenté. Tu écris des articles de blog en français.

CONTRAINTES DE FORMAT (impératif) :
- Réponds UNIQUEMENT avec le contenu HTML de l'article, sans préambule, sans backticks de code fence
- Format HTML simple : <h2>, <h3>, <p>, <strong>, <em>, <ul>/<li>, <ol>/<li>, <blockquote>, <a href="...">
- Pas de titre <h1> (le titre est déjà géré ailleurs)
- Structure : 2-4 sous-titres <h2>, parfois <h3>, paragraphes 3-5 lignes dans des <p>
- Utilise les listes <ul>/<li> quand pertinent
- Pas de tirets longs — ni –, utilise des virgules ou points
- Pas de bullets unicode • ou ·
- Pas de markdown ** _ ## etc. : uniquement du HTML
- Pas de <div>, pas de <span>, pas de classes CSS — du HTML sémantique simple uniquement
- INTERDICTION ABSOLUE de mettre un lien <a href="..."> à l'intérieur d'un titre <h2>, <h3>, <h4>, <h5> ou <h6>. Les titres sont du texte pur. Les liens vont uniquement dans les paragraphes <p>, listes <li>, ou citations <blockquote>.

CONTRAINTES DE PONCTUATION (impératif) :
- Tout titre sous forme de question DOIT se terminer par un point d'interrogation '?'
- En français : espace insécable avant '?' '!' ':' ';' — utilise ' ?' avec un espace simple"""
    layers = [p for p in [persona_prompt, global_prompt, base_sys] if p]
    system = "\n\n".join(layers)
    cat_line = f"\nCatégorie : {categorie}" if categorie else ""
    custom_line = f"\n\nConsignes spécifiques :\n{prompt_custom}" if prompt_custom else ""
    mots_line = ""
    if mots_imposes:
        plain_words = [m['text'] for m in mots_imposes if not m.get('url')]
        linked_words = [m for m in mots_imposes if m.get('url')]
        sections: list[str] = []
        if plain_words:
            fmt = ", ".join(f'« {m} »' for m in plain_words)
            sections.append(
                f"Tu DOIS inclure dans le corps de l'article, au moins une fois chacune "
                f"et de manière naturelle, les expressions suivantes : {fmt}."
            )
        if linked_words:
            fmt = ", ".join(f'« {m["text"]} »' for m in linked_words)
            sections.append(
                f"Tu DOIS également inclure les expressions suivantes au moins une fois "
                f"chacune (elles seront automatiquement transformées en liens vers d'autres "
                f"pages du site lors du build, ne crée donc PAS toi-même les balises "
                f"<a>...</a>) : {fmt}."
            )
        mots_line = (
            f"\n\nMOTS-CLÉS OBLIGATOIRES (impératif) :\n"
            + "\n".join(sections)
            + "\nCes expressions doivent apparaître TELLES QUELLES (même orthographe, "
              "même formulation). Place-les naturellement dans des paragraphes."
        )
    user = (f"Rédige un article de blog complet sur le sujet suivant :\n\n"
            f"Titre : {title}{cat_line}{custom_line}{mots_line}\n\n"
            f"Longueur cible : {min_words} à {max_w} mots (minimum {min_words} mots impératif). "
            f"L'article doit être informatif, structuré, et utile au lecteur cible défini dans ton persona.")
    html = strip_code_fences(call_claude(system, user, max_tokens=min(8000, max(2000, max_w * 4))))
    # Defensive : retirer les liens que Claude aurait pu mettre dans les <hN>
    # malgré l'interdiction explicite dans le prompt. Cas rare mais arrivé.
    html = strip_links_from_headings(html)
    if mots_imposes:
        for m in mots_imposes:
            if m.get('url'):
                html = _wrap_first_occurrence_with_link(html, m['text'], m['url'])
    # Re-strip après les wraps (ceinture + bretelles) — _wrap_first_occurrence
    # skippe déjà les <hN> mais on protège contre un éventuel bug de regex.
    html = strip_links_from_headings(html)
    html = strip_empty_tables(html)   # retire les tableaux vides (bloc noir) générés par l'IA
    return html


def strip_empty_tables(html: str) -> str:
    """Retire les tableaux ENTIÈREMENT vides (cellules vides / <br>), y compris
    mal fermés, générés parfois par l'IA (ils apparaissent en « bloc noir »
    dans l'éditeur et sur le site). Utilise bs4 pour gérer le HTML malformé."""
    if not html or "<table" not in html:
        return html
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        removed = False
        for table in soup.find_all("table"):
            txt = table.get_text(strip=True).replace("\u00a0", "").strip()
            if not txt and not table.find(["img", "iframe"]):
                table.decompose()
                removed = True
        return str(soup) if removed else html
    except Exception:
        return html


DEFAULT_ANCHOR_MAX = 5


def _parse_anchors_csv(raw: str) -> list[dict]:
    import re as _re
    out = []
    for line in _re.split(r'[\n;]', raw or ''):
        s = line.strip()
        if not s:
            continue
        m = _re.match(r'^(.*?)[:\s]\s*(?:x\s*)?(\d+)\s*$', s, _re.IGNORECASE)
        if m:
            text = m.group(1).strip().rstrip(':').strip()
            n = int(m.group(2))
            if text and n > 0:
                out.append({'text': text, 'max': n})
        elif s:
            out.append({'text': s, 'max': DEFAULT_ANCHOR_MAX})
    return out


def _parse_mots_imposes_csv(raw: str) -> list[dict]:
    if not raw:
        return []
    out: list[dict] = []
    for part in re.split(r'[,;\n]', raw):
        s = part.strip()
        if not s:
            continue
        if '=>' in s:
            text, _, url = s.partition('=>')
            text = text.strip()
            url = url.strip()
            if text:
                entry = {'text': text}
                if url:
                    entry['url'] = url
                out.append(entry)
        else:
            out.append({'text': s})
    return out


def _wrap_first_occurrence_with_link(html: str, text: str, url: str) -> str:
    """Wrap la PREMIÈRE occurrence de `text` dans `html` avec un <a href="url">.
    Skippe les blocs où on ne veut surtout pas de lien :
      - <a>...</a> existants (évite les liens imbriqués, invalides en HTML)
      - <h1>...</h6> (un titre ne doit pas contenir de lien : mauvais SEO,
        mauvaise UX, et casse la hiérarchie sémantique du document)
    """
    if not text or not url:
        return html
    pattern = re.compile(r'\b' + re.escape(text) + r'\b', re.IGNORECASE)
    # Split sur les zones intouchables : <a>...</a> et <hN>...</hN>
    parts = re.split(
        r'(<a\b[^>]*>.*?</a>|<h[1-6]\b[^>]*>.*?</h[1-6]>)',
        html, flags=re.IGNORECASE | re.DOTALL,
    )
    done = False
    out: list[str] = []
    for p in parts:
        is_skip = bool(re.match(r'<(a|h[1-6])\b', p, re.IGNORECASE))
        if not done and not is_skip:
            new_p, n = pattern.subn(
                lambda m: f'<a href="{url}">{m.group(0)}</a>',
                p, count=1,
            )
            out.append(new_p)
            if n > 0:
                done = True
        else:
            out.append(p)
    return ''.join(out)


def strip_links_from_headings(html: str) -> str:
    """Retire les balises <a> à l'intérieur des titres <h1> à <h6>, en
    gardant uniquement le texte. Un titre ne doit pas contenir de lien :
      - Mauvais pour le SEO (Google interprète le titre comme l'ancre du lien)
      - Mauvais UX (un titre cliquable est ambigü)
      - Brise la hiérarchie sémantique (l'utilisateur s'attend à un titre
        descriptif, pas à une CTA)

    Defensive : appelée après génération Claude (au cas où le modèle aurait
    quand même mis un lien dans un titre malgré le prompt) ET après tout
    post-traitement qui ajoute des liens (maillage interne, etc).

    Exemple :
        <h2>Notre avis sur <a href="/qonto">Qonto</a> en 2026</h2>
        → <h2>Notre avis sur Qonto en 2026</h2>
    """
    def clean_heading(m: re.Match) -> str:
        full = m.group(0)
        # Retirer les <a ...>...</a>, garder le texte (group 1 du sous-regex)
        return re.sub(
            r'<a\b[^>]*>(.*?)</a>',
            r'\1',
            full,
            flags=re.IGNORECASE | re.DOTALL,
        )
    return re.sub(
        r'<h[1-6]\b[^>]*>.*?</h[1-6]>',
        clean_heading,
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )


# ─── Sérialisation .md (frontmatter YAML + body) ─────────────────────────

def write_post(filepath: Path, fm: dict, body: str) -> None:
    fm_yaml = yaml.dump(fm, allow_unicode=True, default_flow_style=False,
                         sort_keys=False, width=10000).strip()
    content = f"---\n{fm_yaml}\n---\n\n{body}\n"
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_text(content, encoding="utf-8")


def _normalize_title(t: str) -> str:
    return " ".join(str(t or "").lower().split())


# ─── Substitution de placeholders {Month}, {year}, etc. ──────────────────
# Les titres de la sheet contiennent souvent des placeholders évolutifs
# comme "Parrainage Qonto {Month} {year} : 160€ offerts". Ces placeholders
# doivent être substitués AVANT :
#   1. Le passage à Claude (sinon Claude génère du texte avec {Month})
#   2. L'écriture du .md (sinon la sidebar/listing affiche {Month} brut)
# La date de référence est `pub_dt` (date de publication de l'article).

MOIS_FR_FULL = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"
]


def substitute_placeholders(text: str, dt: datetime) -> str:
    """Substitue les placeholders {Month}, {month}, {year}, {YEAR}, etc.
    par la valeur correspondant à la date `dt`. Retourne le texte modifié.

    Placeholders supportés (case-sensitive) :
      - {year}  / {YEAR}   → "2026"
      - {Month}            → "Juin" (capitalisé)
      - {month}            → "juin" (lowercase)
      - {MONTH}            → "JUIN" (uppercase)
      - {month_num}        → "06" (zero-padded)
    """
    if not text or "{" not in text:
        return text
    mois = MOIS_FR_FULL[dt.month - 1]
    repl = {
        "{year}": str(dt.year),
        "{YEAR}": str(dt.year),
        "{Year}": str(dt.year),
        "{Month}": mois.capitalize(),
        "{month}": mois,
        "{MONTH}": mois.upper(),
        "{month_num}": f"{dt.month:02d}",
    }
    out = text
    for k, v in repl.items():
        if k in out:
            out = out.replace(k, v)
    return out


# ─── Index JSON pré-calculé pour le dashboard ─────────────────────────────
# À chaque article généré, on met à jour `<site_dir>/blog/posts-index.json`
# avec tous les posts (publiés + brouillons). Le dashboard lit ce SEUL
# fichier au lieu de 122 .md → temps de chargement divisé par ~50, et plus
# de saturation du rate limit GitHub. Aligné avec generate.py qui régénère
# aussi cet index au build.
def _serialize_post_for_index(p) -> dict:
    """Convertit un post blog_engine en dict minimaliste pour l'index JSON."""
    def g(attr, default=None):
        if hasattr(p, attr):
            v = getattr(p, attr, default)
        elif isinstance(p, dict):
            v = p.get(attr, default)
        else:
            v = default
        if hasattr(v, 'isoformat'):
            return v.isoformat()
        return v

    excerpt = g('excerpt') or g('meta_description') or ''
    if excerpt and len(excerpt) > 250:
        excerpt = excerpt[:247] + '...'

    return {
        "title": g('title') or '',
        "slug": g('slug') or '',
        "date": g('date') or '',
        "status": g('status') or 'published',
        "categorie": g('categorie') or g('category') or '',
        "excerpt": excerpt,
        "featured_image": g('featured_image') or '',
        "meta_description": g('meta_description') or '',
        "min_words": g('min_words') or 0,
    }


def _update_posts_index_safe(site_dir: Path) -> None:
    """Régénère `<site_dir>/blog/posts-index.json`. Silencieux en cas d'erreur
    (l'échec d'index n'empêche pas la publication d'un article — on log juste
    un warning et on continue). Import blog_engine en local pour gérer les
    setups où il n'est pas dispo."""
    blog_dir = site_dir / "blog"
    posts_dir = blog_dir / "posts"
    if not posts_dir.exists():
        return
    try:
        import sys as _sys
        scripts_dir = Path(__file__).parent
        if str(scripts_dir) not in _sys.path:
            _sys.path.insert(0, str(scripts_dir))
        import blog_engine as _blog_engine
        posts = _blog_engine.load_all_posts(site_dir, include_drafts=True)
    except Exception as e:
        print(f"   ⚠ posts-index : load_all_posts a échoué ({e}) — index non mis à jour")
        return

    index_path = blog_dir / "posts-index.json"
    payload = {
        "updated_at": datetime.now().isoformat(),
        "count": len(posts),
        "posts": [_serialize_post_for_index(p) for p in posts],
    }
    try:
        index_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
    except Exception as e:
        print(f"   ⚠ posts-index : écriture échouée ({e})")


def _save_processed(processed_file: Path, processed: list) -> None:
    """Save incrémental du tracker `schedule_processed.json`.

    Appelé après CHAQUE article généré pour persister l'avancement intra-run.
    Si le script crash entre 2 articles, le fichier sur disque reflète l'état
    correct et le prochain run reprendra à l'article suivant.

    Note : le fichier vit sur le runner GitHub Actions. Le commit + push est
    fait par le workflow appelant en fin de run. Si le run crash AVANT le
    commit, le fichier (et les .md générés) sont perdus avec le runner — le
    prochain run regénèrera ces articles. Coût acceptable car borné par
    MAX_ARTICLES_PER_RUN."""
    processed_file.parent.mkdir(parents=True, exist_ok=True)
    processed_file.write_text(
        json.dumps(processed, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def sync_metadata_from_sheet(posts_dir: Path, rows: list[dict]) -> int:
    if not posts_dir.exists() or not rows:
        return 0
    md_by_title: dict[str, tuple[Path, dict, str]] = {}
    for md_path in posts_dir.glob('*.md'):
        try:
            raw = md_path.read_text(encoding='utf-8')
            if not raw.startswith('---'):
                continue
            end_idx = raw.find('---', 3)
            if end_idx < 0:
                continue
            fm_text = raw[3:end_idx]
            fm = yaml.safe_load(fm_text) or {}
            if not isinstance(fm, dict):
                continue
            title = (fm.get('title') or '').strip()
            if not title:
                continue
            body = raw[end_idx + 3:].lstrip('\n')
            md_by_title[_normalize_title(title)] = (md_path, fm, body)
        except Exception:
            continue
    n_synced = 0
    for row in rows:
        title = (row.get('titre') or '').strip()
        if not title:
            continue
        key = _normalize_title(title)
        if key not in md_by_title:
            continue
        md_path, fm, body = md_by_title[key]
        changed = False
        new_anchors_raw = (row.get('link_anchors') or row.get('ancres') or '').strip()
        new_anchors = _parse_anchors_csv(new_anchors_raw) if new_anchors_raw else []
        old_anchors = fm.get('link_anchors') or []
        if new_anchors != old_anchors:
            if new_anchors:
                fm['link_anchors'] = new_anchors
            elif 'link_anchors' in fm:
                del fm['link_anchors']
            changed = True
        new_cat = (row.get('categorie') or '').strip()
        if new_cat and fm.get('categorie') != new_cat:
            fm['categorie'] = new_cat
            changed = True
        new_meta_desc = (row.get('meta_description') or '').strip()
        if new_meta_desc and fm.get('meta_description') != new_meta_desc:
            fm['meta_description'] = new_meta_desc
            changed = True
        new_meta_title = (row.get('meta_title') or '').strip()
        if new_meta_title and fm.get('meta_title') != new_meta_title:
            fm['meta_title'] = new_meta_title
            changed = True
        if changed:
            write_post(md_path, fm, body)
            n_synced += 1
            print(f"   🔄 Métadonnées resynchronisées : {title[:60]}")
    return n_synced


# ─── Traitement d'un site ────────────────────────────────────────────────

def _extract_site_colors(config: dict) -> tuple[str, str, str]:
    theme = config.get("theme") or {}
    primary = theme.get("accent") or theme.get("primary") or "#1E5F8B"
    secondary = theme.get("accent2") or theme.get("secondary") or "#FFB200"
    cta = theme.get("cta_color") or config.get("cta_color") or "#FF6B35"
    return primary, secondary, cta


def process_site(site_id: str, site_dir: Path, config: dict,
                 remaining_quota: int = 999) -> int:
    """Traite un site. Génère AU PLUS `remaining_quota` articles (limite globale
    passée par main()). Retourne (n_generated, n_synced).

    Si remaining_quota <= 0 en entrée, le site est skip silencieusement (la
    limite globale est déjà atteinte sur un site précédent)."""
    if remaining_quota <= 0:
        return 0

    blog_sheet_url = (get_config_value(config, "blog_sheet_csv_url") or "").strip()
    if not blog_sheet_url:
        return 0

    print(f"\n📰 {site_id} — sheet : {blog_sheet_url[:80]}...")
    rows = fetch_csv(blog_sheet_url)
    if not rows:
        print("   (sheet vide ou inaccessible)")
        return 0
    print(f"   {len(rows)} ligne(s) dans la sheet")

    slug_format = _resolve_slug_format(config)
    use_prefix = (slug_format == "prefix")
    if not use_prefix:
        print(f"   📐 Format slug : 'clean' (URLs propres, sans préfixe numérique)")

    posts_dir = site_dir / "blog" / "posts"
    processed_file = site_dir / "blog" / "schedule_processed.json"
    processed_file.parent.mkdir(parents=True, exist_ok=True)
    try:
        processed = json.loads(processed_file.read_text(encoding="utf-8")) if processed_file.exists() else []
    except Exception:
        processed = []
    processed_set = set(processed)

    # ── Blacklist : titres d'articles SUPPRIMÉS à ne jamais republier ────────
    # La sheet reste la source du programmé ; supprimer un .md ne l'en retire
    # pas, donc le cron le republierait. On tient une liste de titres supprimés
    # (alimentée par la suppression dashboard + le script groupé) que le cron
    # ignore. Fichier : blog/schedule_blacklist.json (liste de titres normalisés).
    blacklist_file = site_dir / "blog" / "schedule_blacklist.json"
    try:
        _bl = json.loads(blacklist_file.read_text(encoding="utf-8")) if blacklist_file.exists() else []
    except Exception:
        _bl = []
    blacklist_set = {_normalize_title(t) for t in _bl if t}

    existing_slugs = {p.stem for p in posts_dir.glob("*.md")} if posts_dir.exists() else set()
    existing_titles_normalized: set[str] = set()
    if posts_dir.exists():
        for md_path in posts_dir.glob("*.md"):
            try:
                content = md_path.read_text(encoding="utf-8")
                if content.startswith("---"):
                    end = content.find("---", 3)
                    if end > 0:
                        fm_text = content[3:end]
                        for line in fm_text.splitlines():
                            if line.lstrip().startswith("title:"):
                                t = line.split(":", 1)[1].strip()
                                if t.startswith(("'", '"')) and t.endswith(t[0]) and len(t) >= 2:
                                    t = t[1:-1].replace("''", "'") if t[0] == "'" else t.replace('\\"', '"').replace('\\\\', '\\')
                                existing_titles_normalized.add(" ".join(t.lower().split()))
                                break
            except Exception:
                continue
    now = datetime.now(PARIS)
    _force_titles = {
        t.strip().lower()
        for t in (os.environ.get("FORCE_TITLES") or "").split("|")
        if t.strip()
    }
    if _force_titles:
        print(f"   ⚡ Mode force activé : {len(_force_titles)} titre(s) à publier immédiatement")

    global_prompt, persona_prompt = load_prompts(site_dir, config)
    new_count = 0
    quota_hit = False  # flag pour log de fin

    for row in rows:
        # ── Garde-fou quota global atteint ───────────────────────────────
        if new_count >= remaining_quota:
            quota_hit = True
            break

        title = row.get("titre", "").strip()
        if not title:
            continue
        is_forced = title.lower() in _force_titles
        if _force_titles and not is_forced:
            continue
        date_str = row.get("date_publication", "").strip()

        # ── 3 cas possibles : forcé / brouillon / programmé ─────────────
        is_draft = is_draft_marker(date_str)
        if is_draft:
            # Marqueur de brouillon (ex: "draft", "brouillon"). On génère
            # l'article quand même mais avec status: draft → invisible sur
            # le site live. Julien le validera ensuite manuellement.
            pub_dt = now
            key = f"{title}__DRAFT"
            article_status = "draft"
        elif is_forced or not date_str:
            pub_dt = now
            key = f"{title}__{'FORCED' if is_forced else 'IMMEDIATE'}"
            article_status = "published"
        else:
            pub_dt = parse_pub_datetime(date_str, row.get("heure_publication", "09:00"))
            if pub_dt is None:
                print(f"   ⚠ Date invalide pour '{title[:40]}' : {date_str}")
                continue
            if pub_dt > now:
                continue
            key = f"{title}__{date_str}"
            article_status = "published"

        if key in processed_set:
            continue

        # ── Substituer les placeholders {Month}, {year}, etc. ──────────
        # Effectué APRÈS calcul de pub_dt (pour avoir la date de référence)
        # mais AVANT toute autre opération sur title (slugify, dédup, prompt).
        # Du coup le titre est cohérent partout : .md, sidebar, OG, Claude.
        title = substitute_placeholders(title, pub_dt)

        title_normalized = " ".join(title.lower().split())
        if title_normalized in blacklist_set:
            print(f"   🚫 '{title[:50]}' supprimé (blacklist) — non republié")
            continue
        if title_normalized in existing_titles_normalized:
            print(f"   ⏭ '{title[:50]}' déjà publié (titre existant) — ajout au registre")
            processed_set.add(key)
            processed.append(key)
            # Save incrémental même pour cet ajout (évite redétection inutile au prochain run)
            _save_processed(processed_file, processed)
            continue

        manual_slug = row.get("slug", "").strip()
        slug = assign_slug(slugify(manual_slug or title), existing_slugs, use_prefix=use_prefix)

        min_words = 750
        try:
            v = (row.get("nombre_mots_minimum") or row.get("min_words") or "").strip()
            if v:
                min_words = max(300, min(3000, int(v)))
        except (TypeError, ValueError):
            pass
        link_anchors_raw = (row.get("link_anchors") or row.get("ancres") or "").strip()

        mots_imposes_raw = (
            row.get("mots_imposes")
            or row.get("mots_cles") or row.get("mots-cles") or row.get("mots_clés")
            or row.get("keywords") or ""
        ).strip()
        mots_imposes = _parse_mots_imposes_csv(mots_imposes_raw)

        categorie = row.get("categorie", "").strip()
        prompt_custom = substitute_placeholders(row.get("prompt_custom", "").strip(), pub_dt)
        nb_link = sum(1 for m in mots_imposes if m.get('url'))
        mots_log = ""
        if mots_imposes:
            mots_log = f" + {len(mots_imposes)} mots imposés"
            if nb_link:
                mots_log += f" ({nb_link} avec lien)"
        # Préfixe spécifique pour les brouillons → log clair dans le runner
        draft_log = " 📝 BROUILLON" if is_draft else ""
        print(f"   🤖 Génération{draft_log} '{title[:50]}' (min {min_words} mots{mots_log})...", end=" ", flush=True)
        try:
            html = generate_article_html(title, categorie, prompt_custom, global_prompt, persona_prompt,
                                          min_words=min_words, mots_imposes=mots_imposes)
            if not html or len(html) < 100:
                print("⚠ contenu suspect, skip")
                continue
        except Exception as e:
            print(f"❌ {e}")
            continue
        print("✓")

        featured_image_rel: str | None = None
        if generate_featured_image is not None:
            primary, secondary, cta = _extract_site_colors(config)
            site_name = (config.get("site") or {}).get("name", "") or site_id
            print(f"   🎨 Génération image (low quality)...", end=" ", flush=True)
            jpg_bytes = generate_featured_image(
                site_name=site_name,
                primary_color=primary,
                secondary_color=secondary,
                cta_color=cta,
                article_title=title,
            )
            if jpg_bytes:
                img_dir = site_dir / "public" / "blog"
                img_dir.mkdir(parents=True, exist_ok=True)
                img_path = img_dir / f"{slug}.jpg"
                img_path.write_bytes(jpg_bytes)
                featured_image_rel = f"/blog/{slug}.jpg"
                print(f"✓ ({len(jpg_bytes) // 1024} KB)")
            else:
                print("⚠ (sans image)")

        meta_desc_raw = substitute_placeholders(row.get("meta_description", "").strip(), pub_dt)
        if not meta_desc_raw:
            print(f"   ✨ Génération meta description...", end=" ", flush=True)
            meta_desc_raw = generate_meta_description(title, html)
            print("✓" if meta_desc_raw else "(vide)")

        fm = {
            "title": title,
            "slug": slug,
            "date": pub_dt.replace(microsecond=0).isoformat(),
            "categorie": categorie,
            "meta_title": substitute_placeholders(row.get("meta_title", "").strip(), pub_dt) or title,
            "meta_description": meta_desc_raw,
            "min_words": min_words,
            "status": article_status,   # "draft" si marqueur brouillon dans la sheet, sinon "published"
        }
        if featured_image_rel:
            fm["featured_image"] = featured_image_rel
        if link_anchors_raw:
            anchors_parsed = _parse_anchors_csv(link_anchors_raw)
            if anchors_parsed:
                fm["link_anchors"] = anchors_parsed
        write_post(posts_dir / f"{slug}.md", fm, html)
        existing_slugs.add(slug)
        existing_titles_normalized.add(title_normalized)  # évite un doublon si le même titre revient dans le même run
        processed.append(key)
        processed_set.add(key)
        new_count += 1

        # ── SAVE INCRÉMENTAL après CHAQUE article ────────────────────────
        # Le fichier processed.json est sauvegardé après chaque succès.
        # Si le script crash sur l'article suivant, on garde la trace de
        # ceux déjà générés → pas de re-génération coûteuse au prochain run.
        # (Le fichier .md est déjà écrit ci-dessus par write_post.)
        _save_processed(processed_file, processed)
        # Update posts-index.json (1 requête GitHub au lieu de N pour le
        # dashboard). Permet de voir immédiatement les nouveaux articles
        # dans le HUB sans attendre le prochain build complet du site.
        _update_posts_index_safe(site_dir)

    if new_count > 0:
        print(f"   ✅ {new_count} article(s) publié(s)")
        if quota_hit:
            print(f"   ⏸ Quota global atteint ({remaining_quota}) — reste de la sheet reporté au prochain run")
    else:
        print("   (aucun nouvel article à publier)")

    n_synced = 0
    try:
        n_synced = sync_metadata_from_sheet(posts_dir, rows)
        if n_synced > 0:
            print(f"   🔄 {n_synced} article(s) avec métadonnées mises à jour depuis la sheet")
    except Exception as e:
        print(f"   ⚠ Sync metadata : erreur {e}")

    return new_count + n_synced


# ─── Main ────────────────────────────────────────────────────────────────

def main():
    print("🚀 Blog cron — publication des articles programmés")
    print(f"   Maintenant : {datetime.now(PARIS).isoformat()}")
    print(f"   Limite globale : {MAX_ARTICLES_PER_RUN} articles par run "
          f"(override via MAX_ARTICLES_PER_RUN)")

    sites_processed: list[str] = []
    total_generated = 0

    for site_dir in sorted(SITES_DIR.iterdir()):
        if not site_dir.is_dir() or site_dir.name.startswith("_"):
            continue
        config_path = site_dir / "config.yaml"
        if not config_path.exists():
            continue
        try:
            config = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
        except Exception as e:
            print(f"   ⚠ Erreur config {site_dir.name} : {e}")
            continue

        # Quota restant pour ce site = limite globale - déjà générés
        remaining = MAX_ARTICLES_PER_RUN - total_generated
        if remaining <= 0:
            # Limite globale atteinte. On skip mais on log clairement pour
            # voir dans l'UI GitHub Actions quels sites n'ont pas été traités.
            print(f"\n⏸ {site_dir.name} skip — quota global déjà atteint ({MAX_ARTICLES_PER_RUN})")
            continue

        n = process_site(site_dir.name, site_dir, config, remaining_quota=remaining)
        # `n` inclut les sync de métadonnées (sans génération Claude). Pour le
        # compteur quota, on prend min(n, remaining) — borne supérieure mais
        # toujours bornée, et c'est juste un compteur de safety, pas critique.
        total_generated += max(0, min(n, remaining))
        if n > 0:
            sites_processed.append(site_dir.name)

    print("\n=== Résumé ===")
    print(f"   Articles générés ce run : {total_generated} / {MAX_ARTICLES_PER_RUN} (limite)")
    if sites_processed:
        print(f"✅ Sites avec nouveaux articles : {', '.join(sites_processed)}")
        gh_output = os.environ.get("GITHUB_OUTPUT", "")
        if gh_output:
            with open(gh_output, "a", encoding="utf-8") as f:
                f.write(f"sites_to_deploy={','.join(sites_processed)}\n")
                f.write(f"new_articles_count={total_generated}\n")
    else:
        print("ℹ Aucun nouvel article à publier sur l'ensemble des sites")
        gh_output = os.environ.get("GITHUB_OUTPUT", "")
        if gh_output:
            with open(gh_output, "a", encoding="utf-8") as f:
                f.write("sites_to_deploy=\n")
                f.write("new_articles_count=0\n")


if __name__ == "__main__":
    main()
