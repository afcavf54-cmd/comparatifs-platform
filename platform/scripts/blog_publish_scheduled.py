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
    """Parse 'YYYY-MM-DD' + 'HH:MM' → datetime. Tolère les formats divers."""
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
    for fmt in ("%H:%M:%S", "%H:%M", "%Hh%M", "%H h %M"):
        try:
            t = datetime.strptime(ts, fmt).time()
            return d.replace(hour=t.hour, minute=t.minute, second=t.second)
        except ValueError:
            continue
    return d.replace(hour=9)


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
                           min_words: int = 750) -> str:
    """Génère le contenu HTML d'un article via Claude (mêmes contraintes que la route /generate)."""
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
- Pas de <div>, pas de <span>, pas de classes CSS — du HTML sémantique simple uniquement"""

    layers = [p for p in [persona_prompt, global_prompt, base_sys] if p]
    system = "\n\n".join(layers)

    cat_line = f"\nCatégorie : {categorie}" if categorie else ""
    custom_line = f"\n\nConsignes spécifiques :\n{prompt_custom}" if prompt_custom else ""
    user = (f"Rédige un article de blog complet sur le sujet suivant :\n\n"
            f"Titre : {title}{cat_line}{custom_line}\n\n"
            f"Longueur cible : {min_words} à {max_w} mots (minimum {min_words} mots impératif). "
            f"L'article doit être informatif, structuré, et utile au lecteur cible défini dans ton persona.")

    return strip_code_fences(call_claude(system, user, max_tokens=min(8000, max(2000, max_w * 4))))


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


# ─── Sérialisation .md (frontmatter YAML + body) ─────────────────────────

def write_post(filepath: Path, fm: dict, body: str) -> None:
    """Écrit un fichier .md avec frontmatter YAML."""
    fm_yaml = yaml.dump(fm, allow_unicode=True, default_flow_style=False, sort_keys=False).strip()
    content = f"---\n{fm_yaml}\n---\n\n{body}\n"
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_text(content, encoding="utf-8")


# ─── Traitement d'un site ────────────────────────────────────────────────

def process_site(site_id: str, site_dir: Path, config: dict) -> int:
    blog_sheet_url = (config.get("blog_sheet_csv_url") or "").strip()
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
    now = datetime.now()

    global_prompt, persona_prompt = load_prompts(site_dir, config)
    new_count = 0

    for row in rows:
        title = row.get("titre", "").strip()
        if not title:
            continue
        date_str = row.get("date_publication", "").strip()
        # Si date vide → publication immédiate (= maintenant).
        # Si date remplie + future → on attend.
        # Si date remplie + passée → on publie maintenant.
        if not date_str:
            pub_dt = now
            key = f"{title}__IMMEDIATE"
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

        # Génération IA
        categorie = row.get("categorie", "").strip()
        prompt_custom = row.get("prompt_custom", "").strip()
        print(f"   🤖 Génération '{title[:50]}' (min {min_words} mots)...", end=" ", flush=True)
        try:
            html = generate_article_html(title, categorie, prompt_custom, global_prompt, persona_prompt, min_words=min_words)
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
            "date": pub_dt.isoformat(),
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
    return new_count


# ─── Main ────────────────────────────────────────────────────────────────

def main():
    print("🚀 Blog cron — publication des articles programmés")
    print(f"   Maintenant : {datetime.now().isoformat()}")

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
