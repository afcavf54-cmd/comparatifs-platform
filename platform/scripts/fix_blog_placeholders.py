#!/usr/bin/env python3
"""
fix_blog_placeholders.py — Script one-shot de nettoyage des placeholders
{Month}, {year}, etc. dans les fichiers .md déjà publiés.

Pour chaque .md du blog d'un site donné :
  1. Lit la date `date:` du frontmatter (date de publication de l'article)
  2. Substitue les placeholders ({Month}, {year}, {month}, ...) dans :
     - title (frontmatter)
     - meta_title (frontmatter)
     - meta_description (frontmatter)
     - body (le corps de l'article)
  3. Réécrit le .md si modifié

Le script est IDEMPOTENT : si un .md ne contient plus de placeholder,
il n'est pas réécrit (pas de modif de date côté git).

Usage :
    python3 fix_blog_placeholders.py <site-id>
    python3 fix_blog_placeholders.py <site-id> --dry-run     # voir ce qui changerait sans modifier

Exemples :
    python3 platform/scripts/fix_blog_placeholders.py cadeauclic-com
    python3 platform/scripts/fix_blog_placeholders.py cadeauclic-com --dry-run
"""
from __future__ import annotations
import sys
import re
from datetime import datetime
from pathlib import Path

import yaml

ROOT = Path(__file__).parent.parent
SITES_DIR = ROOT / "sites"

MOIS_FR_FULL = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"
]


def substitute_placeholders(text: str, dt: datetime) -> str:
    """Identique à blog_publish_scheduled.substitute_placeholders. Dupliqué
    ici pour que le script soit autonome (pas de dépendance d'import)."""
    if not text or "{" not in text:
        return text
    mois = MOIS_FR_FULL[dt.month - 1]
    repl = {
        "{year}": str(dt.year),
        "{YEAR}": str(dt.year),
        "{Year}": str(dt.year),
        "{Month}": mois.capitalize(),
        "{month}": mois,
        "{MONTH}": mois.upper(),
        "{month_num}": f"{dt.month:02d}",
    }
    out = text
    for k, v in repl.items():
        if k in out:
            out = out.replace(k, v)
    return out


def parse_frontmatter(raw: str) -> tuple[dict, str] | None:
    """Sépare frontmatter et body d'un .md. Retourne (fm_dict, body) ou None
    si pas de frontmatter détecté."""
    if not raw.startswith("---"):
        return None
    end_idx = raw.find("---", 3)
    if end_idx < 0:
        return None
    fm_text = raw[3:end_idx]
    body = raw[end_idx + 3:].lstrip("\n")
    try:
        fm = yaml.safe_load(fm_text) or {}
        if not isinstance(fm, dict):
            return None
    except Exception:
        return None
    return fm, body


def serialize_post(fm: dict, body: str) -> str:
    """Sérialise frontmatter + body en chaîne .md."""
    fm_yaml = yaml.dump(
        fm,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
        width=10000,
    ).strip()
    return f"---\n{fm_yaml}\n---\n\n{body}"


def has_placeholders(text: str) -> bool:
    """Détecte la présence de placeholders à substituer."""
    if not text:
        return False
    return bool(re.search(r"\{(year|YEAR|Year|Month|month|MONTH|month_num)\}", text))


def process_site(site_id: str, dry_run: bool = False) -> int:
    site_dir = SITES_DIR / site_id
    posts_dir = site_dir / "blog" / "posts"
    if not posts_dir.exists():
        print(f"❌ Pas de blog pour {site_id} (dossier {posts_dir} absent)")
        return 0

    md_files = sorted(posts_dir.glob("*.md"))
    print(f"📰 {site_id} — {len(md_files)} fichier(s) .md à scanner")
    if dry_run:
        print(f"🔍 MODE DRY-RUN : aucun fichier ne sera modifié")

    n_fixed = 0
    n_skipped = 0
    n_errors = 0

    for md_path in md_files:
        try:
            raw = md_path.read_text(encoding="utf-8")
        except Exception as e:
            print(f"  ❌ Erreur lecture {md_path.name} : {e}")
            n_errors += 1
            continue

        parsed = parse_frontmatter(raw)
        if not parsed:
            n_skipped += 1
            continue
        fm, body = parsed

        # Date de référence : celle du frontmatter, ou fallback "aujourd'hui"
        # (peu probable d'avoir un .md sans date côté blog cron).
        date_raw = fm.get("date") or ""
        dt = None
        if date_raw:
            # date peut être ISO avec tz : 2026-06-15T09:00:00+02:00
            for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
                try:
                    dt = datetime.strptime(date_raw.split("+")[0].split("Z")[0], fmt.replace("%z", ""))
                    break
                except ValueError:
                    continue
        if dt is None:
            print(f"  ⚠ Date introuvable dans {md_path.name}, fallback today")
            dt = datetime.now()

        # Substituer dans frontmatter et body
        changed = False
        for key in ("title", "meta_title", "meta_description"):
            v = fm.get(key)
            if isinstance(v, str) and has_placeholders(v):
                new_v = substitute_placeholders(v, dt)
                if new_v != v:
                    fm[key] = new_v
                    changed = True

        new_body = body
        if has_placeholders(body):
            new_body = substitute_placeholders(body, dt)
            if new_body != body:
                changed = True

        if not changed:
            n_skipped += 1
            continue

        title_short = (fm.get("title") or md_path.name)[:60]
        print(f"  ✓ {md_path.name} → {title_short}")
        if not dry_run:
            new_content = serialize_post(fm, new_body)
            md_path.write_text(new_content, encoding="utf-8")
        n_fixed += 1

    print()
    print(f"━━━ Récap ━━━")
    print(f"  ✓ Fixés : {n_fixed}")
    print(f"  ⏭ Skip (rien à changer) : {n_skipped}")
    if n_errors:
        print(f"  ❌ Erreurs : {n_errors}")
    if dry_run and n_fixed > 0:
        print(f"\n  ℹ Relance sans --dry-run pour appliquer.")
    return n_fixed


def main():
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    args = [a for a in args if not a.startswith("--")]
    if not args:
        print("Usage : python3 fix_blog_placeholders.py <site-id> [--dry-run]")
        print("Exemple : python3 fix_blog_placeholders.py cadeauclic-com")
        sys.exit(2)
    site_id = args[0]
    n = process_site(site_id, dry_run=dry_run)
    sys.exit(0 if n >= 0 else 1)


if __name__ == "__main__":
    main()
