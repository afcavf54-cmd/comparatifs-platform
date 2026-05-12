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
    (timezone), objet datetime, ou vide."""
    if isinstance(date_str, _dt.datetime):
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


# ═══════════════════════════════════════════════════════════════════════════
# MAILLAGE INTERNE — Liens automatiques entre articles via ancres
# ═══════════════════════════════════════════════════════════════════════════

# Limites globales du maillage
MAX_INCOMING_LINKS_PER_TARGET = 15  # une cible n'accepte plus de liens au-delà
# 1 lien max d'une source S vers une cible T (= la première occurrence trouvée
# est transformée en lien, les autres occurrences de la même ancre restent en
# texte dans le même article).


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

        for anchor_text, max_q, tgt in entries:
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
            if verbose:
                print(f"   🔗 {src_slug} → {tgt_slug}  ({anchor_text!r})")

        src['content_html'] = html

    return {
        'links_added': links_added,
        'anchors_processed': len(entries),
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
