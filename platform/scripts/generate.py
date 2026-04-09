#!/usr/bin/env python3
"""
generate.py — Générateur de sites comparatifs statiques
Plateforme : GitHub + Netlify · Source : Google Sheets CSV · Templates : Jinja2

Usage :
    python scripts/generate.py --site poussettes
    python scripts/generate.py --site poussettes --dry-run
    python scripts/generate.py --site poussettes --pair yoyo-2,cybex-balios-s
    python scripts/generate.py --all   # génère tous les sites

Architecture fichiers :
    platform/
    ├── scripts/generate.py         ← ce fichier
    ├── templates/
    │   └── comparatif-vs.html.j2   ← template partagé
    └── sites/{niche}/
        ├── config.yaml             ← config site + thème + SEO
        ├── products.yaml           ← catalogue produits
        └── output/                 ← HTML généré (gitignored ou Netlify publish)
"""

import argparse
import itertools
import os
import sys
import math
from datetime import date
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape

# ── Chemins ─────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
TEMPLATES_DIR = ROOT / "templates"
SITES_DIR = ROOT / "sites"
SHARED_DIR = ROOT / "sites" / "_shared"


# ── Helpers ──────────────────────────────────────────────────────────────────
def load_yaml(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def slugify(s: str) -> str:
    """Convertit un nom en slug URL (sans librairie externe)."""
    import unicodedata
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.replace(" ", "-").replace("'", "").replace(".", "")
    return "".join(c for c in s if c.isalnum() or c == "-")


def stars_html(n: float) -> str:
    full = int(n)
    empty = 5 - full
    return "★" * full + "☆" * empty


def build_seo(site: dict, seo_config: dict, prod_a: dict, prod_b: dict) -> dict:
    year = site["year"]
    return {
        "title": seo_config["title_pattern"]
            .replace("{A}", prod_a["nom"])
            .replace("{B}", prod_b["nom"])
            .replace("{year}", str(year)),
        "meta": seo_config["meta_pattern"]
            .replace("{A}", prod_a["nom"])
            .replace("{B}", prod_b["nom"])
            .replace("{year}", str(year)),
        "h1": seo_config["h1_pattern"]
            .replace("{A}", prod_a["nom"])
            .replace("{B}", prod_b["nom"])
            .replace("{year}", str(year)),
        "intro": seo_config["intro_pattern"]
            .replace("{A}", prod_a["nom"])
            .replace("{B}", prod_b["nom"])
            .replace("{prix_a}", f"{prod_a['prix']}€")
            .replace("{prix_b}", f"{prod_b['prix']}€"),
    }


def build_related_pages(slug_a: str, slug_b: str, products: list, max_items: int = 8) -> list:
    """Génère les liens de maillage interne pour la page A vs B."""
    related = []
    for p in products:
        s = p["slug"]
        if s in (slug_a, slug_b):
            continue
        # Liens depuis A vers les autres
        url = f"{slug_a}-vs-{s}.html"
        label = f"{products_by_slug(products, slug_a)['nom']} vs {p['nom']}"
        related.append({"url": url, "label": label})
        if len(related) >= max_items:
            break
    return related


def products_by_slug(products: list, slug: str) -> dict:
    return next((p for p in products if p["slug"] == slug), None)


def generate_sitemap(site: dict, pairs: list, output_dir: Path) -> None:
    domain = site["domain"]
    base = site["base_path"].rstrip("/")
    today = date.today().isoformat()

    lines = ['<?xml version="1.0" encoding="UTF-8"?>']
    lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    lines.append(f'  <url><loc>{domain}{base}/</loc><priority>1.0</priority></url>')

    for slug_a, slug_b in pairs:
        url = f"{domain}{base}/{slug_a}-vs-{slug_b}"
        lines.append(
            f'  <url><loc>{url}</loc>'
            f'<lastmod>{today}</lastmod>'
            f'<changefreq>monthly</changefreq>'
            f'<priority>0.8</priority></url>'
        )

    lines.append("</urlset>")
    sitemap_path = output_dir / "sitemap.xml"
    sitemap_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"  ✓ sitemap.xml ({len(pairs)} URLs)")


def copy_shared_assets(output_dir: Path, site_dir: Path) -> None:
    """Copie sheets.js vers le dossier output."""
    # Cherche sheets.js dans site_dir d'abord, puis _shared
    for source_dir in [site_dir, SHARED_DIR]:
        js_src = source_dir / "sheets.js"
        if js_src.exists():
            import shutil
            shutil.copy2(js_src, output_dir / "sheets.js")
            print(f"  ✓ sheets.js copié depuis {source_dir.name}/")
            return
    print("  ⚠ sheets.js introuvable — à copier manuellement")


# ── Générateur principal ──────────────────────────────────────────────────────
def generate_site(site_slug: str, dry_run: bool = False, filter_pair: tuple = None) -> None:
    site_dir = SITES_DIR / site_slug
    if not site_dir.exists():
        print(f"❌ Site introuvable : {site_dir}")
        sys.exit(1)

    # Chargement config + produits
    config = load_yaml(site_dir / "config.yaml")
    products_data = load_yaml(site_dir / "products.yaml")

    site = config["site"]
    theme = config["theme"]
    criteria = config["criteria"]
    products = products_data["products"]

    print(f"\n🚀 Génération site : {site_slug}")
    print(f"   {len(products)} produits → {math.comb(len(products), 2)} paires")

    # Setup Jinja2
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    # Filtre personnalisé capitalize
    env.filters["capitalize"] = lambda s: s.capitalize() if s else ""

    template = env.get_template("comparatif-vs.html.j2")

    # Output dir
    output_dir = site_dir / "output"
    if not dry_run:
        output_dir.mkdir(exist_ok=True)

    # Toutes les paires ordonnées (A, B) avec A < B alphabétiquement
    all_slugs = [p["slug"] for p in products]
    pairs = list(itertools.combinations(all_slugs, 2))

    if filter_pair:
        pairs = [p for p in pairs if set(p) == set(filter_pair)]
        print(f"   Filtre : {filter_pair}")

    generated = 0
    skipped = 0

    for slug_a, slug_b in pairs:
        prod_a = products_by_slug(products, slug_a)
        prod_b = products_by_slug(products, slug_b)

        if not prod_a or not prod_b:
            print(f"  ⚠ Slug introuvable : {slug_a} ou {slug_b}")
            skipped += 1
            continue

        filename = f"{slug_a}-vs-{slug_b}.html"
        seo_config = config["seo"]
        seo = build_seo(site, seo_config, prod_a, prod_b)
        related = build_related_pages(slug_a, slug_b, products)

        context = {
            "site": {**site, "seo": config.get("seo", site.get("seo", {}))},
            "theme": theme,
            "criteria": criteria,
            "prod_a": prod_a,
            "prod_b": prod_b,
            "slug_a": slug_a,
            "slug_b": slug_b,
            "seo": seo,
            "related_pages": related,
            "build_date": date.today().isoformat(),
        }

        if dry_run:
            print(f"  [DRY] {filename}")
            generated += 1
            continue

        html = template.render(**context)
        out_path = output_dir / filename
        out_path.write_text(html, encoding="utf-8")
        generated += 1

    if not dry_run:
        # Sitemap
        generate_sitemap(site, pairs, output_dir)
        # Assets partagés
        copy_shared_assets(output_dir, site_dir)

    status = "[DRY RUN] " if dry_run else ""
    print(f"\n  {status}✅ {generated} pages générées, {skipped} ignorées")
    if not dry_run:
        print(f"  📁 Output : {output_dir}")


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Générateur de sites comparatifs statiques"
    )
    parser.add_argument("--site", help="Slug du site à générer (ex: poussettes)")
    parser.add_argument("--all", action="store_true", help="Générer tous les sites")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Affiche les pages qui seraient générées sans écrire de fichiers"
    )
    parser.add_argument(
        "--pair", help="Générer une seule paire (ex: yoyo-2,cybex-balios-s)"
    )
    args = parser.parse_args()

    filter_pair = None
    if args.pair:
        parts = args.pair.split(",")
        if len(parts) != 2:
            print("❌ --pair doit contenir exactement 2 slugs séparés par une virgule")
            sys.exit(1)
        filter_pair = tuple(sorted(parts))

    if args.all:
        for site_dir in sorted(SITES_DIR.iterdir()):
            if site_dir.is_dir() and not site_dir.name.startswith("_"):
                generate_site(site_dir.name, dry_run=args.dry_run, filter_pair=filter_pair)
    elif args.site:
        generate_site(args.site, dry_run=args.dry_run, filter_pair=filter_pair)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
