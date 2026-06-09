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

Format attendu du CSV (colonnes) :
    titre              (obligatoire)
    categorie          (obligatoire)
    prompt_custom      (optionnel)
    date_publication   (obligatoire, format YYYY-MM-DD)
    heure_publication  (optionnel, format HH:MM, défaut 09:00)
    slug               (optionnel, dérivé du titre sinon)
    meta_title         (optionnel)
    meta_description   (optionnel)
    nombre_mots_minimum  (optionnel, défaut 750, plage 300-3000)
    link_anchors       (optionnel, ancres acceptant cet article comme cible
                        depuis d'autres articles — format "ancre1:5;ancre2:3".
                        Si pas de nombre après l'ancre, défaut = 5.)
    mots_imposes       (optionnel, mots/expressions obligatoires DANS cet
                        article — séparés par virgule ou point-virgule. Favorise
                        le maillage entrant : ces mots seront détectés comme
                        ancres par d'autres articles qui en parlent.)

Format de slug (configurable au niveau du site, depuis juin 2026) :
    Un paramètre `blog_slug_format` peut être posé soit au top-level du
    config.yaml, soit dans `site:`. Valeurs :
      - "prefix" (DÉFAUT) : ajoute un préfixe XXXX- (4 chiffres aléatoires)
                             → /3847-mon-article/. Comportement historique.
      - "clean"           : pas de préfixe numérique → /mon-article/.
                             En cas de collision, suffixe -2, -3, ...
    Utiliser "clean" pour migrer un site existant et préserver les URLs
    (ex. site WordPress en migration).

Global prompt — résolution multi-source (depuis juin 2026, ordre de priorité) :
    1. `thematic: <nom>` dans config.yaml :
        → charge platform/thematics/<nom>/global_prompt.md
        Pour réutiliser un même prompt global sur plusieurs sites de même
        thématique (ex: tous les sites "cadeau" partagent le même prompt).
    2. `blog_global_prompt: |...` inline dans config.yaml :
        → utilise directement le texte multiligne du config
        Pour un override one-off sans créer de fichier thématique.
    3. Fallback historique (schema classement-saas.json ou page_types.classement)
        → comportement actuel. Maintenu pour rétro-compat des sites existants.
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

# Génération d'image à la une via OpenAI gpt-image-1 (optionnel : si le module
# ou OPENAI_API_KEY est absent, on continue sans image).
try:
    sys.path.insert(0, str(Path(__file__).parent))
    from _image_generator import generate_featured_image  # type: ignore
except Exception:
    generate_featured_image = None  # type: ignore

ROOT = Path(__file__).parent.parent
SITES_DIR = ROOT / "sites"
THEMATICS_DIR = ROOT / "thematics"

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = "claude-sonnet-4-20250514"


# ─── Helpers ──────────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    s = unicodedata.normalize("NFD", str(text or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s.lower())
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "article"


def assign_slug(slug: str, existing: set[str], use_prefix: bool = True) -> str:
    """Résout un slug final unique selon le format choisi.

    Args:
        slug: slug "propre" déjà passé par slugify() (ex: "mon-article")
        existing: ensemble des slugs déjà utilisés sur ce site (collisions)
        use_prefix: si True (défaut historique), ajoute un préfixe numérique
                    aléatoire XXXX- (4 chiffres entre 1000 et 9999).
                    Si False, garde le slug tel quel et suffixe -2/-3/...
                    en cas de collision.

    Returns:
        Slug final unique à utiliser pour ce post.

    Pourquoi 2 modes ?
      - Mode "prefix" : historique du système. Évite à ~99,99% les collisions
        sans calcul, masque l'ordre de création, ressemble à un routing par ID.
        URLs : /3847-mon-article/.
      - Mode "clean" : pour migrer un site WordPress vers ce système en
        gardant exactement les anciennes URLs (continuité SEO).
        URLs : /mon-article/. À activer via config.yaml > blog_slug_format = "clean".
    """
    # ── Mode "clean" : slug propre, suffixage seulement si conflit
    if not use_prefix:
        if slug not in existing:
            return slug
        # Collision : essayer -2, -3, ... jusqu'à 999
        for i in range(2, 1000):
            candidate = f"{slug}-{i}"
            if candidate not in existing:
                print(f"   ⚠ Slug '{slug}' déjà pris, utilisation de '{candidate}'")
                return candidate
        # Très improbable : 999 collisions sur le même slug. Fallback timestamp.
        return f"{slug}-{int(time.time())}"

    # ── Mode "prefix" (historique) : préfixe XXXX- aléatoire
    if re.match(r"^\d{3,5}-", slug):
        # Slug fourni manuellement avec un préfixe numérique déjà conforme
        # (ex: "1234-mon-article") → on le garde tel quel.
        return slug
    import random
    for _ in range(30):
        candidate = f"{random.randint(1000, 9999)}-{slug}"
        if candidate not in existing:
            return candidate
    # Très improbable : 30 essais infructueux. Fallback timestamp.
    return f"{int(time.time()) % 10000:04d}-{slug}"


# Alias rétro-compat : si du code externe utilisait l'ancien nom
# `add_random_prefix(slug, existing)`, il continue de fonctionner.
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
    parsed_time = False
    for fmt in ("%H:%M:%S", "%H:%M", "%Hh%M", "%H h %M"):
        try:
            t = datetime.strptime(ts, fmt).time()
            hour, minute, second = t.hour, t.minute, t.second
            parsed_time = True
            break
        except ValueError:
            continue
    return d.replace(hour=hour, minute=minute, second=second, tzinfo=PARIS)


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


# ─── Helpers config ──────────────────────────────────────────────────────

def get_config_value(config: dict, key: str):
    """Cherche `key` au top-level du config.yaml, puis dans toutes ses
    sub-sections (typiquement `site:`). Retourne None si introuvable."""
    if key in config:
        return config[key]
    for k, v in (config or {}).items():
        if isinstance(v, dict) and key in v:
            return v[key]
    return None


def _resolve_slug_format(config: dict) -> str:
    """Lit `blog_slug_format` du config.yaml (top-level OU section `site:`).
    Valeurs acceptées : 'prefix' (défaut historique), 'clean' (sans préfixe).
    Toute autre valeur est traitée comme 'prefix' avec un warning.
    """
    raw = (get_config_value(config, "blog_slug_format") or "").strip().lower()
    if not raw:
        return "prefix"  # défaut historique : compatibilité totale avec les sites existants
    if raw not in ("prefix", "clean"):
        print(f"   ⚠ blog_slug_format={raw!r} non reconnu (valeurs : 'prefix'|'clean') — fallback 'prefix'")
        return "prefix"
    return raw


# ─── Génération d'un article ─────────────────────────────────────────────

def _load_thematic_prompt(thematic: str) -> str:
    """Charge le prompt global depuis platform/thematics/<thematic>/global_prompt.md.

    Le dossier `thematics/` est la base de l'architecture multi-thématiques :
    chaque thématique a son propre sous-dossier qui pourra à terme contenir
    d'autres fichiers (vocab.yaml, schema_org.yaml, etc.). Pour l'instant on
    n'utilise QUE global_prompt.md, qui contient les consignes éditoriales
    spécifiques à la thématique (style, ton, structure type, mots à éviter,
    angles à privilégier, etc.).

    Retourne '' si la thématique n'existe pas (avec un warning logué) ou si
    le fichier est vide/illisible. Le caller décide du fallback.
    """
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
    """Résout le couple (global_prompt, persona_prompt) pour ce site.

    Le persona est toujours lu depuis `persona_prompt` (top-level ou `site:`).

    Le global est résolu dans cet ordre de priorité (premier hit gagne) :
      1. `thematic: <nom>` → platform/thematics/<nom>/global_prompt.md
         Cas d'usage : plusieurs sites de même thématique partagent ce prompt
         (ex: cadeauclic.com + autres sites cadeau utilisent thematic=cadeau).
      2. `blog_global_prompt: |...` inline dans config.yaml
         Cas d'usage : override one-off sans créer de fichier thématique.
      3. Fallback historique : schema classement-saas.json (ou page_types.*)
         Cas d'usage : sites existants pré-thématique, pas de changement de
         comportement pour eux.

    Si l'utilisateur définit `thematic:` ET `blog_global_prompt:`, le thematic
    gagne (intentionnel : le fichier centralisé est plus fiable que le yaml
    inline qui peut être désynchronisé entre sites).
    """
    persona = (get_config_value(config, "persona_prompt") or "").strip()

    # ── Source 1 : thematic défini → charge depuis platform/thematics/
    thematic = get_config_value(config, "thematic")
    if thematic:
        thematic_prompt = _load_thematic_prompt(str(thematic))
        if thematic_prompt:
            return thematic_prompt, persona
        # Si thematic défini mais fichier absent/vide → on ne fallback PAS
        # silencieusement sur le schema SaaS (ça serait surprenant pour
        # l'utilisateur). On retourne un global_prompt vide, le persona
        # et le base_sys de generate_article_html suffiront.
        return "", persona

    # ── Source 2 : blog_global_prompt inline dans config
    inline = (get_config_value(config, "blog_global_prompt") or "").strip()
    if inline:
        print(f"   📝 Global prompt inline depuis config.yaml ({len(inline)} car.)")
        return inline, persona

    # ── Source 3 : fallback historique (schema-based)
    template_name = None
    page_types = config.get("page_types") or {}
    template_name = page_types.get("classement") or page_types.get("blog")
    if not template_name:
        template_name = "classement-saas"
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
    """Génère une meta description SEO de 145-160 caractères via Claude.

    Stratégie :
      1. Tentative initiale avec consigne stricte (145-160 caractères)
      2. Si la réponse est < 130 car. (Google tronque les meta trop courtes
         et ça réduit le CTR), retry une fois avec consigne renforcée qui
         rappelle à Claude le nombre exact de caractères trop court
      3. Si toujours < 130 après retry, on garde quand même (mieux qu'une
         meta vide) mais on logue un warning.

    Tronque à MAX_LEN-1 + '…' si > 165 caractères.
    """
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

CONTRAINTES DE PONCTUATION (impératif) :
- Tout titre sous forme de question DOIT se terminer par un point d'interrogation '?'
  (titres commençant par : Comment, Pourquoi, Que, Quel, Quelle, Quels, Quelles, Qui, Où,
  Quand, Combien, Est-ce que, Faut-il, Doit-on, Peut-on, etc.)
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

    if mots_imposes:
        for m in mots_imposes:
            if m.get('url'):
                html = _wrap_first_occurrence_with_link(html, m['text'], m['url'])

    return html


# Quota par défaut quand l'utilisateur n'a pas mis de chiffre après l'ancre
# dans la colonne `link_anchors` de la sheet. Auparavant : 1 (un seul lien
# entrant max par ancre). Désormais : 5 pour favoriser un maillage interne
# plus dense par défaut.
DEFAULT_ANCHOR_MAX = 5


def _parse_anchors_csv(raw: str) -> list[dict]:
    """Parse une chaîne 'pappers:5;plateforme pappers:5;le site pappers:3' en
    liste de {text, max}. Sépare sur ';' ou newline. Tolère 'ancre x 5' aussi.

    Si pas de chiffre après l'ancre, on applique DEFAULT_ANCHOR_MAX (= 5) au
    lieu de 1, pour éviter qu'un oubli côté sheet ne limite trop le maillage."""
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
    if not text or not url:
        return html
    pattern = re.compile(r'\b' + re.escape(text) + r'\b', re.IGNORECASE)
    parts = re.split(r'(<a\b[^>]*>.*?</a>)', html, flags=re.IGNORECASE | re.DOTALL)
    done = False
    out: list[str] = []
    for p in parts:
        is_anchor = p.lower().startswith('<a')
        if not done and not is_anchor:
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


# ─── Sérialisation .md (frontmatter YAML + body) ─────────────────────────

def write_post(filepath: Path, fm: dict, body: str) -> None:
    fm_yaml = yaml.dump(fm, allow_unicode=True, default_flow_style=False,
                         sort_keys=False, width=10000).strip()
    content = f"---\n{fm_yaml}\n---\n\n{body}\n"
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_text(content, encoding="utf-8")


def _normalize_title(t: str) -> str:
    return " ".join(str(t or "").lower().split())


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
    """Extrait (primary, secondary, cta) du theme du config.yaml avec
    fallbacks raisonnables. Utilisé pour le prompt de génération d'image
    afin que chaque image respecte la charte du site."""
    theme = config.get("theme") or {}
    primary = (
        theme.get("accent")
        or theme.get("primary")
        or "#1E5F8B"
    )
    secondary = (
        theme.get("accent2")
        or theme.get("secondary")
        or "#FFB200"
    )
    cta = (
        theme.get("cta_color")
        or config.get("cta_color")
        or "#FF6B35"
    )
    return primary, secondary, cta


def process_site(site_id: str, site_dir: Path, config: dict) -> int:
    blog_sheet_url = (get_config_value(config, "blog_sheet_csv_url") or "").strip()
    if not blog_sheet_url:
        return 0

    print(f"\n📰 {site_id} — sheet : {blog_sheet_url[:80]}...")
    rows = fetch_csv(blog_sheet_url)
    if not rows:
        print("   (sheet vide ou inaccessible)")
        return 0
    print(f"   {len(rows)} ligne(s) dans la sheet")

    # ── Format de slug pour ce site (cf. config.yaml > blog_slug_format) ──
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

    for row in rows:
        title = row.get("titre", "").strip()
        if not title:
            continue
        is_forced = title.lower() in _force_titles
        if _force_titles and not is_forced:
            continue
        date_str = row.get("date_publication", "").strip()
        if is_forced or not date_str:
            pub_dt = now
            key = f"{title}__{'FORCED' if is_forced else 'IMMEDIATE'}"
        else:
            pub_dt = parse_pub_datetime(date_str, row.get("heure_publication", "09:00"))
            if pub_dt is None:
                print(f"   ⚠ Date invalide pour '{title[:40]}' : {date_str}")
                continue
            if pub_dt > now:
                continue
            key = f"{title}__{date_str}"

        if key in processed_set:
            continue

        title_normalized = " ".join(title.lower().split())
        if title_normalized in existing_titles_normalized:
            print(f"   ⏭ '{title[:50]}' déjà publié (titre existant) — ajout au registre")
            processed_set.add(key)
            processed.append(key)
            continue

        manual_slug = row.get("slug", "").strip()
        # On slugifie quand même si manual_slug fourni (normalise accents,
        # espaces, caractères spéciaux), puis on applique le format choisi.
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
        prompt_custom = row.get("prompt_custom", "").strip()
        nb_link = sum(1 for m in mots_imposes if m.get('url'))
        mots_log = ""
        if mots_imposes:
            mots_log = f" + {len(mots_imposes)} mots imposés"
            if nb_link:
                mots_log += f" ({nb_link} avec lien)"
        print(f"   🤖 Génération '{title[:50]}' (min {min_words} mots{mots_log})...", end=" ", flush=True)
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

        # ── Génération de l'image à la une via OpenAI ───────────────────
        # On la fait ICI (avant la meta) car en cas d'échec image on garde
        # quand même l'article. featured_image vaut None si OPENAI_API_KEY
        # est absente, si l'API plante, ou si le module image n'est pas
        # importable (cf. try/except en haut du fichier).
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
                # Pattern : /blog/<slug>.jpg directement à la racine de
                # public/blog/. Plus court, plus SEO-friendly que l'ancien
                # public/blog/<slug>/featured.jpg.
                img_dir = site_dir / "public" / "blog"
                img_dir.mkdir(parents=True, exist_ok=True)
                img_path = img_dir / f"{slug}.jpg"
                img_path.write_bytes(jpg_bytes)
                featured_image_rel = f"/blog/{slug}.jpg"
                print(f"✓ ({len(jpg_bytes) // 1024} KB)")
            else:
                print("⚠ (sans image)")

        meta_desc_raw = row.get("meta_description", "").strip()
        if not meta_desc_raw:
            print(f"   ✨ Génération meta description...", end=" ", flush=True)
            meta_desc_raw = generate_meta_description(title, html)
            print("✓" if meta_desc_raw else "(vide)")

        fm = {
            "title": title,
            "slug": slug,
            "date": pub_dt.replace(microsecond=0).isoformat(),
            "categorie": categorie,
            "meta_title": row.get("meta_title", "").strip() or title,
            "meta_description": meta_desc_raw,
            "min_words": min_words,
            "status": "published",
        }
        if featured_image_rel:
            fm["featured_image"] = featured_image_rel
        if link_anchors_raw:
            anchors_parsed = _parse_anchors_csv(link_anchors_raw)
            if anchors_parsed:
                fm["link_anchors"] = anchors_parsed
        write_post(posts_dir / f"{slug}.md", fm, html)
        existing_slugs.add(slug)
        processed.append(key)
        processed_set.add(key)
        new_count += 1

    if new_count > 0:
        processed_file.write_text(
            json.dumps(processed, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"   ✅ {new_count} article(s) publié(s)")
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

    sites_processed: list[str] = []
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
        n = process_site(site_dir.name, site_dir, config)
        if n > 0:
            sites_processed.append(site_dir.name)

    print("\n=== Résumé ===")
    if sites_processed:
        print(f"✅ Sites avec nouveaux articles : {', '.join(sites_processed)}")
        gh_output = os.environ.get("GITHUB_OUTPUT", "")
        if gh_output:
            with open(gh_output, "a", encoding="utf-8") as f:
                f.write(f"sites_to_deploy={','.join(sites_processed)}\n")
                f.write(f"new_articles_count={sum(1 for _ in sites_processed)}\n")
    else:
        print("ℹ Aucun nouvel article à publier sur l'ensemble des sites")
        gh_output = os.environ.get("GITHUB_OUTPUT", "")
        if gh_output:
            with open(gh_output, "a", encoding="utf-8") as f:
                f.write("sites_to_deploy=\n")
                f.write("new_articles_count=0\n")


if __name__ == "__main__":
    main()
