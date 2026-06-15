"""
blog_engine.py — Moteur de blog pour la plateforme comparatifs.

Format article :
    platform/sites/<site>/blog/posts/<slug>.md
    ──────────────────────────────────────────
    ---
    title: "Mon titre"
    slug: "1542-mon-titre"          # préfixe numérique unique
    date: "2026-05-15T09:00:00"
    categorie: "Paie"                # PRINCIPALE (= categories[0])
    categories: ["Paie", "Compta"]   # LISTE multi-cat (depuis juin 2026)
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

Multi-catégories (depuis juin 2026) :
- L'invariant `categorie == categories[0]` est garanti par le dashboard au save.
- À la lecture, `parse_post` normalise toujours `post['categories']` en liste,
  en synthétisant `[categorie]` pour les articles legacy. Toutes les fonctions
  consommatrices peuvent compter sur `post['categories']` étant une liste.
"""
from __future__ import annotations
import os
import re
import json
import random
import datetime as _dt
from pathlib import Path


# ═══════════════════════════════════════════════════════════════════════════
# HELPER MULTI-CATÉGORIES
# ═══════════════════════════════════════════════════════════════════════════

def _post_categories(post: dict) -> list[str]:
    """Retourne la liste des catégories d'un post.

    Multi-catégories : depuis juin 2026, un article peut être taggé sur plusieurs
    catégories via `categories: [...]` du frontmatter. Cette fonction retourne
    TOUJOURS une liste de strings, avec fallback `[categorie]` pour les articles
    legacy qui n'ont que l'ancien champ `categorie` (string).

    L'invariant `categorie == categories[0]` est garanti par le dashboard, mais
    cette fonction ne s'en sert pas — elle se contente de lire les champs présents.
    """
    cats = post.get('categories')
    if isinstance(cats, list) and cats:
        return [c.strip() for c in cats if isinstance(c, str) and c.strip()]
    one = (post.get('categorie') or '').strip()
    return [one] if one else []


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
    # Multi-catégories : normalise post['categories'] en liste de strings.
    # Pour les articles legacy qui n'ont que `categorie` (string), on synthétise
    # `[categorie]`. Toutes les fonctions consommatrices peuvent désormais
    # compter sur `post['categories']` étant une liste (potentiellement vide).
    post['categories'] = _post_categories(post)
    # Dérivés
    post['date_obj'] = _parse_date(post.get('date', ''))
    # Ancres de maillage interne : on tolère plusieurs formats
    post['link_anchors'] = _parse_link_anchors(fm.get('link_anchors'))
    return post


def _parse_link_anchors(raw) -> list[dict]:
    """Parse un champ link_anchors flexible. Formats acceptés :

    1) Liste de dicts (format frontmatter canonique) :
       link_anchors:
         - text: "pappers"
           max: 5

    2) Chaîne texte (format sheet/dashboard textarea) :
       "pappers:5\\nplateforme pappers:5\\nle site pappers:3"
       (séparateur newline OU ';')

    Retourne toujours une liste de {text: str, max: int}."""
    if not raw:
        return []
    out: list[dict] = []
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict):
                text = (item.get('text') or item.get('anchor') or '').strip()
                try:
                    n = int(item.get('max') or item.get('count') or 1)
                except (TypeError, ValueError):
                    n = 1
                if text and n > 0:
                    out.append({'text': text, 'max': n})
            elif isinstance(item, str):
                parsed = _parse_anchor_line(item)
                if parsed:
                    out.append(parsed)
        return out
    if isinstance(raw, str):
        # Lignes séparées par \n ou ;
        for line in re.split(r'[\n;]', raw):
            parsed = _parse_anchor_line(line)
            if parsed:
                out.append(parsed)
    return out


def _parse_anchor_line(line: str) -> dict | None:
    """Parse une ligne au format 'ancre:nombre' ou 'ancre x nombre' ou juste 'ancre'."""
    s = (line or '').strip()
    if not s:
        return None
    # "ancre:5"
    m = re.match(r'^(.*?)[:\s]\s*(?:x\s*)?(\d+)\s*$', s, re.IGNORECASE)
    if m:
        text = m.group(1).strip().rstrip(':').strip()
        n = int(m.group(2))
        if text and n > 0:
            return {'text': text, 'max': n}
        return None
    # Juste "ancre" → quota 1 par défaut
    return {'text': s, 'max': 1}


def _parse_date(date_str: str | _dt.datetime) -> _dt.datetime:
    """Tolère '2026-05-15', '2026-05-15T09:00', '2026-05-15T09:00:00',
    '2026-05-15T09:00:00.123456' (microsecondes), '2026-05-15T09:00:00+02:00'
    (timezone), objet datetime (aware ou naïf), ou vide.

    Retourne TOUJOURS un datetime naïf : si l'entrée est aware, on strip le
    tzinfo pour pouvoir comparer avec `datetime.now()` (naïf par défaut). Sans
    ce strip, toute comparaison aware-vs-naïf déclencherait TypeError et le
    chargement de blog_posts retournerait une liste vide → cleanup supprime
    tous les .html blog → 404 généralisés.
    """
    if isinstance(date_str, _dt.datetime):
        if date_str.tzinfo is not None:
            return date_str.replace(tzinfo=None)
        return date_str
    if isinstance(date_str, _dt.date):
        return _dt.datetime.combine(date_str, _dt.time.min)
    s = str(date_str or '').strip()
    if not s:
        return _dt.datetime.min
    # fromisoformat accepte les microsecondes et les timezones (3.11+). On
    # neutralise le 'Z' final (UTC) qu'il ne supporte qu'en 3.11+.
    try:
        s_norm = s.replace('Z', '+00:00')
        d = _dt.datetime.fromisoformat(s_norm)
        # On normalise en naive datetime (sans timezone) pour comparer
        # avec datetime.now() qui est naive.
        if d.tzinfo is not None:
            d = d.replace(tzinfo=None)
        return d
    except (ValueError, TypeError):
        pass
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
# MAILLAGE INTERNE (4 articles qui partagent ≥ 1 catégorie, figés une fois)
# ═══════════════════════════════════════════════════════════════════════════

def compute_related_posts(post: dict, all_posts: list[dict], n: int = 4) -> list[dict]:
    """Si post.related_posts est déjà rempli dans le frontmatter, on l'utilise
    tel quel (figé). Sinon, on pick n articles aléatoires qui PARTAGENT AU MOINS
    UNE CATÉGORIE avec ce post, on les écrit dans le frontmatter (fichier .md
    mis à jour), et on retourne.

    Multi-catégories : avec la nouvelle structure `categories: [...]`, deux
    articles sont considérés "liés" dès qu'ils partagent ne serait-ce qu'une
    catégorie (overlap non vide). Les articles legacy n'ont qu'une catégorie
    dans leur liste (synthétisée par parse_post), donc le comportement reste
    identique pour eux."""
    src_cats = {c.lower() for c in _post_categories(post)}
    if not src_cats:
        return []
    same_slug = post.get('slug', '')
    candidates = [
        p for p in all_posts
        if p.get('slug', '') != same_slug
        and src_cats.intersection(c.lower() for c in _post_categories(p))
    ]

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
    """Retourne la liste des catégories distinctes avec leur compte d'articles.

    Multi-catégories (depuis juin 2026) : un article apparaît dans le count de
    CHAQUE catégorie où il est taggé (via `categories: [...]` du frontmatter),
    pas seulement sa principale (`categorie`). Pour les articles legacy qui n'ont
    que `categorie`, le helper _post_categories synthétise une liste à 1 élément,
    donc le comportement reste identique pour eux.

    Tri : par count décroissant (catégories les plus utilisées en haut).
    """
    cats: dict[str, dict] = {}
    for p in posts:
        for cat_name in _post_categories(p):
            key = cat_name.lower()
            if key not in cats:
                cats[key] = {'name': cat_name, 'slug': categorie_slug(cat_name), 'count': 0}
            cats[key]['count'] += 1
    return sorted(cats.values(), key=lambda c: c['count'], reverse=True)


# ═══════════════════════════════════════════════════════════════════════════
# MAILLAGE INTERNE — Liens automatiques entre articles via ancres
# ═══════════════════════════════════════════════════════════════════════════

# Limites globales du maillage
MAX_INCOMING_LINKS_PER_TARGET = 15  # une cible n'accepte plus de liens au-delà
MAX_INTERNAL_LINKS_PER_SOURCE = 5   # un article source ne peut avoir plus de
                                     # 5 liens internes au total (auto + IA)
# 1 lien max d'une source S vers une cible T (= la première occurrence trouvée
# est transformée en lien, les autres occurrences de la même ancre restent en
# texte dans le même article).


def _count_internal_links(html: str) -> int:
    """Compte les liens internes (relatifs ou pointant vers le même domaine).
    Considère comme interne : href="/..." ou href commençant par "#" (ancres).
    Les liens externes (http://, https://) sont ignorés.

    Note : les liens https://<domain>/... ne sont pas matchés ici car on ne
    connaît pas le domaine à ce stade. On considère que l'IA ne génère que des
    href relatifs commençant par "/" pour les liens internes (consigne prompt).
    """
    if not html:
        return 0
    # Match les <a href="/quelque-chose"> (slash initial, pas double-slash ni protocole)
    return len(re.findall(r'<a\b[^>]*\bhref\s*=\s*["\']/(?!/)[^"\']*["\']', html, re.IGNORECASE))


def _strip_self_links(html: str, src_slug: str) -> tuple[str, int]:
    """Supprime les liens dont le href pointe vers soi-même (l'article courant).
    Gère les 3 formats que l'IA peut générer :
      - relatif racine    : /<src_slug>
      - relatif sous-path : /blog/<src_slug>
      - absolu            : https://example.com/<src_slug>
    Le matching ignore trailing slash, query string et fragment.

    Remplace `<a href="...">texte</a>` par juste `texte`.
    Retourne (html_modifié, n_self_links_supprimés).
    """
    if not html or not src_slug:
        return html, 0
    n = 0

    def _normalize_href(href: str) -> str:
        # Retire protocol + domain (http://x.y/foo → /foo)
        norm = re.sub(r'^https?://[^/]+', '', href.strip())
        # Retire query string et fragment
        norm = re.sub(r'[?#].*$', '', norm)
        # Retire trailing slash
        norm = norm.rstrip('/')
        return norm

    pat = re.compile(
        r'<a\b[^>]*\bhref\s*=\s*["\']([^"\']*)["\'][^>]*>(.*?)</a>',
        re.IGNORECASE | re.DOTALL,
    )

    def _replace(m: re.Match) -> str:
        nonlocal n
        href = m.group(1)
        text = m.group(2)
        norm = _normalize_href(href)
        target_suffix = '/' + src_slug
        # Match si href se termine par /<src_slug> (ex: /2644-foo ou /blog/2644-foo)
        if norm == target_suffix or norm.endswith(target_suffix):
            n += 1
            return text
        return m.group(0)

    new_html = pat.sub(_replace, html)
    return new_html, n


def _find_anchor_outside_tags(html: str, anchor: str) -> tuple[int, int] | None:
    """Trouve la première occurrence de `anchor` dans `html` SANS toucher :
    - L'intérieur des balises HTML (entre `<` et `>`)
    - L'intérieur des liens `<a>...</a>` existants (évite le double-linking)

    Match : mot complet, insensible à la casse (préserve la casse originale au
    remplacement). Retourne (start, end) dans `html`, ou None."""
    if not html or not anchor:
        return None

    # Construire les zones interdites
    forbidden: list[tuple[int, int]] = []
    for m in re.finditer(r'<[^>]+>', html):
        forbidden.append((m.start(), m.end()))
    for m in re.finditer(r'<a\b[^>]*>.*?</a>', html, flags=re.DOTALL | re.IGNORECASE):
        forbidden.append((m.start(), m.end()))
    # Exclure aussi l'intérieur des titres h1-h6 : les liens internes ne
    # doivent jamais "salir" un titre (mauvais SEO et mauvaise UX).
    for m in re.finditer(r'<h[1-6]\b[^>]*>.*?</h[1-6]\s*>', html, flags=re.DOTALL | re.IGNORECASE):
        forbidden.append((m.start(), m.end()))

    # Word boundary classique. Pour les ancres qui finissent par un caractère
    # spécial (ex: "pappers.fr"), \b ne marche pas correctement à la fin, donc
    # on utilise un boundary souple qui accepte une non-lettre/chiffre/point.
    # On échappe l'ancre pour l'utiliser en regex.
    pat = re.compile(
        r'(?<![\w])' + re.escape(anchor) + r'(?![\w])',
        flags=re.IGNORECASE,
    )
    for m in pat.finditer(html):
        if not any(a <= m.start() < b for a, b in forbidden):
            return m.start(), m.end()
    return None


def apply_internal_links(posts: list[dict], verbose: bool = False) -> dict:
    """Applique le maillage automatique sur la liste de posts.

    Pour chaque article CIBLE T qui a des `link_anchors`, on parcourt tous
    les articles SOURCE S et on tente d'insérer un lien S→T en remplaçant
    la première occurrence d'une de ses ancres dans le contenu HTML de S.

    Règles :
    - 1 lien max d'une source S vers la même cible T
    - 15 liens entrants max par cible (au-delà, on arrête)
    - Quota par ancre : si l'ancre "pappers" a max=5, elle ne sera utilisée
      que 5 fois au total (réparties sur les différents articles sources)
    - Les ancres les plus longues sont traitées en premier (pour qu'une
      ancre courte ne casse pas une ancre plus longue qui la contient)
    - Si deux cibles déclarent la même ancre, c'est la première qui passe
      le check qui gagne (ordre déterministe : par slug)

    Modifie `posts[i]['content_html']` en place. Retourne un dict de stats."""

    # 1) Construire la table globale des ancres : (anchor_text, target_post)
    #    triée par longueur d'ancre desc puis slug cible asc pour stabilité.
    entries: list[tuple[str, int, dict]] = []  # (anchor_text, max_quota, target)
    for tgt in posts:
        anchors = tgt.get('link_anchors') or []
        for a in anchors:
            text = (a.get('text') or '').strip()
            max_q = int(a.get('max') or 0)
            if text and max_q > 0:
                entries.append((text, max_q, tgt))

    if not entries:
        return {'links_added': 0, 'anchors_processed': 0}

    entries.sort(key=lambda e: (-len(e[0]), str(e[2].get('slug', ''))))

    # 2) Compteurs partagés
    incoming_count: dict[str, int] = {}            # slug cible → nb liens entrants
    anchor_used: dict[tuple[str, str], int] = {}   # (anchor_lower, slug cible) → nb utilisations
    links_added = 0
    self_links_stripped_total = 0

    # 3) Pour chaque post source, on parcourt toutes les (ancre, cible)
    #    et on tente de placer 1 lien par cible distincte.
    for src in posts:
        src_slug = src.get('slug', '')
        if not src_slug:
            continue
        linked_targets: set[str] = set()  # cibles déjà liées depuis ce post
        html = src.get('content_html') or ''
        if not html:
            continue

        # Étape 0 : nettoyer les self-links éventuels créés par l'IA pendant la
        # génération (l'IA peut avoir inséré <a href="/{src_slug}">...</a>
        # par erreur). On les transforme en texte plain.
        html, n_self = _strip_self_links(html, src_slug)
        if n_self > 0:
            self_links_stripped_total += n_self
            if verbose:
                print(f"   🧹 {src_slug} : {n_self} self-link(s) supprimé(s)")

        # Étape 0 bis : compter les liens internes déjà présents dans l'article
        # (créés par l'IA). On les comptabilise dans le quota max par source
        # pour respecter la limite MAX_INTERNAL_LINKS_PER_SOURCE.
        existing_internal = _count_internal_links(html)
        src_link_count = existing_internal

        for anchor_text, max_q, tgt in entries:
            # Cap global par source : on s'arrête dès qu'on atteint MAX_INTERNAL_LINKS_PER_SOURCE
            if src_link_count >= MAX_INTERNAL_LINKS_PER_SOURCE:
                break
            tgt_slug = tgt.get('slug', '')
            if not tgt_slug or tgt_slug == src_slug:
                continue
            if tgt_slug in linked_targets:
                continue
            if incoming_count.get(tgt_slug, 0) >= MAX_INCOMING_LINKS_PER_TARGET:
                continue
            akey = (anchor_text.lower(), tgt_slug)
            if anchor_used.get(akey, 0) >= max_q:
                continue

            pos = _find_anchor_outside_tags(html, anchor_text)
            if not pos:
                continue
            start, end = pos
            matched = html[start:end]  # préserve la casse originale
            replacement = f'<a href="/{tgt_slug}">{matched}</a>'
            html = html[:start] + replacement + html[end:]
            incoming_count[tgt_slug] = incoming_count.get(tgt_slug, 0) + 1
            anchor_used[akey] = anchor_used.get(akey, 0) + 1
            linked_targets.add(tgt_slug)
            links_added += 1
            src_link_count += 1
            if verbose:
                print(f"   🔗 {src_slug} → {tgt_slug}  ({anchor_text!r})  [{src_link_count}/{MAX_INTERNAL_LINKS_PER_SOURCE}]")

        src['content_html'] = html

    return {
        'links_added': links_added,
        'anchors_processed': len(entries),
        'self_links_stripped': self_links_stripped_total,
        'incoming_counts': incoming_count,
    }


# ═══════════════════════════════════════════════════════════════════════════
# SOMMAIRE (TABLE DES MATIÈRES) — injection d'ancres + extraction
# ═══════════════════════════════════════════════════════════════════════════

def _slugify_anchor(text: str) -> str:
    """Slugify pour ancre URL : lowercase, sans accents, tirets entre mots."""
    import unicodedata
    s = unicodedata.normalize('NFD', text or '').encode('ascii', 'ignore').decode('ascii')
    s = re.sub(r'<[^>]+>', '', s)  # strip toute balise résiduelle
    s = s.lower()
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s[:60] or 'section'


def inject_anchors_and_extract_toc(html: str) -> tuple[str, list[dict]]:
    """Pour chaque <h2>/<h3> dans le HTML :
    - Injecte un attribut id="..." dérivé du texte (pour la navigation par ancre)
    - Extrait le titre et le niveau dans une liste TOC

    Retourne (html_modifié, toc) où toc = [{level: 2|3, text: str, id: str}, ...]
    Les IDs sont uniques au sein de l'article (suffixe -2, -3, ... si collision).
    Si un <h2>/<h3> a déjà un id="..." en place, on le réutilise."""
    if not html:
        return html, []

    toc: list[dict] = []
    used_ids: set[str] = set()

    def repl(m: re.Match) -> str:
        level = int(m.group(1))
        attrs = m.group(2) or ''
        content = m.group(3)
        # Texte propre (sans balises) pour l'item TOC
        text = re.sub(r'<[^>]+>', '', content).strip()
        if not text:
            return m.group(0)
        # ID déjà présent ? on le réutilise
        existing_id = re.search(r'\bid=["\']([^"\']+)["\']', attrs)
        if existing_id:
            anchor_id = existing_id.group(1)
        else:
            base = _slugify_anchor(text)
            anchor_id = base
            i = 2
            while anchor_id in used_ids:
                anchor_id = f"{base}-{i}"
                i += 1
        used_ids.add(anchor_id)
        toc.append({'level': level, 'text': text, 'id': anchor_id})
        # Si pas d'id, on l'ajoute proprement
        if not existing_id:
            new_attrs = (attrs + f' id="{anchor_id}"').strip()
            return f'<h{level} {new_attrs}>{content}</h{level}>'
        return m.group(0)

    new_html = re.sub(
        r'<h([23])((?:\s+[^>]*)?)>(.+?)</h\1\s*>',
        repl,
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )
    return new_html, toc


# ═══════════════════════════════════════════════════════════════════════════
# SCHEMAS SEO — détection automatique FAQPage et HowTo
# ═══════════════════════════════════════════════════════════════════════════

def extract_faq_from_html(html: str) -> list[dict]:
    """Détecte une section FAQ dans le HTML et retourne la liste des paires Q/A.

    Critères de déclenchement :
    - Un <h2> ou <h3> dont le texte contient l'un de ces marqueurs :
      'FAQ', 'Foire aux questions', 'Questions fréquentes', 'Questions / Réponses',
      'Questions courantes', 'Q&R', 'Q & R'
    - On capture ensuite toutes les paires (<h3>Question</h3> + paragraphe(s) qui suivent)
      jusqu'au prochain <h2> ou la fin du HTML.

    Retourne [{question, answer}, ...] ou [] si pas de FAQ détectée.
    Le schema FAQPage ne sera émis dans le template que si la liste contient ≥ 2 éléments."""
    if not html:
        return []

    pattern_marker = r'(?:faq|foire\s+aux\s+questions|questions?\s+fr[eé]quentes|questions?\s*[/]\s*r[eé]ponses?|questions?\s+courantes|q\s*[\&/]\s*r)'
    h_re = re.compile(
        r'<h([23])[^>]*>\s*[^<]*?' + pattern_marker + r'[^<]*?\s*</h\1>',
        flags=re.IGNORECASE | re.DOTALL,
    )
    m = h_re.search(html)
    if not m:
        return []
    section_level = int(m.group(1))
    # Section : du end de ce header jusqu'au prochain header de même niveau (ou supérieur)
    start = m.end()
    if section_level == 2:
        next_hdr = re.search(r'<h2[\s>]', html[start:], flags=re.IGNORECASE)
    else:
        next_hdr = re.search(r'<h[12][\s>]', html[start:], flags=re.IGNORECASE)
    end = start + next_hdr.start() if next_hdr else len(html)
    section = html[start:end]

    # Niveau des "questions" : si la FAQ est en h2, on cherche h3 ; sinon h4
    q_level = 3 if section_level == 2 else 4
    qa_re = re.compile(
        rf'<h{q_level}[^>]*>(.+?)</h{q_level}\s*>\s*((?:<p[^>]*>.+?</p>\s*)+)',
        flags=re.DOTALL | re.IGNORECASE,
    )
    faqs = []
    for qa in qa_re.finditer(section):
        question = re.sub(r'<[^>]+>', '', qa.group(1)).strip()
        # Joindre tous les <p> en un seul texte (les réponses peuvent être multi-paragraphes)
        answer = re.sub(r'<\s*p[^>]*>', '', qa.group(2))
        answer = re.sub(r'<\s*/\s*p\s*>', ' ', answer)
        answer = re.sub(r'<[^>]+>', '', answer)
        answer = re.sub(r'&nbsp;|&amp;|&#39;', lambda m_: {'&nbsp;': ' ', '&amp;': '&', '&#39;': "'"}[m_.group(0)], answer)
        answer = re.sub(r'\s+', ' ', answer).strip()
        if question and answer and len(answer) >= 20:
            faqs.append({'question': question, 'answer': answer})
    return faqs


def extract_howto_from_html(html: str, title: str, post_toc: list[dict] | None = None) -> list[dict]:
    """Détecte un guide pas à pas dans l'article et retourne la liste des étapes.

    Critères de déclenchement (l'un OU l'autre) :
    1. Le titre de l'article commence par 'Comment ' (cas le plus fréquent pour un how-to)
    2. Le contenu contient un <h2> avec marqueur : 'Étapes', 'Procédure',
       'Étape par étape', 'Tutoriel', 'Marche à suivre'

    Stratégie d'extraction :
    - Chercher une section "étapes" dans le HTML
    - Si trouvée : capturer les <h3> à l'intérieur comme étapes (name = texte du h3,
      text = paragraphe(s) qui suit/suivent)
    - Si pas trouvée mais titre 'Comment ...' : utiliser les <h2> de l'article comme
      étapes (sauf le 1er h2 s'il s'appelle 'Introduction' / 'Présentation' / etc.)

    Retourne [{name, text, id}, ...] ou [] si pas détecté.
    Le schema HowTo ne sera émis dans le template que si la liste contient ≥ 3 étapes."""
    if not html:
        return []

    title_lower = (title or '').strip().lower()
    is_howto_title = title_lower.startswith('comment ') or title_lower.startswith('tutoriel ')

    # Chercher une section "étapes" / "procédure" / "tutoriel"
    steps_marker = r'(?:[ée]tapes?(?:\s+par\s+[ée]tape)?|proc[ée]dure|tutoriel|marche\s+[aà]\s+suivre|guide\s+pratique)'
    h2_steps_re = re.compile(
        r'<h2[^>]*>\s*[^<]*?' + steps_marker + r'[^<]*?\s*</h2>',
        flags=re.IGNORECASE | re.DOTALL,
    )
    m = h2_steps_re.search(html)

    if m:
        # Section trouvée : on extrait les h3 qui suivent (jusqu'au prochain h2)
        start = m.end()
        next_h2 = re.search(r'<h2[\s>]', html[start:], flags=re.IGNORECASE)
        end = start + next_h2.start() if next_h2 else len(html)
        section = html[start:end]
        return _extract_steps_from_section(section, base_level=3)

    if is_howto_title:
        # Pas de section "étapes" mais titre "Comment ...". Fallback : utiliser
        # les <h2> de l'article comme étapes. On exclut le 1er h2 s'il a un
        # nom générique introductif, et tous les h2 considérés "non-étapes"
        # (FAQ, Conclusion, Pour aller plus loin, etc.).
        return _extract_steps_from_h2(html, post_toc)

    return []


_NON_STEP_H2_PATTERNS = re.compile(
    r'^\s*(?:'
    r'introduction|pr[ée]sentation|pr[ée]ambule|en\s+r[ée]sum[ée]|r[ée]sum[ée]|'
    r'conclusion|pour\s+aller\s+plus\s+loin|points?\s+cl[eé]s?|'
    r'foire\s+aux\s+questions|questions?\s+fr[eé]quentes|faq|'
    r'pour\s+conclure|en\s+conclusion'
    r')\s*$',
    flags=re.IGNORECASE,
)


def _extract_steps_from_section(section: str, base_level: int) -> list[dict]:
    """Extrait les paires (titre niveau N + paragraphes qui suivent) comme étapes."""
    pat = re.compile(
        rf'<h{base_level}([^>]*)>(.+?)</h{base_level}\s*>\s*((?:<p[^>]*>.+?</p>\s*)+)',
        flags=re.DOTALL | re.IGNORECASE,
    )
    steps = []
    for s in pat.finditer(section):
        attrs = s.group(1) or ''
        name_raw = s.group(2)
        body_raw = s.group(3)
        name = re.sub(r'<[^>]+>', '', name_raw).strip()
        # Récupère l'id si présent (pour le lien de l'étape)
        id_match = re.search(r'\bid=["\']([^"\']+)["\']', attrs)
        step_id = id_match.group(1) if id_match else _slugify_anchor(name)
        # Texte de l'étape : 1er paragraphe seulement (suffit pour le schema)
        first_p = re.search(r'<p[^>]*>(.+?)</p>', body_raw, flags=re.DOTALL | re.IGNORECASE)
        text = ''
        if first_p:
            text = re.sub(r'<[^>]+>', '', first_p.group(1))
            text = re.sub(r'\s+', ' ', text).strip()
        if name and text and len(text) >= 15:
            steps.append({'name': name, 'text': text, 'id': step_id})
    return steps


def _extract_steps_from_h2(html: str, post_toc: list[dict] | None = None) -> list[dict]:
    """Fallback : utilise les <h2> de l'article comme étapes, en excluant les
    sections génériques (intro, conclusion, FAQ, etc.)."""
    pat = re.compile(
        r'<h2([^>]*)>(.+?)</h2\s*>\s*((?:<p[^>]*>.+?</p>\s*)+)',
        flags=re.DOTALL | re.IGNORECASE,
    )
    steps = []
    for s in pat.finditer(html):
        attrs = s.group(1) or ''
        name_raw = s.group(2)
        body_raw = s.group(3)
        name = re.sub(r'<[^>]+>', '', name_raw).strip()
        if _NON_STEP_H2_PATTERNS.match(name):
            continue
        id_match = re.search(r'\bid=["\']([^"\']+)["\']', attrs)
        step_id = id_match.group(1) if id_match else _slugify_anchor(name)
        first_p = re.search(r'<p[^>]*>(.+?)</p>', body_raw, flags=re.DOTALL | re.IGNORECASE)
        text = ''
        if first_p:
            text = re.sub(r'<[^>]+>', '', first_p.group(1))
            text = re.sub(r'\s+', ' ', text).strip()
        if name and text and len(text) >= 15:
            steps.append({'name': name, 'text': text, 'id': step_id})
    return steps


# ═══════════════════════════════════════════════════════════════════════════
# FIX TYPOGRAPHIQUE — ajout automatique du '?' sur les titres interrogatifs
# ═══════════════════════════════════════════════════════════════════════════

# Mots interrogatifs qui déclenchent l'ajout d'un '?' final si manquant.
# Ordre : multi-mots d'abord (sinon "Est-ce" peut être considéré comme commençant
# par "Est"). Tous testés case-insensitive sur le premier mot/début.
_QUESTION_STARTERS = [
    'est-ce que', 'est-ce qu',
    'faut-il', 'doit-on', 'peut-on', 'comment',
    'pourquoi', 'quand', 'combien', 'où',
    "qu'est-ce", "qu'", "qu’",  # apostrophe ASCII et typographique
    'que', 'qui', 'quel', 'quelle', 'quels', 'quelles',
    'lequel', 'laquelle', 'lesquels', 'lesquelles',
    'a-t-on', 'a-t-il', 'a-t-elle', 'y a-t-il',
]


def _strip_html_for_check(text: str) -> str:
    """Strip HTML pour vérifier le début du texte d'un titre."""
    return re.sub(r'<[^>]+>', '', text or '').strip()


def _is_question_title(text: str) -> bool:
    """Détecte si un titre commence par un mot/expression interrogatif."""
    plain = _strip_html_for_check(text).lower()
    if not plain:
        return False
    for starter in _QUESTION_STARTERS:
        # Match au début + frontière (espace, apostrophe, ou fin)
        if plain.startswith(starter):
            # Vérifier que c'est un mot complet (pas "comme" qui commence par "comm")
            next_char = plain[len(starter):len(starter) + 1]
            if next_char in (' ', "'", '\u2019', '-', '') or starter.endswith("'") or starter.endswith('\u2019'):
                return True
    return False


def fix_question_marks(html: str) -> tuple[str, int]:
    """Pour chaque <h1>-<h6> dont le texte est une question (commence par un mot
    interrogatif) mais ne se termine pas par '?', ajoute le '?' final avec un
    espace simple devant.

    Retourne (html_modifié, n_fixes)."""
    if not html:
        return html, 0
    n_fixes = 0

    def _repl(m: re.Match) -> str:
        nonlocal n_fixes
        full_open = m.group(1)   # <hN attrs>
        content = m.group(2)
        full_close = m.group(3)  # </hN>
        if not _is_question_title(content):
            return m.group(0)
        plain = _strip_html_for_check(content).rstrip(' \t\u00a0\u202f')
        if plain.endswith('?') or plain.endswith('!') or plain.endswith('…'):
            return m.group(0)
        new_content = content.rstrip(' \t\n\u00a0\u202f') + ' ?'
        n_fixes += 1
        return f'{full_open}{new_content}{full_close}'

    new_html = re.sub(
        r'(<h[1-6]\b[^>]*>)(.+?)(</h[1-6]\s*>)',
        _repl,
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )
    return new_html, n_fixes
