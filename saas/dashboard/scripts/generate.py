#!/usr/bin/env python3
"""
generate.py v2 — Lit depuis Supabase (ou YAML local en fallback)
Usage :
    python scripts/generate.py --site poussettes
    python scripts/generate.py --all
    python scripts/generate.py --site poussettes --source yaml   # fallback local
"""

import argparse
import itertools
import json
import math
import os
import sys
from datetime import date
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT         = Path(__file__).parent.parent
TEMPLATES_DIR = ROOT / "templates"
SITES_DIR     = ROOT / "sites"

# ── Source Supabase ───────────────────────────────────────────
SUPABASE_URL     = os.environ.get("SUPABASE_URL", "")
SUPABASE_API_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

def fetch_from_supabase(table: str, params: dict = {}) -> list:
    """Lit une table Supabase via REST."""
    try:
        import urllib.request
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        url = f"{SUPABASE_URL}/rest/v1/{table}?{qs}"
        req = urllib.request.Request(url, headers={
            "apikey": SUPABASE_API_KEY,
            "Authorization": f"Bearer {SUPABASE_API_KEY}",
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read())
    except Exception as e:
        print(f"  ⚠ Supabase inaccessible ({e}) — fallback YAML")
        return []

def load_site_from_supabase(slug: str) -> dict | None:
    rows = fetch_from_supabase("sites", {"slug": f"eq.{slug}", "limit": "1"})
    return rows[0] if rows else None

def load_products_from_supabase(site_id: str) -> list:
    return fetch_from_supabase("products", {
        "site_id": f"eq.{site_id}",
        "active": "eq.true",
        "order": "nom",
    })

# ── Source YAML (fallback local) ──────────────────────────────
def load_yaml(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)

def supabase_site_to_config(site: dict) -> dict:
    """Convertit un objet Supabase site → format config attendu par le template."""
    return {
        "site": {
            "slug":          site["slug"],
            "name":          site["name"],
            "domain":        f"https://www.{site['domain']}",
            "base_path":     site["base_path"],
            "logo_text":     site["name"].split()[0],
            "logo_accent":   site["name"].split()[-1] if len(site["name"].split()) > 1 else "",
            "year":          site["seo_year"],
            "sheet_csv_url": site.get("sheet_csv_url", ""),
            "analytics_clicky": site.get("analytics_id", ""),
            "seo": {
                "title_pattern":    "Poussette {A} vs {B} : comparatif + avis {year}",
                "meta_pattern":     "Comparatif complet {A} vs {B} : prix, avis, confort. Découvrez la meilleure poussette en {year}.",
                "h1_pattern":       "Poussette <em>{A}</em> vs <em>{B}</em> :<br>laquelle choisir en {year} ?",
                "intro_pattern":    "Vous hésitez entre la <strong>{A}</strong> ({prix_a}) et la <strong>{B}</strong> ({prix_b}) ? Ce comparatif analyse les deux modèles sur tous les critères qui comptent.",
                "eyebrow":          "⚖️ Comparatif {year}",
                "category_label":   f"Comparatifs {site['slug']}",
                "category_url":     "index.html#comparatifs",
            }
        },
        "theme": {
            "accent":       site["accent"],
            "accent2":      site["accent2"],
            "bg":           site["bg"],
            "ink":          site["ink"],
            "surface":      "#FFFFFF",
            "font_title":   site["font_title"],
            "font_body":    site["font_body"],
            "google_fonts": f"https://fonts.googleapis.com/css2?family={site['font_title'].replace(' ', '+')}:ital@0;1&family={site['font_body']}:wght@300;400;500;600&display=swap",
        },
        "seo": {
            "title_pattern":  "Poussette {A} vs {B} : comparatif + avis {year}",
            "meta_pattern":   "Comparatif complet {A} vs {B} : prix, avis, confort en {year}.",
            "h1_pattern":     "Poussette <em>{A}</em> vs <em>{B}</em> :<br>laquelle choisir en {year} ?",
            "intro_pattern":  "Vous hésitez entre la <strong>{A}</strong> ({prix_a}) et la <strong>{B}</strong> ({prix_b}) ?",
            "eyebrow":        "⚖️ Comparatif {year}",
            "category_label": f"Comparatifs {site['slug']}",
            "category_url":   "index.html#comparatifs",
        },
        "criteria": [
            {"label": "Prix indicatif", "field": "prix",        "type": "price"},
            {"label": "Type",           "field": "type",        "type": "tag"},
            {"label": "Poids",          "field": "poids",       "type": "text", "suffix": " kg"},
            {"label": "Âge recommandé", "field": "age",         "type": "text"},
            {"label": "Maniabilité",    "field": "note_manip",  "type": "stars"},
            {"label": "Confort bébé",   "field": "note_confort","type": "stars"},
            {"label": "Facilité pliage","field": "note_pliage", "type": "stars"},
            {"label": "Siège auto",     "field": "siege_auto",  "type": "bool"},
            {"label": "Avis Amazon",    "field": "note_amazon", "type": "text", "suffix": "/5"},
        ],
    }

# ── Helpers partagés ──────────────────────────────────────────
def build_seo(site, seo_config, prod_a, prod_b):
    year = str(site["year"])
    def fmt(s): return (s
        .replace("{A}", prod_a["nom"])
        .replace("{B}", prod_b["nom"])
        .replace("{year}", year)
        .replace("{prix_a}", f"{prod_a['prix']}€")
        .replace("{prix_b}", f"{prod_b['prix']}€"))
    return {
        "title": fmt(seo_config["title_pattern"]),
        "meta":  fmt(seo_config["meta_pattern"]),
        "h1":    fmt(seo_config["h1_pattern"]),
        "intro": fmt(seo_config["intro_pattern"]),
    }

def products_by_slug(products, slug):
    return next((p for p in products if p["slug"] == slug), None)

def build_related(slug_a, slug_b, products, max_items=8):
    related = []
    prod_a = products_by_slug(products, slug_a)
    for p in products:
        if p["slug"] in (slug_a, slug_b): continue
        related.append({"url": f"{slug_a}-vs-{p['slug']}.html", "label": f"{prod_a['nom']} vs {p['nom']}"})
        if len(related) >= max_items: break
    return related

def generate_sitemap(site, pairs, output_dir):
    domain   = site["domain"]
    base     = site["base_path"].rstrip("/")
    today    = date.today().isoformat()
    lines    = ['<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                f'  <url><loc>{domain}{base}/</loc><priority>1.0</priority></url>']
    for a, b in pairs:
        lines.append(f'  <url><loc>{domain}{base}/{a}-vs-{b}</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>')
    lines.append("</urlset>")
    (output_dir / "sitemap.xml").write_text("\n".join(lines), encoding="utf-8")
    print(f"  ✓ sitemap.xml ({len(pairs)} URLs)")

# ── Générateur ────────────────────────────────────────────────
def generate_site(site_slug, dry_run=False, source="auto", filter_pair=None):
    print(f"\n🚀 Génération : {site_slug} (source={source})")

    config   = None
    products = []

    # Tentative Supabase
    if source in ("auto", "supabase") and SUPABASE_URL:
        sb_site = load_site_from_supabase(site_slug)
        if sb_site:
            config   = supabase_site_to_config(sb_site)
            products = load_products_from_supabase(sb_site["id"])
            print(f"  ✓ Supabase : {len(products)} produits")

    # Fallback YAML
    if not config:
        site_dir = SITES_DIR / site_slug
        if not site_dir.exists():
            print(f"❌ Site introuvable : {site_dir}"); sys.exit(1)
        config_raw   = load_yaml(site_dir / "config.yaml")
        products_raw = load_yaml(site_dir / "products.yaml")
        config   = config_raw
        products = products_raw["products"]
        print(f"  ✓ YAML local : {len(products)} produits")

    site     = config["site"]
    theme    = config["theme"]
    criteria = config["criteria"]
    seo_cfg  = config.get("seo", site.get("seo", {}))

    pairs = list(itertools.combinations([p["slug"] for p in products], 2))
    if filter_pair:
        pairs = [p for p in pairs if set(p) == set(filter_pair)]

    print(f"  {len(products)} produits → {len(pairs)} paires")

    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True, lstrip_blocks=True,
    )
    env.filters["capitalize"] = lambda s: s.capitalize() if s else ""
    template = env.get_template("comparatif-vs.html.j2")

    output_dir = SITES_DIR / site_slug / "output"
    if not dry_run:
        output_dir.mkdir(exist_ok=True)

    generated = 0
    for slug_a, slug_b in pairs:
        prod_a = products_by_slug(products, slug_a)
        prod_b = products_by_slug(products, slug_b)
        if not prod_a or not prod_b: continue

        seo     = build_seo(site, seo_cfg, prod_a, prod_b)
        related = build_related(slug_a, slug_b, products)
        context = dict(site={**site, "seo": seo_cfg}, theme=theme, criteria=criteria,
                       prod_a=prod_a, prod_b=prod_b, slug_a=slug_a, slug_b=slug_b,
                       seo=seo, related_pages=related, build_date=date.today().isoformat())

        if dry_run:
            print(f"  [DRY] {slug_a}-vs-{slug_b}.html")
        else:
            html = template.render(**context)
            (output_dir / f"{slug_a}-vs-{slug_b}.html").write_text(html, encoding="utf-8")
        generated += 1

    if not dry_run:
        generate_sitemap(site, pairs, output_dir)
        for src in [SITES_DIR / site_slug, SITES_DIR / "_shared"]:
            js = src / "sheets.js"
            if js.exists():
                import shutil; shutil.copy2(js, output_dir / "sheets.js"); break

    prefix = "[DRY] " if dry_run else ""
    print(f"\n  {prefix}✅ {generated} pages générées")
    if not dry_run: print(f"  📁 {output_dir}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--site")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--source", default="auto", choices=["auto","supabase","yaml"])
    parser.add_argument("--pair")
    args = parser.parse_args()

    filter_pair = tuple(sorted(args.pair.split(","))) if args.pair else None

    if args.all:
        for d in sorted(SITES_DIR.iterdir()):
            if d.is_dir() and not d.name.startswith("_"):
                generate_site(d.name, args.dry_run, args.source, filter_pair)
    elif args.site:
        generate_site(args.site, args.dry_run, args.source, filter_pair)
    else:
        parser.print_help(); sys.exit(1)

if __name__ == "__main__":
    main()
