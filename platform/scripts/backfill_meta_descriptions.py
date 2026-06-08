#!/usr/bin/env python3
"""
backfill_meta_descriptions.py — Régénère les meta descriptions trop courtes.

Pour chaque site (ou un site spécifique via SITE env) :
1. Scanne platform/sites/<site>/blog/posts/*.md
2. Pour chaque .md dont la meta_description est absente ou < THRESHOLD chars :
3. Régénère via Claude (avec retry si trop courte, cf. generate_meta_description)
4. Met à jour le frontmatter

Variables d'env :
    ANTHROPIC_API_KEY    requise
    LIMIT                nombre max à régénérer (défaut 100, garde-fou)
    SITE                 optionnel, limite à un site (sinon tous)
    DRY_RUN              si "1", n'appelle pas Claude, juste log
    THRESHOLD            longueur min en caractères (défaut 130)

Output (GITHUB_OUTPUT) :
    sites_to_deploy=<site1>,<site2>,...
    metas_regenerated=<n>

Coût estimé : ~$0.003 par meta avec Claude Sonnet 4 (avec retry inclus).
"""
from __future__ import annotations
import os
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).parent.parent
SITES_DIR = ROOT / "sites"

# Réutilise la fonction generate_meta_description du cron principal pour
# bénéficier automatiquement de toute amélioration future (retry, prompt
# renforcé, etc.) sans avoir à dupliquer le code.
sys.path.insert(0, str(Path(__file__).parent))
try:
    from blog_publish_scheduled import generate_meta_description  # type: ignore
except Exception as e:
    print(f"❌ Impossible d'importer blog_publish_scheduled : {e}")
    sys.exit(1)


def _parse_md_frontmatter(md_path: Path):
    try:
        raw = md_path.read_text(encoding="utf-8")
    except Exception:
        return None
    if not raw.startswith("---"):
        return None
    end_idx = raw.find("---", 3)
    if end_idx < 0:
        return None
    fm_text = raw[3:end_idx]
    try:
        fm = yaml.safe_load(fm_text) or {}
    except Exception:
        return None
    if not isinstance(fm, dict):
        return None
    body = raw[end_idx + 3:].lstrip("\n")
    return fm, body


def _write_md(md_path: Path, fm: dict, body: str) -> None:
    fm_yaml = yaml.dump(fm, allow_unicode=True, default_flow_style=False,
                         sort_keys=False, width=10000).strip()
    content = f"---\n{fm_yaml}\n---\n\n{body}\n"
    md_path.write_text(content, encoding="utf-8")


def process_site(site_id: str, site_dir: Path, limit_remaining: int,
                  threshold: int, dry_run: bool) -> tuple[int, int]:
    posts_dir = site_dir / "blog" / "posts"
    if not posts_dir.exists():
        return 0, limit_remaining
    md_files = sorted(posts_dir.glob("*.md"))
    if not md_files:
        return 0, limit_remaining

    n_regenerated = 0
    n_skipped_ok = 0
    n_failed = 0

    print(f"\n📂 {site_id} ({len(md_files)} articles)")

    for md_path in md_files:
        if limit_remaining <= 0:
            print(f"   ⏹ Limite atteinte")
            break
        result = _parse_md_frontmatter(md_path)
        if result is None:
            continue
        fm, body = result
        title = (fm.get("title") or "").strip()
        if not title:
            continue

        current_meta = (fm.get("meta_description") or "").strip()
        if len(current_meta) >= threshold:
            n_skipped_ok += 1
            continue

        # body est en HTML (cf. generate_article_html) → directement utilisable
        # comme content_html pour generate_meta_description
        print(f"   ✏  {md_path.stem[:60]} — meta {len(current_meta)} car...", end=" ", flush=True)
        if dry_run:
            print("(DRY-RUN)")
            n_regenerated += 1
            limit_remaining -= 1
            continue

        try:
            new_meta = generate_meta_description(title, body)
        except Exception as e:
            print(f"❌ {e}")
            n_failed += 1
            continue

        if not new_meta:
            print(f"⚠ vide retournée")
            n_failed += 1
            continue
        if len(new_meta) < threshold:
            # On garde quand même si meilleure que l'actuelle, sinon skip
            if len(new_meta) > len(current_meta):
                fm["meta_description"] = new_meta
                _write_md(md_path, fm, body)
                print(f"⚠ {len(new_meta)} car. (toujours sous seuil mais mieux qu'avant)")
                n_regenerated += 1
                limit_remaining -= 1
            else:
                print(f"⚠ pas mieux ({len(new_meta)} car.) - skip")
                n_failed += 1
            continue

        fm["meta_description"] = new_meta
        _write_md(md_path, fm, body)
        print(f"✓ {len(new_meta)} car.")
        n_regenerated += 1
        limit_remaining -= 1

    if n_regenerated or n_skipped_ok or n_failed:
        print(f"   📊 Bilan : {n_regenerated} régénérées | {n_skipped_ok} déjà OK | {n_failed} échecs")
    return n_regenerated, limit_remaining


def main():
    try:
        limit = int(os.environ.get("LIMIT", "100") or "100")
    except ValueError:
        limit = 100
    try:
        threshold = int(os.environ.get("THRESHOLD", "130") or "130")
    except ValueError:
        threshold = 130
    site_filter = (os.environ.get("SITE") or "").strip()
    dry_run = os.environ.get("DRY_RUN") == "1"

    print(f"📝 Backfill meta descriptions")
    print(f"   Seuil : < {threshold} caractères = à régénérer")
    print(f"   Limite : {limit} meta(s) max")
    print(f"   Dry-run : {dry_run}")
    if site_filter:
        print(f"   Site : {site_filter}")
    else:
        print(f"   Site : tous")

    if not dry_run and not os.environ.get("ANTHROPIC_API_KEY"):
        print("❌ ANTHROPIC_API_KEY absente. Stop.")
        sys.exit(1)

    sites_processed: list[str] = []
    total_regenerated = 0
    limit_remaining = limit

    for site_dir in sorted(SITES_DIR.iterdir()):
        if not site_dir.is_dir() or site_dir.name.startswith("_"):
            continue
        if site_filter and site_dir.name != site_filter:
            continue
        if limit_remaining <= 0:
            print(f"\n⏹ Limite globale atteinte ({limit})")
            break
        n, limit_remaining = process_site(site_dir.name, site_dir,
                                            limit_remaining, threshold, dry_run)
        if n > 0:
            sites_processed.append(site_dir.name)
            total_regenerated += n

    print(f"\n=== Résumé ===")
    print(f"✅ {total_regenerated} meta(s) régénérée(s)")
    if sites_processed:
        print(f"   Sites concernés : {', '.join(sites_processed)}")
    else:
        print("   Aucun site modifié")

    gh_output = os.environ.get("GITHUB_OUTPUT", "")
    if gh_output:
        with open(gh_output, "a", encoding="utf-8") as f:
            f.write(f"sites_to_deploy={','.join(sites_processed)}\n")
            f.write(f"metas_regenerated={total_regenerated}\n")


if __name__ == "__main__":
    main()
