"""
blog_engine.py — Moteur de blog pour la plateforme comparatifs.

Format article :
    platform/sites/<site>/blog/posts/<slug>.md
    ──────────────────────────────────────────
    ---
    title: "Mon titre"
    slug: "1542-mon-titre"          # préfixe numérique unique
    date: "2026-05-15T09:00:00"
    categorie: "Paie"
    meta_title: "Mon titre - Site"
    meta_description: "..."
    featured_image: "/blog/1542-mon-titre/cover.jpg"
    related_posts: ["...", "...", "...", "..."]   # figé à la 1re génération
    status: "published"                            # published | scheduled | draft
    ---

    # Contenu markdown
    ...

Format images :
    platform/sites/<site>/public/blog/<slug>/<image>.jpg
"""
from __future__ import annotations
import os
import re
import json
import random
import datetime as _dt
from pathlib import Path


# ═══════════════════════════════════════════════════════════════════════════
# PARSING
# ═══════════════════════════════════════════════════════════════════════════

def parse_post(filepath: Path) -> dict | None:
    """Lit un fichier .md, retourne {frontmatter..., content_md, content_html, filepath}.
    Retourne None si parse échoue ou si frontmatter manquant."""
    try:
        raw = filepath.read_text(encoding='utf-8')
    except Exception:
        return None

    # Frontmatter YAML entre --- ... ---
    m = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)$', raw, re.DOTALL)
    if not m:
        return None
    fm_text, body = m.group(1), m.group(2)

    # Parse le frontmatter (pyyaml requis dans l'env)
    try:
        import yaml
        fm = yaml.safe_load(fm_text) or {}
    except Exception:
        return None

    if not isinstance(fm, dict):
        return None

    post = dict(fm)
    post['content_md'] = body.strip()
    post['content_html'] = md_to_html_blog(body.strip())
    post['filepath'] = str(filepath)
    # Dérivés
    post['date_obj'] = _parse_date(post.get('date', ''))
    return post


def _parse_date(date_str: str | _dt.datetime) -> _dt.datetime:
    """Tolère '2026-05-15', '2026-05-15T09:00', '2026-05-15T09:00:00', objet datetime, ou vide."""
    if isinstance(date_str, _dt.datetime):
        return date_str
    if isinstance(date_str, _dt.date):
        return _dt.datetime.combine(date_str, _dt.time.min)
    s = str(date_str or '').strip()
    if not s:
        return _dt.datetime.min
    for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M', '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%d %H:%M', '%Y-%m-%d'):
        try:
            return _dt.datetime.strptime(s, fmt)
        except ValueError:
            continue
    return _dt.datetime.min


def load_all_posts(site_dir: Path, include_drafts: bool = False) -> list[dict]:
    """Charge tous les .md de blog/posts/, retourne liste triée par date desc.
    Filtre les drafts et scheduled futurs (sauf si include_drafts=True)."""
    posts_dir = site_dir / 'blog' / 'posts'
    if not posts_dir.exists():
        return []
    now = _dt.datetime.now()
    posts = []
    for fp in posts_dir.glob('*.md'):
        post = parse_post(fp)
        if not post:
            continue
        status = (post.get('status') or 'published').lower()
        # Filtre statut
        if not include_drafts:
            if status == 'draft':
                continue
            if status == 'scheduled' and post['date_obj'] > now:
                continue
        posts.append(post)
    posts.sort(key=lambda p: p['date_obj'], reverse=True)
    return posts


# ═══════════════════════════════════════════════════════════════════════════
# SLUGS & URLS
# ═══════════════════════════════════════════════════════════════════════════

_SLUG_PREFIX_RE = re.compile(r'^\d{3,5}-')


def slugify(text: str) -> str:
    """Slug propre français : minuscules, sans accents, tirets."""
    import unicodedata
    s = unicodedata.normalize('NFD', str(text))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", '-', s)
    s = re.sub(r'-+', '-', s).strip('-')
    return s or 'article'


def add_random_prefix(slug: str, existing_slugs: set[str] | None = None) -> str:
    """Ajoute un préfixe 4-digit aléatoire au slug si pas déjà présent.
    Évite les collisions avec les slugs existants passés en argument."""
    if _SLUG_PREFIX_RE.match(slug):
        return slug  # Déjà préfixé
    existing = existing_slugs or set()
    base = slug
    for _ in range(20):
        prefix = f"{random.randint(1000, 9999)}"
        candidate = f"{prefix}-{base}"
        if candidate not in existing:
            return candidate
    # Fallback ultra-improbable : timestamp
    return f"{int(_dt.datetime.now().timestamp()) % 10000:04d}-{base}"


def categorie_slug(name: str) -> str:
    """Slug pour les pages catégorie : /categorie-<slug>. Évite collision avec
    les pages classement (/meilleur-X) et articles (/NNNN-X)."""
    return f"categorie-{slugify(name)}"


# ═══════════════════════════════════════════════════════════════════════════
# MAILLAGE INTERNE (4 articles de la même catégorie, figés une fois)
# ═══════════════════════════════════════════════════════════════════════════

def compute_related_posts(post: dict, all_posts: list[dict], n: int = 4) -> list[dict]:
    """Si post.related_posts est déjà rempli dans le frontmatter, on l'utilise
    tel quel (figé). Sinon, on pick n articles aléatoires de la même catégorie,
    on les écrit dans le frontmatter (fichier .md mis à jour), et on retourne."""
    cat = (post.get('categorie') or '').strip().lower()
    if not cat:
        return []
    same_slug = post.get('slug', '')
    candidates = [p for p in all_posts
                  if (p.get('categorie') or '').strip().lower() == cat
                  and p.get('slug', '') != same_slug]

    # Si déjà figé dans le frontmatter, on résout les slugs
    stored = post.get('related_posts') or []
    if stored and len(stored) >= min(n, len(candidates)):
        slug_to_post = {p.get('slug', ''): p for p in candidates}
        related = [slug_to_post[s] for s in stored if s in slug_to_post]
        if len(related) >= min(n, len(candidates)):
            return related[:n]

    # Sinon, on pick aléatoirement et on persiste dans le fichier .md
    pick = random.sample(candidates, min(n, len(candidates)))
    related_slugs = [p.get('slug', '') for p in pick]
    _persist_related_in_frontmatter(Path(post['filepath']), related_slugs)
    return pick


def _persist_related_in_frontmatter(filepath: Path, related_slugs: list[str]) -> None:
    """Réécrit le frontmatter du .md en ajoutant/remplaçant related_posts."""
    try:
        raw = filepath.read_text(encoding='utf-8')
        m = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)$', raw, re.DOTALL)
        if not m:
            return
        fm_text, body = m.group(1), m.group(2)
        import yaml
        fm = yaml.safe_load(fm_text) or {}
        fm['related_posts'] = related_slugs
        new_fm = yaml.dump(fm, allow_unicode=True, default_flow_style=False, sort_keys=False).strip()
        filepath.write_text(f"---\n{new_fm}\n---\n{body}", encoding='utf-8')
    except Exception:
        pass  # Si échec, on continue sans persister — pas de blocage du build


# ═══════════════════════════════════════════════════════════════════════════
# MARKDOWN → HTML (couvre plus de cas que le md_to_html du générateur SCPI)
# ═══════════════════════════════════════════════════════════════════════════

def md_to_html_blog(md: str) -> str:
    """Convertisseur markdown → HTML pour le blog.
    Couvre : titres #/##/###, paragraphes, **bold**, *italic*, [liens](url),
    ![images](url), listes - et *, listes numérotées, code inline `x`, citations >.

    Détection HTML : si le contenu contient déjà des balises HTML structurelles
    (<p>, <h1>-<h6>, <ul>, <ol>, <img>, etc.), on assume que c'est du HTML
    produit par le RichEditor du dashboard et on le passe tel quel. Évite
    la double conversion qui mangerait les balises."""
    if not md:
        return ''
    if re.search(r'<(p|h[1-6]|ul|ol|div|img|blockquote|figure)\b', md, re.I):
        return md
    text = md

    # Images : ![alt](url)   ← AVANT les liens (qui matchent aussi [alt](url))
    text = re.sub(r'!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)',
                  lambda m: f'<img src="{m.group(2)}" alt="{m.group(1)}"'
                            + (f' title="{m.group(3)}"' if m.group(3) else '')
                            + ' loading="lazy">', text)

    # Liens : [texte](url)
    text = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)',
                  r'<a href="\2">\1</a>', text)

    # Bold + italic dans le texte (avant la conversion en lignes)
    text = re.sub(r'\*\*([^*\n]+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'(?<!\*)\*([^*\n]+?)\*(?!\*)', r'<em>\1</em>', text)
    text = re.sub(r'`([^`\n]+?)`', r'<code>\1</code>', text)

    # Block-level : on travaille ligne par ligne
    lines = text.split('\n')
    out = []
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        # Titres
        if line.startswith('### '):
            out.append(f'<h3>{line[4:].strip()}</h3>'); i += 1; continue
        if line.startswith('## '):
            out.append(f'<h2>{line[3:].strip()}</h2>'); i += 1; continue
        if line.startswith('# '):
            out.append(f'<h1>{line[2:].strip()}</h1>'); i += 1; continue
        # Liste non-ordonnée
        if re.match(r'^[-*]\s+', line):
            items = []
            while i < len(lines) and re.match(r'^[-*]\s+', lines[i].rstrip()):
                items.append(re.sub(r'^[-*]\s+', '', lines[i].rstrip()))
                i += 1
            out.append('<ul>' + ''.join(f'<li>{it}</li>' for it in items) + '</ul>')
            continue
        # Liste ordonnée
        if re.match(r'^\d+\.\s+', line):
            items = []
            while i < len(lines) and re.match(r'^\d+\.\s+', lines[i].rstrip()):
                items.append(re.sub(r'^\d+\.\s+', '', lines[i].rstrip()))
                i += 1
            out.append('<ol>' + ''.join(f'<li>{it}</li>' for it in items) + '</ol>')
            continue
        # Citation
        if line.startswith('> '):
            out.append(f'<blockquote>{line[2:].strip()}</blockquote>'); i += 1; continue
        # Ligne vide → séparateur
        if not line:
            i += 1; continue
        # Paragraphe : aggrège lignes consécutives non-vides non-spéciales
        para = [line]
        i += 1
        while i < len(lines):
            nxt = lines[i].rstrip()
            if not nxt: break
            if (nxt.startswith('#') or nxt.startswith('>') or
                re.match(r'^[-*]\s+', nxt) or re.match(r'^\d+\.\s+', nxt)):
                break
            para.append(nxt); i += 1
        # Si le paragraphe ne contient qu'une balise HTML autonome, on n'ajoute pas <p>
        joined = ' '.join(para).strip()
        if joined.startswith('<') and joined.endswith('>') and ('img' in joined[:8] or 'iframe' in joined[:10]):
            out.append(joined)
        else:
            out.append(f'<p>{joined}</p>')
    return '\n'.join(out)


# ═══════════════════════════════════════════════════════════════════════════
# EXCERPT (pour la page index)
# ═══════════════════════════════════════════════════════════════════════════

def excerpt_from_md(md: str, max_chars: int = 180) -> str:
    """Génère un extrait à partir du markdown OU du HTML : strip syntaxe et balises.
    Détecte les deux formats car les nouveaux articles produits par le RichEditor
    du dashboard sont stockés en HTML, tandis que les articles legacy sont en markdown."""
    if not md:
        return ''
    text = md
    # Strip HTML : balises + entités courantes
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&rsquo;|&lsquo;|&ldquo;|&rdquo;', ' ', text)
    # Strip syntaxe markdown : images, liens → texte, marqueurs
    text = re.sub(r'!\[[^\]]*\]\([^)]+\)', '', text)         # images
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)     # liens → texte
    text = re.sub(r'[*_`#>~]+', '', text)                    # syntaxe restante
    text = re.sub(r'\s+', ' ', text).strip()
    if len(text) > max_chars:
        text = text[:max_chars].rsplit(' ', 1)[0] + '…'
    return text


# ═══════════════════════════════════════════════════════════════════════════
# CATÉGORIES
# ═══════════════════════════════════════════════════════════════════════════

def collect_categories(posts: list[dict]) -> list[dict]:
    """Retourne la liste des catégories distinctes avec leur compte d'articles."""
    cats: dict[str, dict] = {}
    for p in posts:
        cat_name = (p.get('categorie') or '').strip()
        if not cat_name:
            continue
        key = cat_name.lower()
        if key not in cats:
            cats[key] = {'name': cat_name, 'slug': categorie_slug(cat_name), 'count': 0}
        cats[key]['count'] += 1
    return sorted(cats.values(), key=lambda c: c['count'], reverse=True)
