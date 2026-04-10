#!/usr/bin/env python3
"""
generate.py — Générateur de sites comparatifs statiques
Source données : Google Sheets CSV (priorité) ou products.yaml (fallback)
Templates : Jinja2 · Deploy : Cloudflare Pages via GitHub Actions

Usage :
    python scripts/generate.py --site scpi
    python scripts/generate.py --site scpi --dry-run
    python scripts/generate.py --site scpi --pair remake-live,iroko-zen
    python scripts/generate.py --all
"""

import argparse
import csv
import io
import itertools
import math
import shutil
import sys
import urllib.request
from datetime import date
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape

# ── Chemins ───────────────────────────────────────────────────────────────────
ROOT          = Path(__file__).parent.parent
TEMPLATES_DIR = ROOT / "templates"
SITES_DIR     = ROOT / "sites"
SHARED_DIR    = ROOT / "sites" / "_shared"


# ── Helpers ───────────────────────────────────────────────────────────────────
def load_yaml(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def cast(val: str):
    """Convertit une string CSV en int/float si possible, sinon str."""
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


def load_products_from_sheet(csv_url: str) -> list | None:
    """Charge les produits depuis Google Sheet CSV. Retourne None si indisponible."""
    try:
        print("  📥 Chargement Sheet CSV…")
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
            prod = {k.strip(): cast(v.strip()) for k, v in row.items() if k.strip()}
            if str(prod.get("disponible", "1")) == "0":
                continue
            products.append(prod)

        print(f"  ✓ Sheet : {len(products)} produits chargés")

        # Normalise les champs numériques (le CSV renvoie tout en string)
        NUMERIC_FIELDS = [
            "prix_achat", "prix_retrait", "td", "tri", "pga", "tof",
            "frais_souscription", "frais_gestion", "delai_jouissance",
            "endettement", "capitalisation", "disponible", "note_redaction"
        ]
        for prod in products:
            for field in NUMERIC_FIELDS:
                val = prod.get(field)
                if val is not None and val != "":
                    try:
                        prod[field] = float(str(val).replace(",", "."))
                    except (ValueError, TypeError):
                        pass

            # Construit verdict_si depuis les colonnes verdict_si_1/2/3
            # ou génère un fallback automatique si absent
            if "verdict_si" not in prod or not prod["verdict_si"]:
                vs = []
                for i in range(1, 4):
                    v = prod.get(f"verdict_si_{i}")
                    if v and str(v).strip():
                        vs.append(str(v).strip())
                if not vs:
                    # Fallback automatique basé sur les données disponibles
                    if prod.get("frais_souscription") == 0:
                        vs.append("Vous souhaitez éviter les frais d'entrée")
                    if prod.get("td") and float(prod.get("td", 0)) >= 7:
                        vs.append("Vous cherchez un rendement élevé")
                    if prod.get("delai_jouissance") and float(prod.get("delai_jouissance", 6)) <= 3:
                        vs.append("Vous voulez percevoir vos loyers rapidement")
                    vs.append("Vous souhaitez diversifier votre patrimoine immobilier")
                prod["verdict_si"] = vs

        return products

    except Exception as e:
        print(f"  ⚠ Sheet indisponible ({e}) → fallback products.yaml")
        return None


def build_seo(site: dict, seo_config: dict, prod_a: dict, prod_b: dict) -> dict:
    year = site["year"]
    return {
        "title": seo_config["title_pattern"]
            .replace("{A}", str(prod_a["nom"]))
            .replace("{B}", str(prod_b["nom"]))
            .replace("{year}", str(year)),
        "meta": seo_config["meta_pattern"]
            .replace("{A}", str(prod_a["nom"]))
            .replace("{B}", str(prod_b["nom"]))
            .replace("{year}", str(year)),
        "h1": seo_config["h1_pattern"]
            .replace("{A}", str(prod_a["nom"]))
            .replace("{B}", str(prod_b["nom"]))
            .replace("{year}", str(year)),
        "intro": seo_config["intro_pattern"]
            .replace("{A}", str(prod_a["nom"]))
            .replace("{B}", str(prod_b["nom"]))
            .replace("{prix_a}", f"{prod_a.get('prix', prod_a.get('prix_achat', ''))}€")
            .replace("{prix_b}", f"{prod_b.get('prix', prod_b.get('prix_achat', ''))}€"),
    }


def build_related_pages(slug_a: str, slug_b: str, products: list, max_items: int = 8) -> list:
    related = []
    for p in products:
        s = p["slug"]
        if s in (slug_a, slug_b):
            continue
        related.append({
            "url":   f"{slug_a}-vs-{s}.html",
            "label": f"{products_by_slug(products, slug_a)['nom']} vs {p['nom']}"
        })
        if len(related) >= max_items:
            break
    return related


def products_by_slug(products: list, slug: str) -> dict:
    return next((p for p in products if p["slug"] == slug), None)


def generate_sitemap(site: dict, pairs: list, output_dir: Path) -> None:
    domain = site["domain"]
    base   = site["base_path"].rstrip("/")
    today  = date.today().isoformat()
    lines  = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        f'  <url><loc>{domain}{base}/</loc><priority>1.0</priority></url>',
    ]
    for slug_a, slug_b in pairs:
        lines.append(
            f'  <url><loc>{domain}{base}/{slug_a}-vs-{slug_b}</loc>'
            f'<lastmod>{today}</lastmod>'
            f'<changefreq>monthly</changefreq>'
            f'<priority>0.8</priority></url>'
        )
    lines.append("</urlset>")
    (output_dir / "sitemap.xml").write_text("\n".join(lines), encoding="utf-8")
    print(f"  ✓ sitemap.xml ({len(pairs)} URLs)")


def copy_shared_assets(output_dir: Path, site_dir: Path) -> None:
    for source_dir in [site_dir, SHARED_DIR]:
        js_src = source_dir / "sheets.js"
        if js_src.exists():
            shutil.copy2(js_src, output_dir / "sheets.js")
            print(f"  ✓ sheets.js copié depuis {source_dir.name}/")
            return
    print("  ⚠ sheets.js introuvable")


# ── Générateur principal ───────────────────────────────────────────────────────
def generate_site(site_slug: str, dry_run: bool = False, filter_pair: tuple = None) -> None:
    site_dir = SITES_DIR / site_slug
    if not site_dir.exists():
        print(f"❌ Site introuvable : {site_dir}")
        sys.exit(1)

    config        = load_yaml(site_dir / "config.yaml")
    products_yaml = load_yaml(site_dir / "products.yaml")

    site     = config["site"]
    theme    = config["theme"]
    criteria = config["criteria"]

    print(f"\n🚀 Génération site : {site_slug}")

    # ── Produits : Sheet CSV en priorité, YAML en fallback ──────────────────
    sheet_url = site.get("sheet_csv_url", "")
    products  = None

    if sheet_url and not dry_run:
        products = load_products_from_sheet(sheet_url)

    if products is None:
        products = products_yaml.get("products", [])
        src = "products.yaml" if not sheet_url else "products.yaml (fallback)"
        print(f"  📦 {len(products)} produits depuis {src}")

    print(f"   {len(products)} produits → {math.comb(len(products), 2)} paires")

    # ── Jinja2 ──────────────────────────────────────────────────────────────
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["capitalize"] = lambda s: s.capitalize() if s else ""

    template_file = site.get("template", "comparatif-vs.html.j2")
    template      = env.get_template(template_file)
    print(f"  Template : {template_file}")

    output_dir = site_dir / "output"
    if not dry_run:
        output_dir.mkdir(exist_ok=True)

    # ── Paires ──────────────────────────────────────────────────────────────
    all_slugs = [p["slug"] for p in products]
    all_pairs = list(itertools.combinations(sorted(all_slugs), 2))

    if filter_pair:
        all_pairs = [p for p in all_pairs if set(p) == set(filter_pair)]

    generated = 0
    skipped   = 0

    for slug_a, slug_b in all_pairs:
        prod_a = products_by_slug(products, slug_a)
        prod_b = products_by_slug(products, slug_b)

        if not prod_a or not prod_b:
            print(f"  ⚠ Slug introuvable : {slug_a} ou {slug_b}")
            skipped += 1
            continue

        seo     = build_seo(site, config["seo"], prod_a, prod_b)
        related = build_related_pages(slug_a, slug_b, products)

        context = {
            "site":          {**site, "seo": config.get("seo", {})},
            "theme":         theme,
            "criteria":      criteria,
            "prod_a":        prod_a,
            "prod_b":        prod_b,
            "slug_a":        slug_a,
            "slug_b":        slug_b,
            "seo":           seo,
            "related_pages": related,
            "build_date":    date.today().isoformat(),
        }

        if dry_run:
            print(f"  [DRY] {slug_a}-vs-{slug_b}.html")
            generated += 1
            continue

        html = template.render(**context)
        (output_dir / f"{slug_a}-vs-{slug_b}.html").write_text(html, encoding="utf-8")
        generated += 1

    if not dry_run:
        generate_sitemap(site, all_pairs, output_dir)
        copy_shared_assets(output_dir, site_dir)

        # ── Home ──────────────────────────────────────────────────────────
        index_tpl_name = site.get("index_template", f"index-{site_slug}.html.j2")
        if (TEMPLATES_DIR / index_tpl_name).exists():
            zero_frais = sum(1 for p in products if str(p.get("frais_souscription", "99")) == "0")
            top_pairs  = [
                {
                    "url":   f"{a}-vs-{b}.html",
                    "label": f"{products_by_slug(products, a)['nom']} vs {products_by_slug(products, b)['nom']}"
                }
                for a, b in all_pairs[:8]
            ]
            html = env.get_template(index_tpl_name).render(
                site={**site, "seo": config.get("seo", {})},
                theme=theme,
                products=products,
                total_pairs=len(all_pairs),
                zero_frais_count=zero_frais,
                top_pairs=top_pairs,
                build_date=date.today().isoformat(),
            )
            (output_dir / "index.html").write_text(html, encoding="utf-8")
            print(f"  ✓ index.html ({len(products)} produits, {len(all_pairs)} comparatifs)")
        else:
            print(f"  ⚠ Template index introuvable : {index_tpl_name}")

        # ── Légales ───────────────────────────────────────────────────────
        for tpl_name, out_name in [
            ("mentions-legales.html.j2",         "mentions-legales.html"),
            ("politique-confidentialite.html.j2", "politique-confidentialite.html"),
        ]:
            if (TEMPLATES_DIR / tpl_name).exists():
                html = env.get_template(tpl_name).render(
                    site={**site, "seo": config.get("seo", {})},
                    theme=theme,
                    build_date=date.today().isoformat(),
                )
                (output_dir / out_name).write_text(html, encoding="utf-8")
                print(f"  ✓ {out_name}")

    status = "[DRY RUN] " if dry_run else ""
    print(f"\n  {status}✅ {generated} pages générées, {skipped} ignorées")
    if not dry_run:
        print(f"  📁 Output : {output_dir}")


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Générateur comparatifs statiques")
    parser.add_argument("--site",    help="Slug du site (ex: scpi)")
    parser.add_argument("--all",     action="store_true", help="Génère tous les sites")
    parser.add_argument("--dry-run", action="store_true", help="Simule sans écrire")
    parser.add_argument("--pair",    help="Filtre une paire (ex: remake-live,iroko-zen)")
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
