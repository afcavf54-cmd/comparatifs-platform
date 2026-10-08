#!/usr/bin/env python3
"""Synchronise le référentiel backlinks depuis TOUS les Sheets de comparateurs.

Indépendant du drafting : lit le Sheet de chaque site (comparators_sheet_csv_url),
collecte TOUTES les URLs de marques (format « Nom | url »), et les fusionne EN
AJOUT dans platform/backlink-settings.json. Corrige le fait qu'une URL ajoutée
au Sheet d'un comparateur DÉJÀ en ligne n'était jamais relue (le build quotidien
ne lit que les comparateurs non rédigés), et complète le référentiel même pour
les sites 100 % publiés. Un seul run, un seul commit → aucune collision.

  python platform/scripts/sync_backlink_urls.py            # tous les sites
  python platform/scripts/sync_backlink_urls.py --site creaone-fr
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_comparators import fetch_csv, parse_brands, norm, _row_get, _fix_mojibake  # noqa: E402

import yaml  # noqa: E402

PLATFORM = Path(__file__).resolve().parents[1]
SITES = PLATFORM / "sites"
BL = PLATFORM / "backlink-settings.json"


def _sheet_url(cfg: dict) -> str:
    s = cfg.get("site") or {}
    return (cfg.get("comparators_sheet_csv_url") or s.get("comparators_sheet_csv_url") or "").strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", help="un site précis (sinon : tous)")
    a = ap.parse_args()

    site_dirs = ([SITES / a.site] if a.site else
                 sorted(p for p in SITES.iterdir() if p.is_dir() and p.name != "_shared"))

    collected: dict = {}   # norm(nom) -> (nom, url)
    for site_dir in site_dirs:
        cfg_path = site_dir / "config.yaml"
        if not cfg_path.exists():
            continue
        try:
            cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
        except Exception:
            continue
        url = _sheet_url(cfg)
        if not url:
            continue
        rows = fetch_csv(url)
        n = 0
        for row in rows:
            for b in parse_brands(_fix_mojibake(_row_get(row, "Marques"))):
                bu = (b.get("url") or "").strip()
                if bu:
                    collected[norm(b["name"])] = (b["name"], bu)
                    n += 1
        print(f"  {site_dir.name}: {len(rows)} ligne(s), {n} URL(s) de marque")

    # Fusion EN AJOUT dans le référentiel (jamais de suppression).
    bl = {}
    if BL.exists():
        try:
            bl = json.loads(BL.read_text(encoding="utf-8"))
        except Exception:
            bl = {}
    bl.setdefault("brands", {})
    existing = {norm(k): k for k in bl["brands"]}
    added = filled = 0
    for nkey, (name, url) in collected.items():
        k = existing.get(nkey)
        if k is None:
            bl["brands"][name] = url
            existing[nkey] = name
            added += 1
        elif not str(bl["brands"].get(k) or "").strip():
            bl["brands"][k] = url
            filled += 1

    BL.write_text(json.dumps(bl, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ référentiel backlinks : {len(bl['brands'])} marques "
          f"(+{added} ajoutée(s), {filled} URL(s) complétée(s))")


if __name__ == "__main__":
    main()
