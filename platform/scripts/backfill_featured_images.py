#!/usr/bin/env python3
"""
backfill_featured_images.py — Génère les images à la une manquantes pour les
articles de blog déjà publiés.

Pour chaque site (ou un site spécifique via SITE env) :
1. Scanne platform/sites/<site>/blog/posts/*.md
2. Pour chaque .md sans `featured_image` dans le frontmatter ET sans fichier
   physique public/blog/<slug>/featured.jpg :
3. Génère l'image via OpenAI (gpt-image-1 quality low)
4. Sauve dans platform/sites/<site>/public/blog/<slug>/featured.jpg
5. Met à jour le frontmatter avec `featured_image: /blog/<slug>/featured.jpg`

Variables d'env :
    OPENAI_API_KEY    requise
    LIMIT             nombre max d'images à générer (défaut 50, garde-fou budget)
    SITE              optionnel, limite à un site (sinon tous)
    DRY_RUN           si "1", n'appelle pas OpenAI, juste log ce qui serait fait

Output (GITHUB_OUTPUT) :
    sites_to_deploy=<site1>,<site2>,...
    images_generated=<n>

Garde-fous :
- LIMIT par défaut à 50 pour ne pas exploser le budget OpenAI en cas de
  centaines d'articles sans image.
- Si un .md a déjà `featured_image` ou si le fichier physique existe, on skip.
- Si l'API OpenAI plante pour un article, on continue avec les suivants.
"""
from __future__ import annotations
import os
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).parent.parent
SITES_DIR = ROOT / "sites"

# Import du générateur d'image (depuis le même dossier scripts/)
sys.path.insert(0, str(Path(__file__).parent))
try:
    from _image_generator import generate_featured_image  # type: ignore
except Exception as e:
    print(f"❌ Impossible d'importer _image_generator : {e}")
    sys.exit(1)


def _extract_site_colors(config: dict) -> tuple[str, str, str]:
    """Identique à blog_publish_scheduled.py : extrait (primary, secondary, cta)
    du theme du config.yaml avec fallbacks raisonnables."""
    theme = config.get("theme") or {}
    primary = theme.get("accent") or theme.get("primary") or "#1E5F8B"
    secondary = theme.get("accent2") or theme.get("secondary") or "#FFB200"
    cta = theme.get("cta_color") or config.get("cta_color") or "#FF6B35"
    return primary, secondary, cta


def _parse_md_frontmatter(md_path: Path):
    """Lit un .md, retourne (frontmatter_dict, body) ou None si parse échoué."""
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
    """Écrit un .md avec frontmatter YAML + body, sans wrap des lignes longues."""
    fm_yaml = yaml.dump(fm, allow_unicode=True, default_flow_style=False,
                         sort_keys=False, width=10000).strip()
    content = f"---\n{fm_yaml}\n---\n\n{body}\n"
    md_path.write_text(content, encoding="utf-8")


def process_site(site_id: str, site_dir: Path, limit_remaining: int,
                 dry_run: bool) -> tuple[int, int]:
    """Génère les images manquantes pour un site.
    Retourne (n_generated, limit_remaining_after)."""
    config_path = site_dir / "config.yaml"
    if not config_path.exists():
        return 0, limit_remaining
    try:
        config = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    except Exception as e:
        print(f"   ⚠ {site_id} : config.yaml illisible ({e})")
        return 0, limit_remaining

    posts_dir = site_dir / "blog" / "posts"
    if not posts_dir.exists():
        return 0, limit_remaining

    md_files = sorted(posts_dir.glob("*.md"))
    if not md_files:
        return 0, limit_remaining

    primary, secondary, cta = _extract_site_colors(config)
    site_name = (config.get("site") or {}).get("name", "") or site_id

    n_generated = 0
    n_relinked = 0   # fichier physique existait déjà, juste frontmatter à mettre à jour
    n_already_ok = 0  # déjà bon, rien à faire

    print(f"\n📂 {site_id} ({len(md_files)} articles)")

    for md_path in md_files:
        if limit_remaining <= 0:
            print(f"   ⏹ Limite atteinte, arrêt")
            break
        result = _parse_md_frontmatter(md_path)
        if result is None:
            continue
        fm, body = result
        slug = fm.get("slug") or md_path.stem
        title = (fm.get("title") or "").strip()
        if not title:
            continue

        # Cas 1 : frontmatter contient déjà featured_image → rien à faire
        if fm.get("featured_image"):
            n_already_ok += 1
            continue

        # Cas 2 : le fichier physique existe déjà mais le frontmatter ne le
        # référence pas (cas où une génération antérieure a partiellement
        # marché). On met juste à jour le frontmatter, sans regénérer.
        img_path = site_dir / "public" / "blog" / slug / "featured.jpg"
        if img_path.exists():
            fm["featured_image"] = f"/blog/{slug}/featured.jpg"
            if not dry_run:
                _write_md(md_path, fm, body)
            n_relinked += 1
            continue

        # Cas 3 : génération réelle nécessaire
        print(f"   🎨 {slug} — '{title[:60]}'...", end=" ", flush=True)
        if dry_run:
            print("(DRY-RUN)")
            n_generated += 1
            limit_remaining -= 1
            continue

        try:
            jpg_bytes = generate_featured_image(
                site_name=site_name,
                primary_color=primary,
                secondary_color=secondary,
                cta_color=cta,
                article_title=title,
            )
        except Exception as e:
            print(f"❌ {e}")
            continue

        if not jpg_bytes:
            print("⚠ skip (aucune image générée)")
            continue

        img_path.parent.mkdir(parents=True, exist_ok=True)
        img_path.write_bytes(jpg_bytes)
        fm["featured_image"] = f"/blog/{slug}/featured.jpg"
        _write_md(md_path, fm, body)
        print(f"✓ ({len(jpg_bytes) // 1024} KB)")
        n_generated += 1
        limit_remaining -= 1

    total = n_generated + n_relinked + n_already_ok
    if total:
        print(f"   📊 Bilan : {n_generated} générées | {n_relinked} relinkées | {n_already_ok} déjà OK")
    return n_generated + n_relinked, limit_remaining


def main():
    try:
        limit = int(os.environ.get("LIMIT", "50") or "50")
    except ValueError:
        limit = 50
    site_filter = (os.environ.get("SITE") or "").strip()
    dry_run = os.environ.get("DRY_RUN") == "1"

    print(f"🎨 Backfill images à la une")
    print(f"   Limite : {limit} image(s) (garde-fou budget OpenAI)")
    print(f"   Dry-run : {dry_run}")
    if site_filter:
        print(f"   Site : {site_filter}")
    else:
        print(f"   Site : tous")

    if not dry_run and not os.environ.get("OPENAI_API_KEY"):
        print("❌ OPENAI_API_KEY absente. Stop.")
        sys.exit(1)

    sites_processed: list[str] = []
    total_generated = 0
    limit_remaining = limit

    for site_dir in sorted(SITES_DIR.iterdir()):
        if not site_dir.is_dir() or site_dir.name.startswith("_"):
            continue
        if site_filter and site_dir.name != site_filter:
            continue
        if limit_remaining <= 0:
            print(f"\n⏹ Limite globale atteinte ({limit}), arrêt")
            break
        n, limit_remaining = process_site(site_dir.name, site_dir,
                                           limit_remaining, dry_run)
        if n > 0:
            sites_processed.append(site_dir.name)
            total_generated += n

    print(f"\n=== Résumé ===")
    print(f"✅ {total_generated} image(s) traitée(s) (générées + relinkées)")
    if sites_processed:
        print(f"   Sites concernés : {', '.join(sites_processed)}")
    else:
        print("   Aucun site modifié")

    gh_output = os.environ.get("GITHUB_OUTPUT", "")
    if gh_output:
        with open(gh_output, "a", encoding="utf-8") as f:
            f.write(f"sites_to_deploy={','.join(sites_processed)}\n")
            f.write(f"images_generated={total_generated}\n")


if __name__ == "__main__":
    main()
