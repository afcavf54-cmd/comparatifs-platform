#!/usr/bin/env python3
"""
backfill_featured_images.py — Génère / régénère les images à la une.

Modes :
  - Normal     : génère uniquement les images manquantes (skip si déjà OK)
  - Force      : régénère TOUTES les images (utile pour passer de low à high
                 quality, ou après un changement de prompt)

Variables d'env :
    OPENAI_API_KEY       requise
    LIMIT                nombre max d'images à générer (défaut 50)
    SITE                 optionnel, limite à un site (sinon tous)
    DRY_RUN              si "1", n'appelle pas OpenAI, juste log
    FORCE_REGENERATE     si "1", régénère même les images existantes (et
                         supprime les anciens fichiers à l'ancien chemin
                         public/blog/<slug>/featured.jpg)

Nouveau pattern de nom : public/blog/<slug>.jpg (URL /blog/<slug>.jpg).
Ancien pattern (pré-juin 2026) : public/blog/<slug>/featured.jpg.
En mode FORCE_REGENERATE, les anciens fichiers sont supprimés (incl. le
dossier parent s'il devient vide).

Output (GITHUB_OUTPUT) :
    sites_to_deploy=<site1>,<site2>,...
    images_generated=<n>
"""
from __future__ import annotations
import os
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).parent.parent
SITES_DIR = ROOT / "sites"

sys.path.insert(0, str(Path(__file__).parent))
try:
    from _image_generator import generate_featured_image  # type: ignore
except Exception as e:
    print(f"❌ Impossible d'importer _image_generator : {e}")
    sys.exit(1)


def _extract_site_colors(config: dict) -> tuple[str, str, str]:
    theme = config.get("theme") or {}
    primary = theme.get("accent") or theme.get("primary") or "#1E5F8B"
    secondary = theme.get("accent2") or theme.get("secondary") or "#FFB200"
    cta = theme.get("cta_color") or config.get("cta_color") or "#FF6B35"
    return primary, secondary, cta


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


def _cleanup_old_image(site_dir: Path, slug: str) -> bool:
    """Supprime l'ancien fichier public/blog/<slug>/featured.jpg s'il existe,
    ainsi que son dossier parent s'il devient vide. Retourne True si quelque
    chose a été supprimé."""
    old_img = site_dir / "public" / "blog" / slug / "featured.jpg"
    if not old_img.exists():
        return False
    try:
        old_img.unlink()
    except Exception:
        return False
    # Tente de supprimer le dossier parent s'il est vide
    parent = old_img.parent
    try:
        if parent.exists() and not any(parent.iterdir()):
            parent.rmdir()
    except Exception:
        pass
    return True


def process_site(site_id: str, site_dir: Path, limit_remaining: int,
                 dry_run: bool, force: bool) -> tuple[int, int]:
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
    n_relinked = 0
    n_already_ok = 0
    n_old_cleaned = 0

    print(f"\n📂 {site_id} ({len(md_files)} articles){' [FORCE]' if force else ''}")

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

        # Nouveau chemin : public/blog/<slug>.jpg
        new_img_path = site_dir / "public" / "blog" / f"{slug}.jpg"
        new_url = f"/blog/{slug}.jpg"

        # Mode normal : skip si déjà OK
        if not force:
            if fm.get("featured_image"):
                n_already_ok += 1
                continue
            # Cas du fichier physique existant non référencé
            if new_img_path.exists():
                fm["featured_image"] = new_url
                if not dry_run:
                    _write_md(md_path, fm, body)
                n_relinked += 1
                continue
            # Cas ancien chemin existant : relink vers le nouveau pattern.
            # On ne supprime PAS l'ancien fichier en mode normal (l'URL
            # publique l'utilise peut-être encore). FORCE_REGENERATE est
            # le bon mode pour migrer.
            old_img_path = site_dir / "public" / "blog" / slug / "featured.jpg"
            if old_img_path.exists():
                fm["featured_image"] = f"/blog/{slug}/featured.jpg"
                if not dry_run:
                    _write_md(md_path, fm, body)
                n_relinked += 1
                continue

        # À partir d'ici, on génère (mode normal sans image OU mode force)
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

        # En mode force, nettoyer l'ancien fichier avant d'écrire le nouveau
        if force and _cleanup_old_image(site_dir, slug):
            n_old_cleaned += 1

        new_img_path.parent.mkdir(parents=True, exist_ok=True)
        new_img_path.write_bytes(jpg_bytes)
        fm["featured_image"] = new_url
        _write_md(md_path, fm, body)
        print(f"✓ ({len(jpg_bytes) // 1024} KB)")
        n_generated += 1
        limit_remaining -= 1

    total_touched = n_generated + n_relinked
    if total_touched or n_already_ok:
        parts = [f"{n_generated} générées", f"{n_relinked} relinkées",
                 f"{n_already_ok} déjà OK"]
        if n_old_cleaned:
            parts.append(f"{n_old_cleaned} anciens fichiers nettoyés")
        print(f"   📊 Bilan : " + " | ".join(parts))
    return total_touched, limit_remaining


def main():
    try:
        limit = int(os.environ.get("LIMIT", "50") or "50")
    except ValueError:
        limit = 50
    site_filter = (os.environ.get("SITE") or "").strip()
    dry_run = os.environ.get("DRY_RUN") == "1"
    force = os.environ.get("FORCE_REGENERATE") == "1"

    print(f"🎨 Backfill images à la une")
    print(f"   Mode : {'🔥 FORCE (régénère tout)' if force else '✨ normal (manquantes seulement)'}")
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
                                           limit_remaining, dry_run, force)
        if n > 0:
            sites_processed.append(site_dir.name)
            total_generated += n

    print(f"\n=== Résumé ===")
    print(f"✅ {total_generated} image(s) traitée(s)")
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
