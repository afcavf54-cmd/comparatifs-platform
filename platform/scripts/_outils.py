"""
Génération des pages d'outils interactifs (convertisseurs, calculateurs…)
pour un site donné.

Script autonome : à exécuter APRÈS generate.py dans le pipeline.
Ne touche pas à generate.py, pour limiter les risques.

Usage :
    python platform/scripts/_outils.py <site_slug>
    # Ex : python platform/scripts/_outils.py digicube-fr

Lit :
    platform/sites/<site>/config.yaml
    platform/sites/<site>/outils.json
    platform/templates/outils/<outil_id>.html.j2

Écrit :
    platform/sites/<site>/output/<slug>.html (1 par outil "active":true)

Retour terminal :
    Liste des URLs publiques générées (1 par ligne)
    pour faciliter l'ajout au sitemap.xml plus tard si besoin.
"""

from __future__ import annotations
import sys
import json
from pathlib import Path

try:
    import yaml
except ImportError:
    print("❌ pyyaml manquant. Installer avec : pip install pyyaml", file=sys.stderr)
    sys.exit(1)

try:
    from jinja2 import Environment, FileSystemLoader, TemplateNotFound
except ImportError:
    print("❌ jinja2 manquant. Installer avec : pip install jinja2", file=sys.stderr)
    sys.exit(1)



# ──────────────────────────────────────────────────────────────────
# Catalogue d'outils (icon, name, description)
# Source de vérité partagée. Lors de l'ajout d'un nouvel outil, faut
# ajouter une entrée ici ET dans le catalogue côté HUB (outils-page.tsx).
# ──────────────────────────────────────────────────────────────────
TOOL_CATALOG = {
    "convertisseur-ht-ttc": {
        "icon": "⇄",
        "name": "Convertisseur HT / TTC",
        "description": "Convertit un prix HT en TTC et inversement, avec les taux TVA 20 %, 10 %, 5,5 % et 2,1 %.",
    },
    # Futurs outils :
    # "salaire-brut-net": {"icon": "💶", "name": "...", "description": "..."},
}


def slugify(s: str) -> str:
    """Convertit un label en slug d'URL.
    Ex : 'Outils' → 'outils', 'Mes outils' → 'mes-outils'.
    Doit être identique à la fonction du même nom dans _sync_outils_menu.py
    pour que les deux scripts s'accordent sur le même slug.
    """
    import unicodedata
    import re
    if not s:
        return "outils"
    s = s.strip().lower()
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "outils"



def normalize_canonical_domain(site_cfg: dict) -> str:
    """Calcule le domaine canonique en respectant www_preference.

    Exemples :
      domain="https://laboxentrepreneuriat.fr",  www_preference="www"   → "https://www.laboxentrepreneuriat.fr"
      domain="https://www.editions-dp.com",      www_preference="www"   → "https://www.editions-dp.com" (inchangé)
      domain="https://www.example.com",          www_preference="naked" → "https://example.com"

    Important : doit faire EXACTEMENT ce que generate.py fait pour les autres
    pages du site, sinon on a une incohérence de canonical entre pages outils
    et pages avis/classements.
    """
    domain = (site_cfg or {}).get("domain", "") or ""
    pref = (site_cfg or {}).get("www_preference", "") or ""
    if not domain:
        return domain
    has_www = "://www." in domain
    if pref == "www" and not has_www:
        return domain.replace("://", "://www.", 1)
    if pref == "naked" and has_www:
        return domain.replace("://www.", "://", 1)
    return domain


def find_platform_dir() -> Path:
    """Remonte depuis ce script pour trouver platform/."""
    here = Path(__file__).resolve()
    # Le script est dans platform/scripts/_outils.py → on remonte de 2 cran
    if here.parent.name == "scripts" and here.parent.parent.name == "platform":
        return here.parent.parent
    # Fallback : chercher un dossier 'platform' en remontant
    p = here
    for _ in range(6):
        p = p.parent
        if (p / "platform").is_dir():
            return p / "platform"
    raise SystemExit("❌ Impossible de localiser le dossier 'platform/'.")


def main(site_slug: str) -> int:
    platform_dir = find_platform_dir()
    site_dir = platform_dir / "sites" / site_slug
    templates_dir = platform_dir / "templates"
    output_dir = site_dir / "output"

    if not site_dir.is_dir():
        print(f"❌ Site introuvable : {site_dir}", file=sys.stderr)
        return 1

    # ── 1) Charger config.yaml du site ──────────────────────────
    config_path = site_dir / "config.yaml"
    if not config_path.exists():
        print(f"❌ config.yaml introuvable : {config_path}", file=sys.stderr)
        return 1

    with config_path.open(encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}

    site_cfg = dict(config.get("site", {}) or {})
    # Respecter www_preference pour le canonical (sinon canonical sans www
    # alors que la page est servie en www → incohérence SEO).
    site_cfg["domain"] = normalize_canonical_domain(site_cfg)
    theme_cfg = config.get("theme", {}) or {}

    # ── Auto-détection has_avis / has_blog (compat nav classement-saas) ──
    # Le template de la nav du site (inline dans classement-saas.html.j2)
    # affiche les liens "Avis" et "Blog" uniquement si site.has_avis /
    # site.has_blog sont vrais. generate.py les calcule probablement
    # lui-même, mais en standalone on les recalcule en regardant le
    # filesystem du site, pour avoir le même menu que les autres pages.
    avis_dir = site_dir / "posts_avis"
    has_avis = avis_dir.is_dir() and any(avis_dir.glob("*.md"))
    blog_dir = site_dir / "posts"
    has_blog = bool(site_cfg.get("blog_sheet_csv_url")) or (blog_dir.is_dir() and any(blog_dir.glob("*.md")))
    site_cfg.setdefault("has_avis", has_avis)
    site_cfg.setdefault("has_blog", has_blog)
    print(f"   menu : has_avis={has_avis}, has_blog={has_blog}")

    # ── Auto-détection du logo (compat nav classement-saas) ─────
    # La nav affiche une image si site.logo_img est défini, sinon
    # fallback sur le texte logo_text + logo_accent.
    # On cherche le logo dans `public/` (qui est copié vers `output/`
    # par generate.py). Première extension trouvée gagne.
    LOGO_NAMES = ["logo.png", "logo.svg", "logo.jpg", "logo.webp"]
    public_dir = site_dir / "public"
    if "logo_img" not in site_cfg or not site_cfg["logo_img"]:
        for name in LOGO_NAMES:
            if (public_dir / name).is_file():
                site_cfg["logo_img"] = "/" + name
                print(f"   logo : {site_cfg['logo_img']}")
                break
        else:
            print(f"   logo : aucun fichier public/logo.* — fallback texte")
    else:
        print(f"   logo : {site_cfg['logo_img']} (depuis config)")

    # ── Auto-détection du favicon ───────────────────────────────
    # `<link rel="icon">` dans le head du template. Compatible avec
    # tous les formats classiques.
    FAVICON_NAMES = ["favicon.ico", "favicon.png", "favicon.svg", "favicon-32x32.png"]
    if "favicon_file" not in site_cfg or not site_cfg["favicon_file"]:
        for name in FAVICON_NAMES:
            if (public_dir / name).is_file():
                site_cfg["favicon_file"] = "/" + name
                print(f"   favicon : {site_cfg['favicon_file']}")
                break
        else:
            print(f"   favicon : aucun fichier public/favicon.* — fallback /favicon.svg")

    # ── 2) Charger outils.json (skip si absent) ─────────────────
    outils_path = site_dir / "outils.json"
    if not outils_path.exists():
        print(f"⏭  Pas d'outils.json pour {site_slug} — rien à générer.")
        return 0

    try:
        outils_config = json.loads(outils_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"❌ outils.json invalide : {e}", file=sys.stderr)
        return 1

    outils = outils_config.get("outils", {}) or {}
    if not outils:
        print(f"⏭  Aucun outil défini dans outils.json pour {site_slug}.")
        return 0

    # ── 3) Setup Jinja2 ─────────────────────────────────────────
    if not templates_dir.is_dir():
        print(f"❌ Dossier templates introuvable : {templates_dir}", file=sys.stderr)
        return 1

    env = Environment(
        loader=FileSystemLoader(str(templates_dir)),
        autoescape=False,
        keep_trailing_newline=True,
    )

    # ── Filtres et globals custom (compat avec generate.py) ─────
    # Le footer (et potentiellement d'autres includes) utilise des
    # filtres custom définis par generate.py. On les recopie ici
    # pour que le rendu ne plante pas en standalone.
    import datetime as _dt

    _MOIS_FR = [
        "janvier", "février", "mars", "avril", "mai", "juin",
        "juillet", "août", "septembre", "octobre", "novembre", "décembre",
    ]

    def _fr_date(value, fmt: str = "long"):
        if value is None:
            value = _dt.date.today()
        if isinstance(value, str):
            try:
                value = _dt.datetime.fromisoformat(value)
            except ValueError:
                return value
        if not isinstance(value, (_dt.date, _dt.datetime)):
            return str(value)
        return f"{value.day} {_MOIS_FR[value.month - 1]} {value.year}"

    env.filters["fr_date"] = _fr_date
    env.globals["today"] = _dt.date.today()
    env.globals["now"] = _dt.datetime.now()
    env.globals["build_date"] = _fr_date(_dt.date.today())
    env.globals["year"] = _dt.date.today().year

    # ── 4) Domaine pour URLs publiques ──────────────────────────
    domain = (site_cfg.get("domain") or "").rstrip("/")

    # S'assurer que le dossier output existe
    output_dir.mkdir(parents=True, exist_ok=True)

    # ── 5) Générer chaque outil actif ───────────────────────────
    nb_generated = 0
    nb_skipped = 0
    nb_errors = 0
    generated_urls: list[str] = []

    print(f"\n🧰 Génération des outils pour {site_slug}")
    print("─" * 50)

    for outil_id, outil_state in outils.items():
        if not outil_state.get("active"):
            nb_skipped += 1
            print(f"  ⏭  {outil_id} (hors ligne)")
            continue

        slug = (outil_state.get("slug") or outil_id).strip().strip("/")
        if not slug:
            print(f"  ⚠ {outil_id} : slug vide, skip")
            nb_errors += 1
            continue

        # Charger le template Jinja2 de l'outil
        template_name = f"outils/{outil_id}.html.j2"
        try:
            template = env.get_template(template_name)
        except TemplateNotFound:
            print(f"  ⚠ {outil_id} : template introuvable ({template_name})")
            nb_errors += 1
            continue

        # Données à passer au template
        outil_data = {
            "id": outil_id,
            "slug": slug,
            "title": outil_state.get("title", ""),
            "meta_description": outil_state.get("meta_description", ""),
            "h1": outil_state.get("h1", ""),
            "contenu_genere": outil_state.get("contenu_genere", ""),
            "faq": outil_state.get("faq", []) or [],
            "nb_mots": outil_state.get("nb_mots", 0),
        }

        # Rendu
        try:
            html = template.render(
                outil=outil_data,
                site=site_cfg,
                theme=theme_cfg,
                config=config,
            )
        except Exception as e:
            print(f"  ❌ {outil_id} : erreur de rendu — {e}")
            nb_errors += 1
            continue

        # Écriture
        output_path = output_dir / f"{slug}.html"
        try:
            output_path.write_text(html, encoding="utf-8")
        except OSError as e:
            print(f"  ❌ {outil_id} : erreur d'écriture — {e}")
            nb_errors += 1
            continue

        public_url = f"{domain}/{slug}" if domain else f"/{slug}"
        generated_urls.append(public_url)
        nb_generated += 1
        print(f"  ✓ {slug}.html → {public_url}")

    # ── 5b) Génération de la page d'index /outils ───────────────
    # Liste tous les outils actifs avec icon + description (depuis le
    # catalogue). Sert de hub depuis lequel l'utilisateur peut accéder
    # à chaque outil. Page créée uniquement s'il y a >= 1 outil actif.
    outils_list = []
    for outil_id, outil_state in outils.items():
        if not outil_state.get("active"):
            continue
        slug = (outil_state.get("slug") or outil_id).strip().strip("/")
        if not slug:
            continue
        catalog_entry = TOOL_CATALOG.get(outil_id, {})
        outils_list.append({
            "id": outil_id,
            "slug": slug,
            "icon": catalog_entry.get("icon", "🛠"),
            "name": catalog_entry.get("name", outil_state.get("h1") or outil_id),
            "description": catalog_entry.get("description", outil_state.get("meta_description", "")),
        })

    if outils_list:
        # Slug d'URL de la page d'index, dérivé du menu_label
        # ("Outils" → /outils, "Calculateurs" → /calculateurs, etc.)
        # Doit matcher ce que _sync_outils_menu.py écrit dans le menu.
        menu_label = (outils_config.get("menu_label") or "Outils").strip()
        index_slug = slugify(menu_label)

        try:
            index_tpl = env.get_template("outils-index.html.j2")
            html = index_tpl.render(
                outils_list=outils_list,
                outils_index_slug=index_slug,
                site=site_cfg,
                theme=theme_cfg,
                config=config,
            )
            (output_dir / f"{index_slug}.html").write_text(html, encoding="utf-8")
            print(f"  ✓ {index_slug}.html (page d'index, {len(outils_list)} outil(s))")
            if domain:
                generated_urls.append(f"{domain}/{index_slug}")
        except TemplateNotFound:
            print(f"  ⚠ Template outils-index.html.j2 introuvable — page d'index non générée")
        except Exception as e:
            print(f"  ❌ Erreur de rendu de la page d'index : {e}")

    # ── 6) Résumé final ─────────────────────────────────────────
    print("─" * 50)
    print(f"✅ {nb_generated} outil(s) publié(s), {nb_skipped} hors ligne, {nb_errors} erreur(s)")

    if generated_urls:
        print(f"\nURLs publiées :")
        for url in generated_urls:
            print(f"  {url}")

    return 0 if nb_errors == 0 else 2


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python _outils.py <site_slug>", file=sys.stderr)
        print("Exemple: python platform/scripts/_outils.py digicube-fr", file=sys.stderr)
        sys.exit(1)
    sys.exit(main(sys.argv[1]))
