#!/usr/bin/env python3
"""
Cleanup script — corrige les editorial.json gonflés par le bug d'injection
du dashboard classements (cf. fix de saas/dashboard/.../classements/page.tsx).

Avant fix dashboard, à chaque save, le dashboard injectait CHAQUE
`classement-prod-*` (top-level) dans CHAQUE entrée `classement-{cat_slug}`
comme clé `prod_{slug}` nichée. Résultat : 14 cat × 127 produits = 1 778
entrées dupliquées identiques par site → editorial.json à 3 MB+ au lieu
de ~250 KB.

Ce script strippe TOUS les `prod_*` nichés dans les `classement-{cat_slug}`,
en partant du principe qu'aucune ne reflète une édition utilisateur (vérifié
manuellement : toutes les entrées prod_* sont byte-identiques entre
catégories, donc 100% bogus).

Usage :
    python3 cleanup_editorial.py platform/sites/<slug>/editorial.json
    python3 cleanup_editorial.py --all   # nettoie tous les sites du repo

L'original est sauvegardé en <fichier>.bak avant écriture.
"""
import argparse
import json
import shutil
import sys
from pathlib import Path


def cleanup_file(path: Path, dry_run: bool = False) -> dict:
    """Strip prod_* nested keys from classement-{cat_slug} entries.
    Returns stats dict."""
    if not path.exists():
        return {"path": str(path), "error": "fichier introuvable"}

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    cleaned = {}
    removed = 0
    affected_cats = 0
    for key, value in data.items():
        if (
            key.startswith("classement-")
            and not key.startswith("classement-prod-")
            and isinstance(value, dict)
        ):
            kept = {k: v for k, v in value.items() if not k.startswith("prod_")}
            n_removed = len(value) - len(kept)
            if n_removed > 0:
                affected_cats += 1
                removed += n_removed
            cleaned[key] = kept
        else:
            cleaned[key] = value

    src_size = path.stat().st_size
    new_content = json.dumps(cleaned, ensure_ascii=False, indent=2)
    new_size = len(new_content.encode("utf-8"))

    stats = {
        "path": str(path),
        "src_size_kb": round(src_size / 1024, 1),
        "new_size_kb": round(new_size / 1024, 1),
        "reduction_pct": round((1 - new_size / src_size) * 100, 1) if src_size else 0,
        "removed_prod_entries": removed,
        "affected_categories": affected_cats,
    }

    if removed == 0:
        stats["status"] = "déjà propre"
        return stats

    if dry_run:
        stats["status"] = "[dry-run]"
        return stats

    backup = path.with_suffix(path.suffix + ".bak")
    shutil.copy2(path, backup)
    path.write_text(new_content, encoding="utf-8")
    stats["status"] = f"OK (backup → {backup.name})"
    return stats


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("path", nargs="?", help="chemin vers editorial.json (ou un répertoire site/)")
    ap.add_argument("--all", action="store_true", help="scan tout platform/sites/*/editorial.json")
    ap.add_argument("--dry-run", action="store_true", help="affiche les stats sans écrire")
    args = ap.parse_args()

    if args.all:
        repo = Path(__file__).resolve().parent.parent.parent
        sites_dir = repo / "platform" / "sites"
        if not sites_dir.exists():
            sites_dir = Path("platform/sites")
        targets = sorted(sites_dir.glob("*/editorial.json"))
    elif args.path:
        p = Path(args.path)
        if p.is_dir():
            p = p / "editorial.json"
        targets = [p]
    else:
        ap.print_help()
        sys.exit(1)

    print(f"\n  Cleanup editorial.json — {len(targets)} fichier(s)\n")
    print(f"  {'Fichier':<55} {'Avant':>10} {'Après':>10} {'Δ%':>6} {'Entrées':>9} {'Statut'}")
    print(f"  {'-'*55} {'-'*10} {'-'*10} {'-'*6} {'-'*9} {'-'*30}")
    total_removed = 0
    for t in targets:
        s = cleanup_file(t, dry_run=args.dry_run)
        if "error" in s:
            print(f"  {t.parent.name:<55} {'-':>10} {'-':>10} {'-':>6} {'-':>9} {s['error']}")
            continue
        site = t.parent.name
        print(f"  {site:<55} {s['src_size_kb']:>8} KB {s['new_size_kb']:>8} KB {s['reduction_pct']:>5}% {s['removed_prod_entries']:>9} {s['status']}")
        total_removed += s["removed_prod_entries"]
    print(f"\n  Total : {total_removed} entrées prod_* bogus supprimées\n")


if __name__ == "__main__":
    main()
