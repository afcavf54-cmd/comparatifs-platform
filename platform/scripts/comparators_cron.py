#!/usr/bin/env python3
"""Cron — publication programmée des comparateurs en masse.

Pour chaque site ayant un `comparators_sheet_csv_url`, lit son Sheet et repère
les lignes dont la date de publication est arrivée (date <= aujourd'hui) et qui
ne sont PAS encore présentes dans editorial.json. Les sites concernés sont
listés dans la sortie GitHub `sites_to_deploy` ; le workflow déclenche alors
generate-scpi.yml pour chacun (build_comparators y génère les comparateurs dus,
puis generate.py rend et déploie).

Ce script ne génère rien lui-même (pas de clé API requise) : il détecte, c'est
tout. Déclenché quotidiennement par .github/workflows/comparators-cron.yml.
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path

import yaml

try:
    import requests
except ImportError:
    requests = None

SITES = Path(__file__).resolve().parents[1] / "sites"


def slugify(s: str) -> str:
    """Identique à build_comparators.slugify / generate.slugify_cat."""
    s = str(s or "").replace("\u2019", " ").replace("\u2018", " ").replace("'", " ")
    s = re.sub(r"[()\[\]]", "", s)
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def fetch_csv(url: str) -> list[dict]:
    if not requests:
        print("  ⚠ requests manquant")
        return []
    if "/pubhtml" in url:
        url = re.sub(r"/pubhtml.*$", "/pub?output=csv", url)
    elif "output=csv" not in url:
        url += ("&" if "?" in url else "?") + "output=csv"
    try:
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        r.encoding = "utf-8"   # évite le mojibake (é→Ã©) qui crée des slugs/doublons erronés
        return list(csv.DictReader(io.StringIO(r.text)))
    except Exception as e:
        print(f"  ⚠ fetch Sheet : {e}")
        return []


def comparators_url(cfg: dict) -> str:
    """L'URL vit sous `site:` dans le config.yaml (comme blog_sheet_csv_url)."""
    s = cfg.get("site") or {}
    return (cfg.get("comparators_sheet_csv_url")
            or s.get("comparators_sheet_csv_url") or "").strip()


def due_titles(site_dir: Path, url: str) -> list[str]:
    """Titres dont la date <= aujourd'hui et absents de l'editorial."""
    rows = fetch_csv(url)
    if not rows:
        return []
    editorial: dict = {}
    ed_path = site_dir / "editorial.json"
    if ed_path.exists():
        try:
            editorial = json.loads(ed_path.read_text(encoding="utf-8"))
        except Exception:
            editorial = {}
    today = date.today()
    due: list[str] = []
    for row in rows:
        titre = (row.get("Titre") or row.get("titre") or "").strip()
        marques = (row.get("Marques") or row.get("marques") or "").strip()
        d = (row.get("Date") or row.get("date") or "").strip()
        if not titre or not marques:
            continue
        if d:  # date future → pas encore dû
            try:
                if datetime.strptime(d[:10], "%Y-%m-%d").date() > today:
                    continue
            except ValueError:
                pass  # date non parsable → considéré comme dû
        if f"classement-{slugify(titre)}" not in editorial:
            due.append(titre)
    return due


def main() -> None:
    to_deploy: list[str] = []
    for site_dir in sorted(p for p in SITES.iterdir() if p.is_dir() and p.name != "_shared"):
        cfg_path = site_dir / "config.yaml"
        if not cfg_path.exists():
            continue
        try:
            cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
        except Exception:
            continue
        url = comparators_url(cfg)
        if not url:
            continue
        due = due_titles(site_dir, url)
        if due:
            print(f"  ✅ {site_dir.name} : {len(due)} à publier → {', '.join(due)}")
            to_deploy.append(site_dir.name)
        else:
            print(f"  · {site_dir.name} : rien de nouveau")

    line = f"sites_to_deploy={','.join(to_deploy)}"
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    print(line)


if __name__ == "__main__":
    main()
