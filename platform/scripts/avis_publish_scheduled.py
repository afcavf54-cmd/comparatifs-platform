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
                        depuis d'autres articles — format "ancre1:5;ancre2:3")
    mots_imposes       (optionnel, mots/expressions obligatoires DANS cet
                        article — séparés par virgule ou point-virgule. Favorise
                        le maillage entrant : ces mots seront détectés comme
                        ancres par d'autres articles qui en parlent.)
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

# Toutes les comparaisons de date/heure du script utilisent Europe/Paris pour
# que les heures de publication tapées dans la sheet (en heure de Paris)
# correspondent à ce que voit Julien, indépendamment du timezone du serveur
# GitHub Actions (UTC par défaut).
PARIS = ZoneInfo("Europe/Paris")
from pathlib import Path

import yaml

ROOT = Path(__file__).parent.parent
SITES_DIR = ROOT / "sites"

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = "claude-sonnet-4-20250514"


# ─── Helpers ──────────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    s = unicodedata.normalize("NFD", str(text or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s.lower())
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "article"


def add_random_prefix(slug: str, existing: set[str]) -> str:
    if re.match(r"^\d{3,5}-", slug):
        return slug
    import random
    for _ in range(30):
        candidate = f"{random.randint(1000, 9999)}-{slug}"
        if candidate not in existing:
            return candidate
    return f"{int(time.time()) % 10000:04d}-{slug}"


def fetch_csv(url: str) -> list[dict]:
    """Télécharge un CSV public et le parse en liste de dicts. Tolère les erreurs réseau.

    Auto-correction de l'URL : Google Sheets publie soit en /pubhtml (page web)
    soit en /pub?output=csv (CSV brut). On force vers le format CSV si l'URL
    est sous la forme /pubhtml."""
    if not url:
        return []
    # /pubhtml → /pub?output=csv
    if '/pubhtml' in url:
        url = re.sub(r'/pubhtml(\?[^#]*)?(#.*)?$', '/pub?output=csv', url)
        print(f"   ℹ URL normalisée → {url[:80]}...")
    # Si /pub sans output=csv, on l'ajoute
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
        # Nettoie les clés (espaces, BOM)
        rows.append({(k or "").strip(): (v or "").strip() for k, v in row.items() if k})
    return rows


def parse_pub_datetime(date_str: str, time_str: str = "09:00") -> datetime | None:
    """Parse 'YYYY-MM-DD' + 'HH:MM' → datetime aware en Europe/Paris.

    L'heure tapée par l'utilisateur dans la sheet est en heure de Paris.
    On retourne une datetime aware pour que la comparaison avec `datetime.now(PARIS)`
    soit correcte indépendamment du timezone du serveur GitHub Actions.
    """
    if not date_str:
        return None
    # Date
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            d = datetime.strptime(date_str.strip(), fmt)
            break
        except ValueError:
            continue
    else:
        return None
    # Heure
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
    # On rend la datetime aware Paris (gère automatiquement CET/CEST)
    return d.replace(hour=hour, minute=minute, second=second, tzinfo=PARIS)


def call_claude(system: str, user: str, retries: int = 3, max_tokens: int = 4000) -> str:
    """Appelle l'API Anthropic et retourne la réponse texte. Retry avec backoff sur erreurs réseau."""
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY manquante")

    body = json.dumps({
        "model": CLAUDE_MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
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
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
            return text
        except Exception as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep([5, 15, 30][attempt])
    raise RuntimeError(f"Claude API a échoué après {retries} tentatives : {last_err}")


def strip_code_fences(text: str) -> str:
    """Supprime les ```html...``` éventuels que l'IA peut ajouter."""
    text = re.sub(r"^```(?:html|HTML|markdown|md)?\s*\n?", "", text.strip())
    text = re.sub(r"\n?\s*```\s*$", "", text)
    return text.strip()


# ─── Génération d'un article ─────────────────────────────────────────────

def load_prompts(site_dir: Path, config: dict) -> tuple[str, str]:
    """Récupère global_prompt (depuis le schema) et persona_prompt (depuis config.yaml)."""
    persona = (config.get("persona_prompt") or "").strip()
    template_name = None
    page_types = config.get("page_types") or {}
    template_name = page_types.get("classement") or page_types.get("blog")
    if not template_name:
        # Fallback : on cherche un schema correspondant au type de site
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
    """Génère une meta description SEO (~150-160 caractères) via Claude à partir
    du titre + contenu d'un article. Utilisé par le cron quand la cellule
    meta_description de la sheet est vide.

    Logique identique à la route /generate-meta du dashboard."""
    # Strip HTML pour donner du texte propre à l'IA
    plain = re.sub(r'<[^>]+>', ' ', content_html or '')
    plain = re.sub(r'&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;', ' ', plain)
    plain = re.sub(r'\s+', ' ', plain).strip()[:2000]

    system = """Tu es un expert SEO. Tu rédiges des meta descriptions optimisées en français.

CONTRAINTES STRICTES :
- Réponds UNIQUEMENT avec le texte de la meta description, rien d'autre
- Pas de guillemets, pas de préambule, pas de balises
- Longueur : 140 à 160 caractères (idéal pour Google)
- Style accrocheur, informatif, donne envie de cliquer
- Inclure idéalement le mot-clé principal du titre
- Pas de tiret long — ni –
- Pas de point d'exclamation"""

    user = f"Rédige une meta description SEO pour cet article :\n\nTitre : {title}\n\nContenu (extrait) : {plain[:1500]}"

    try:
        text = call_claude(system, user, max_tokens=200).strip()
        text = text.strip('"\'')
        if len(text) > 165:
            text = text[:162].rsplit(' ', 1)[0] + '…'
        return text
    except Exception as e:
        print(f"   ⚠ Meta auto : erreur Claude ({e}) — meta laissée vide")
        return ''


def generate_article_html(title: str, categorie: str, prompt_custom: str,
                           global_prompt: str, persona_prompt: str,
                           min_words: int = 750,
                           mots_imposes: list[str] | None = None) -> str:
    """Génère le contenu HTML d'un article via Claude (mêmes contraintes que la route /generate).

    Si `mots_imposes` est fourni, les expressions y figurant doivent apparaître
    au moins une fois dans le corps de l'article (utilisé pour le maillage
    interne : les mots correspondent aux `link_anchors` d'autres articles du
    blog, qui pourront ainsi être linkés automatiquement vers eux au build).
    """
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
        # mots_imposes est une liste de dicts {text, url?}. On présente à l'IA
        # uniquement le TEXTE des mots (l'URL est appliquée en post-process via
        # _wrap_first_occurrence_with_link, pour éviter que l'IA hallucine ou
        # casse la syntaxe HTML autour du lien).
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

    # ── Post-processing : insertion des liens pour les mots avec URL ────────
    # On wrappe la 1ère occurrence de chaque texte dans un <a href="url">. Cela
    # garantit que les liens sont posés même si l'IA a oublié de placer le mot
    # à un endroit linkable, ou a essayé de poser un <a> elle-même au mauvais
    # endroit. La case originale est préservée dans le lien.
    if mots_imposes:
        for m in mots_imposes:
            if m.get('url'):
                html = _wrap_first_occurrence_with_link(html, m['text'], m['url'])

    return html


def _parse_anchors_csv(raw: str) -> list[dict]:
    """Parse une chaîne 'pappers:5;plateforme pappers:5;le site pappers:3' en
    liste de {text, max}. Sépare sur ';' ou newline. Tolère 'ancre x 5' aussi."""
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
            out.append({'text': s, 'max': 1})
    return out


def _parse_mots_imposes_csv(raw: str) -> list[dict]:
    """Parse la colonne `mots_imposes`. Chaque entrée est :
      - soit un simple mot/expression : « logiciel de paie »
      - soit avec un lien interne : « logiciel de gestion des talents=>https://www.editions-dp.com/meilleur-logiciel-de-gestion-des-talents »

    Le séparateur entre entrées est `;`, `,` ou retour à la ligne.
    Le séparateur texte ↔ URL est `=>`.

    Renvoie une liste de dicts [{text, url?}, ...]. `url` est absent si l'entrée
    était un simple mot sans flèche. Si l'URL contient des virgules (rare), il
    faut utiliser `;` comme séparateur d'entrées.
    """
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
    """Wrappe la PREMIÈRE occurrence (case-insensitive, word-boundary) de `text`
    dans un <a href="url">…</a>. La casse originale du texte est préservée dans
    le lien. Skip les segments déjà à l'intérieur d'un <a>...</a> existant pour
    éviter les imbrications de liens (interdites en HTML).
    Si aucune occurrence n'est trouvée, retourne le HTML inchangé.
    """
    if not text or not url:
        return html
    pattern = re.compile(r'\b' + re.escape(text) + r'\b', re.IGNORECASE)
    # On découpe sur les <a>...</a> existants ; les sous-segments hors <a>
    # sont les seuls candidats au remplacement
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
    """Écrit un fichier .md avec frontmatter YAML.

    `width=10000` force PyYAML à NE PAS wrapper les chaînes longues sur
    plusieurs lignes. Sans ça, un titre de 80+ caractères avec des caractères
    spéciaux (':', '?') est écrit sur 2 lignes en single-quoted, ce que les
    parsers naïfs (côté dashboard TS) ne savent pas reconstituer → titre
    apparait tronqué dans l'éditeur avec une apostrophe orpheline en début.
    """
    fm_yaml = yaml.dump(fm, allow_unicode=True, default_flow_style=False,
                         sort_keys=False, width=10000).strip()
    content = f"---\n{fm_yaml}\n---\n\n{body}\n"
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_text(content, encoding="utf-8")


def _normalize_title(t: str) -> str:
    """Normalise un titre pour matching insensible à la casse et aux espaces."""
    return " ".join(str(t or "").lower().split())


def sync_metadata_from_sheet(posts_dir: Path, rows: list[dict]) -> int:
    """Pour chaque ligne de la sheet, met à jour les métadonnées de l'article
    correspondant (.md déjà publié) sans toucher au contenu.

    Champs synchronisés depuis la sheet :
        - link_anchors        (ancres acceptant cet article comme cible)
        - categorie           (au cas où Julien la corrige)
        - meta_description    (si remplie dans la sheet)
        - meta_title          (idem)

    Permet d'optimiser le maillage interne après publication : ajouter des
    link_anchors sur d'anciens articles depuis la sheet est désormais pris
    en compte au prochain build du site.

    Retourne le nombre d'articles dont le frontmatter a changé.
    """
    if not posts_dir.exists() or not rows:
        return 0

    # Index titre normalisé → (filepath, frontmatter_dict, body)
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
            continue  # Pas encore publié
        md_path, fm, body = md_by_title[key]
        changed = False

        # 1. link_anchors : convertir le format CSV de la sheet vers le format
        # YAML stocké dans le frontmatter (liste de dicts {text, max}).
        new_anchors_raw = (row.get('link_anchors') or row.get('ancres') or '').strip()
        new_anchors = _parse_anchors_csv(new_anchors_raw) if new_anchors_raw else []
        old_anchors = fm.get('link_anchors') or []
        # Comparaison structurelle (les listes de dicts doivent être identiques)
        if new_anchors != old_anchors:
            if new_anchors:
                fm['link_anchors'] = new_anchors
            elif 'link_anchors' in fm:
                # Sheet a vidé la valeur → on retire la clé
                del fm['link_anchors']
            changed = True

        # 2. categorie
        new_cat = (row.get('categorie') or '').strip()
        if new_cat and fm.get('categorie') != new_cat:
            fm['categorie'] = new_cat
            changed = True

        # 3. meta_description (n'écrase pas si vide dans la sheet, pour ne pas
        # perdre une description générée auto précédemment)
        new_meta_desc = (row.get('meta_description') or '').strip()
        if new_meta_desc and fm.get('meta_description') != new_meta_desc:
            fm['meta_description'] = new_meta_desc
            changed = True

        # 4. meta_title
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

def get_config_value(config: dict, key: str):
    """Cherche une clé dans le YAML : top-level OU imbriquée 1 niveau dans
    une section dict. Tolérance utile car `blog_sheet_csv_url` peut être
    placée par le dashboard soit au top-level, soit dans `site:`, soit
    accidentellement dans une autre section selon l'historique d'édition."""
    if key in config:
        return config[key]
    for k, v in (config or {}).items():
        if isinstance(v, dict) and key in v:
            return v[key]
    return None


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

    posts_dir = site_dir / "blog" / "posts"
    processed_file = site_dir / "blog" / "schedule_processed.json"
    processed_file.parent.mkdir(parents=True, exist_ok=True)
    try:
        processed = json.loads(processed_file.read_text(encoding="utf-8")) if processed_file.exists() else []
    except Exception:
        processed = []
    processed_set = set(processed)

    existing_slugs = {p.stem for p in posts_dir.glob("*.md")} if posts_dir.exists() else set()
    # Titres normalisés des articles déjà publiés (lus depuis le frontmatter
    # de chaque .md). Sert de filet de sécurité contre les doublons quand un
    # article a été publié manuellement (dashboard) sans passer par le cron.
    existing_titles_normalized: set[str] = set()
    if posts_dir.exists():
        for md_path in posts_dir.glob("*.md"):
            try:
                content = md_path.read_text(encoding="utf-8")
                # Frontmatter YAML entre --- au début du fichier
                if content.startswith("---"):
                    end = content.find("---", 3)
                    if end > 0:
                        fm_text = content[3:end]
                        for line in fm_text.splitlines():
                            if line.lstrip().startswith("title:"):
                                t = line.split(":", 1)[1].strip()
                                # Strip quotes YAML
                                if t.startswith(("'", '"')) and t.endswith(t[0]) and len(t) >= 2:
                                    t = t[1:-1].replace("''", "'") if t[0] == "'" else t.replace('\\"', '"').replace('\\\\', '\\')
                                existing_titles_normalized.add(" ".join(t.lower().split()))
                                break
            except Exception:
                continue
    now = datetime.now(PARIS)
    # Titres dont on force la publication immédiate (séparés par '|').
    # Set en lowercase pour matcher case-insensitive avec le titre de la sheet.
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
        # FORCE_TITLES (env, séparés par '|') = liste des titres dont on force la
        # publication immédiate, en ignorant la date programmée. Utilisé par le
        # bouton "🚀 Publier maintenant" du dashboard pour publier un article
        # avant l'heure prévue.
        is_forced = title.lower() in _force_titles
        date_str = row.get("date_publication", "").strip()
        # Si forcé OU date vide → publication immédiate (= maintenant).
        # Si date remplie + future → on attend (sauf si forcé).
        # Si date remplie + passée → on publie maintenant.
        if is_forced or not date_str:
            pub_dt = now
            key = f"{title}__{'FORCED' if is_forced else 'IMMEDIATE'}"
        else:
            pub_dt = parse_pub_datetime(date_str, row.get("heure_publication", "09:00"))
            if pub_dt is None:
                print(f"   ⚠ Date invalide pour '{title[:40]}' : {date_str}")
                continue
            if pub_dt > now:
                continue  # Pas encore le moment
            key = f"{title}__{date_str}"

        # Clé unique = titre + date (idempotence : la même ligne n'est pas re-traitée)
        # Pour les lignes sans date, on utilise le suffixe IMMEDIATE → la même
        # ligne ne sera traitée qu'une seule fois, peu importe le nombre de
        # vérifications cron. Pour re-publier le même titre, changer le titre.
        if key in processed_set:
            continue

        # Filet de sécurité supplémentaire : si un article avec EXACTEMENT le
        # même titre existe déjà parmi les .md du site, on considère comme déjà
        # publié (cas typique : article publié à la main via le dashboard, donc
        # absent du schedule_processed.json mais présent dans blog/posts/).
        # On normalise pour matcher case-insensitive avec espaces collapsés.
        title_normalized = " ".join(title.lower().split())
        if title_normalized in existing_titles_normalized:
            print(f"   ⏭ '{title[:50]}' déjà publié (titre existant) — ajout au registre")
            processed_set.add(key)
            processed.append(key)
            continue

        # Slug
        manual_slug = row.get("slug", "").strip()
        slug = add_random_prefix(slugify(manual_slug or title), existing_slugs)

        # Paramètres optionnels du CSV
        min_words = 750
        try:
            v = (row.get("nombre_mots_minimum") or row.get("min_words") or "").strip()
            if v:
                min_words = max(300, min(3000, int(v)))
        except (TypeError, ValueError):
            pass
        link_anchors_raw = (row.get("link_anchors") or row.get("ancres") or "").strip()

        # Mots imposés dans l'article (pour favoriser le maillage interne).
        # Colonne optionnelle, séparée par virgule, point-virgule ou retour ligne.
        # Aliases acceptés : mots_imposes, mots_cles, mots-cles, mots_clés, keywords.
        # Format pris en charge :
        #   - « mot simple »             → l'IA inclut l'expression telle quelle
        #   - « mot=>https://url »       → idem + post-process pose un lien interne
        #                                  sur la 1ère occurrence vers l'URL fournie.
        # Exemple : "logiciel de paie; logiciel de gestion des talents=>https://www.editions-dp.com/meilleur-logiciel-de-gestion-des-talents"
        mots_imposes_raw = (
            row.get("mots_imposes")
            or row.get("mots_cles") or row.get("mots-cles") or row.get("mots_clés")
            or row.get("keywords") or ""
        ).strip()
        mots_imposes = _parse_mots_imposes_csv(mots_imposes_raw)

        # Génération IA
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

        # Écriture du .md
        # Meta description : si vide dans la sheet → on appelle Claude pour
        # en générer une à partir du contenu fraîchement généré
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
        # Ancres de maillage interne : format CSV "pappers:5;plateforme:3"
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

    # Synchronisation des métadonnées des articles déjà publiés depuis la sheet
    # (link_anchors, categorie, meta_description, meta_title). Permet de modifier
    # ces champs sur d'anciens articles via la sheet sans avoir à re-générer
    # leur contenu. Le commit final capture les .md modifiés via git add.
    n_synced = 0
    try:
        n_synced = sync_metadata_from_sheet(posts_dir, rows)
        if n_synced > 0:
            print(f"   🔄 {n_synced} article(s) avec métadonnées mises à jour depuis la sheet")
    except Exception as e:
        print(f"   ⚠ Sync metadata : erreur {e}")

    # On retourne new_count + n_synced pour que le workflow déclenche un
    # redéploiement même si seuls des metadata ont changé (besoin de rebuild
    # pour que le maillage interne mis à jour soit reflété sur le site).
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

    # Output pour le workflow GitHub Actions
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
