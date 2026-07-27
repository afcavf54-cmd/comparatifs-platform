#!/usr/bin/env python3
"""Suppression groupée d'articles de blog.

Lit un fichier liste (par défaut platform/blog_to_delete.txt), chaque ligne :
    <site-slug> <article-slug>        -> supprime cet article
    <site-slug> ~texte                -> supprime TOUS les articles du site dont
                                         le slug contient "texte"
Supprime le fichier .md ET retire l'entrée de posts-index.json, puis vide le
fichier liste (ne garde que l'en-tête). Conçu pour tourner dans GitHub Actions.
"""
import sys, json, argparse, pathlib, datetime, re, os

HEADER = """# Suppression groupée d'articles de blog.
# Ajoute UNE ligne par article, puis commit ce fichier : la GitHub Action
# supprime les .md correspondants + met l'index à jour, en un seul commit.
#
# Format d'une ligne :   <site-slug> <article-slug>
#   - <article-slug> : nom exact (avec ou sans .md)
#   - ~texte         : supprime tous les articles du site dont le slug contient "texte"
#
# Exemples :
#   creaone-fr 9507-le-prix-du-logiciel-crm-salestrack-pro-en-vaut-il-la-peine
#   creaone-fr ~salestrack
#
# Ce fichier est vidé automatiquement après traitement.
# ---------------------------------------------------------------------------
"""

def _normalize_slug(s: str) -> str:
    """Normalise un slug d'article saisi dans la liste.

    Tolère : URL complète collée, slash de début/fin, suffixe /index.html,
    .html ou .md. Ainsi coller `https://site.fr/1245-truc/` ou `1245-truc/`
    ou `1245-truc.md` cible bien le fichier posts/1245-truc.md.
    """
    s = s.strip()
    if "://" in s:                       # URL complète -> garde le chemin
        rest = s.split("://", 1)[1]
        s = rest.split("/", 1)[1] if "/" in rest else ""
    s = s.strip().strip("/")             # slashes début/fin
    for suf in ("/index.html", ".html", ".md"):
        if s.endswith(suf):
            s = s[: -len(suf)]
            break
    return s.strip("/")


def _norm_title(t: str) -> str:
    return " ".join(str(t or "").lower().split())


def _read_md_title(path: pathlib.Path) -> str:
    """Extrait le champ `title:` du frontmatter YAML d'un .md."""
    try:
        content = path.read_text(encoding="utf-8")
    except Exception:
        return ""
    if not content.startswith("---"):
        return ""
    end = content.find("---", 3)
    if end < 0:
        return ""
    for line in content[3:end].splitlines():
        s = line.strip()
        if s.startswith("title:"):
            t = s.split(":", 1)[1].strip()
            if len(t) >= 2 and t[0] in "'\"" and t[-1] == t[0]:
                t = t[1:-1].replace("''", "'").replace('\\"', '"')
            return t
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="platform/blog_to_delete.txt")
    ap.add_argument("--root", default="platform/sites")
    ap.add_argument("--keep-file", action="store_true", help="ne pas vider le fichier liste")
    args = ap.parse_args()

    list_path = pathlib.Path(args.file)
    if not list_path.exists():
        print(f"::warning::fichier liste introuvable: {list_path}"); return

    # Parse : { site: {"exact": set(), "contains": set()} }
    targets: dict[str, dict[str, set]] = {}
    for raw in list_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        if len(parts) != 2:
            print(f"::warning::ligne ignorée (format attendu '<site> <slug>'): {line}")
            continue
        site, token = parts[0].strip(), parts[1].strip()
        t = targets.setdefault(site, {"exact": set(), "contains": set()})
        if token.startswith("~"):
            frag = token[1:].strip().strip("/")
            if frag:
                t["contains"].add(frag)
        else:
            slug = _normalize_slug(token)
            if slug:
                t["exact"].add(slug)

    if not targets:
        print("::notice::rien à supprimer.")
        return

    total_deleted = total_ghost = 0
    affected_sites: set[str] = set()
    for site, t in targets.items():
        posts_dir = pathlib.Path(args.root) / site / "blog" / "posts"
        index_path = pathlib.Path(args.root) / site / "blog" / "posts-index.json"
        if not posts_dir.exists():
            print(f"::error::dossier introuvable: {posts_dir}")
            continue

        existing = {p.stem: p for p in posts_dir.glob("*.md")}

        # Construit l'ensemble final de slugs à supprimer
        to_del = set(t["exact"])
        for frag in t["contains"]:
            for stem in existing:
                if frag in stem:
                    to_del.add(stem)

        if not to_del:
            print(f"[{site}] aucun article ciblé.")
            continue

        # Titres à blacklister (pour que le cron ne republie pas depuis la
        # sheet). Source : frontmatter du .md, ou posts-index.json pour les
        # fantômes dont le .md a déjà disparu.
        slug_to_title = {}
        if index_path.exists():
            try:
                _idx = json.loads(index_path.read_text(encoding="utf-8"))
                for x in _idx.get("posts", []):
                    if x.get("slug") and x.get("title"):
                        slug_to_title[x["slug"]] = x["title"]
            except Exception:
                pass

        deleted, ghost = [], []
        img_removed = 0
        bl_titles = set()
        public_blog = pathlib.Path(args.root) / site / "public" / "blog"
        IMG_EXT = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif")
        for slug in sorted(to_del):
            p = existing.get(slug)
            # Titre pour le blacklist (avant suppression du .md)
            title = _read_md_title(p) if (p and p.exists()) else ""
            if not title:
                title = slug_to_title.get(slug, "")
            if title:
                bl_titles.add(_norm_title(title))
            if p and p.exists():
                p.unlink(); deleted.append(slug)
            else:
                ghost.append(slug)   # .md déjà absent -> nettoyage index seulement
            # Image featured source : on la retire aussi, sinon la copie
            # récursive de public/ dans generate.py recréerait une image orpheline.
            for ext in IMG_EXT:
                img = public_blog / f"{slug}{ext}"
                if img.exists():
                    img.unlink(); img_removed += 1

        # Blacklist : ajoute les titres supprimés (le cron les ignorera).
        if bl_titles:
            bl_file = pathlib.Path(args.root) / site / "blog" / "schedule_blacklist.json"
            try:
                current = json.loads(bl_file.read_text(encoding="utf-8")) if bl_file.exists() else []
            except Exception:
                current = []
            merged = sorted(set(_norm_title(t) for t in current) | bl_titles)
            bl_file.parent.mkdir(parents=True, exist_ok=True)
            bl_file.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"[{site}] blacklist : {len(bl_titles)} titre(s) ajouté(s) ({len(merged)} au total)")

        # Mise à jour de posts-index.json (retire les slugs supprimés)
        idx_changed = False
        if index_path.exists():
            try:
                data = json.loads(index_path.read_text(encoding="utf-8"))
                if isinstance(data.get("posts"), list):
                    before = len(data["posts"])
                    data["posts"] = [x for x in data["posts"] if x.get("slug") not in to_del]
                    if len(data["posts"]) != before:
                        if isinstance(data.get("count"), int):
                            data["count"] = len(data["posts"])
                        data["updated_at"] = datetime.datetime.now().isoformat()
                        index_path.write_text(
                            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
                        idx_changed = True
            except Exception as e:
                print(f"::warning::[{site}] index non mis à jour: {e}")

        total_deleted += len(deleted); total_ghost += len(ghost)
        if deleted or ghost or idx_changed:
            affected_sites.add(site)
        print(f"[{site}] .md supprimés: {len(deleted)} | fantômes nettoyés: {len(ghost)} | images: {img_removed} | index: {idx_changed}")
        for s in deleted: print(f"   - {s}")
        for s in ghost:   print(f"   - (fantôme) {s}")

    # Vide le fichier liste (garde l'en-tête)
    if not args.keep_file:
        list_path.write_text(HEADER, encoding="utf-8")

    print(f"::notice::Total: {total_deleted} article(s) supprimé(s), {total_ghost} fantôme(s) nettoyé(s).")

    # Expose les sites impactés (pour régénération/déploiement par le workflow)
    sites_str = " ".join(sorted(affected_sites))
    print(f"AFFECTED_SITES={sites_str}")
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        try:
            with open(gh_out, "a", encoding="utf-8") as f:
                f.write(f"sites={sites_str}\n")
        except Exception as e:
            print(f"::warning::GITHUB_OUTPUT non écrit: {e}")

if __name__ == "__main__":
    main()
