#!/usr/bin/env python3
"""Backfill ponctuel : ajoute `created` (date de PREMIÈRE publication) à chaque
entrée des dates.json, reconstituée depuis l'historique git.

Le journal des comparateurs affichait la date de dernière modif (qui saute à
aujourd'hui à chaque déploiement : un changement de template re-date tout le
HTML). On fige donc la vraie date de création. À lancer UNE fois ; ensuite
generate.py maintient `created` tout seul.

  python platform/scripts/backfill_created_dates.py          # tous les sites
  python platform/scripts/backfill_created_dates.py --site creaone-fr
"""
import argparse
import json
import subprocess
from pathlib import Path

PLATFORM = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[2]
SITES = PLATFORM / "sites"


def _git(args):
    return subprocess.check_output(["git", *args], cwd=str(REPO),
                                   stderr=subprocess.DEVNULL).decode("utf-8", "replace")


def first_seen_map(rel_path: str) -> dict:
    """{clé dates.json -> date ISO (AAAA-MM-JJTHH:MM) de 1ère apparition}."""
    seen: dict = {}
    try:
        log = _git(["log", "--reverse", "--format=%H\t%cI", "--", rel_path])
    except Exception:
        return seen
    for line in log.splitlines():
        if "\t" not in line:
            continue
        sha, iso = line.split("\t", 1)
        when = iso[:16]  # AAAA-MM-JJTHH:MM
        try:
            content = _git(["show", f"{sha}:{rel_path}"])
            data = json.loads(content)
        except Exception:
            continue
        for key in data.keys():
            if key not in seen:
                seen[key] = when
    return seen


def process_site(site_dir: Path) -> int:
    dj = site_dir / "dates.json"
    if not dj.exists():
        return 0
    try:
        data = json.loads(dj.read_text(encoding="utf-8"))
    except Exception:
        return 0
    rel = f"platform/sites/{site_dir.name}/dates.json"
    seen = first_seen_map(rel)
    changed = 0
    for key, rec in data.items():
        if not isinstance(rec, dict) or rec.get("created"):
            continue
        created = seen.get(key) or rec.get("datetime") or rec.get("date")
        if created:
            rec["created"] = created
            changed += 1
    if changed:
        dj.write_text(json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False),
                      encoding="utf-8")
    print(f"  {site_dir.name}: {changed} entrée(s) datée(s)")
    return changed


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site")
    a = ap.parse_args()
    sites = ([SITES / a.site] if a.site else
             sorted(p for p in SITES.iterdir() if p.is_dir() and p.name != "_shared"))
    total = sum(process_site(s) for s in sites if (s / "dates.json").exists())
    print(f"\n✓ {total} entrée(s) backfillée(s) sur {len(sites)} site(s)")


if __name__ == "__main__":
    main()
