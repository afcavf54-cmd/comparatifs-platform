#!/usr/bin/env python3
"""Suppression groupée d'articles de blog.

Lit un fichier liste (par défaut platform/blog_to_delete.txt), chaque ligne :
    <site-slug> <article-slug>        -> supprime cet article
    <site-slug> ~texte                -> supprime TOUS les articles du site dont
                                         le slug contient "texte"
Supprime le fichier .md ET retire l'entrée de posts-index.json, puis vide le
fichier liste (ne garde que l'en-tête). Conçu pour tourner dans GitHub Actions.
"""
import sys, json, argparse, pathlib, datetime, re

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
            frag = token[1:].strip()
            if frag:
                t["contains"].add(frag)
        else:
            if token.endswith(".md"):
                token = token[:-3]
            t["exact"].add(token)

    if not targets:
        print("::notice::rien à supprimer.")
        return

    total_deleted = total_ghost = 0
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

        deleted, ghost = [], []
        for slug in sorted(to_del):
            p = existing.get(slug)
            if p and p.exists():
                p.unlink(); deleted.append(slug)
            else:
                ghost.append(slug)   # .md déjà absent -> nettoyage index seulement

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
        print(f"[{site}] .md supprimés: {len(deleted)} | fantômes nettoyés: {len(ghost)} | index: {idx_changed}")
        for s in deleted: print(f"   - {s}")
        for s in ghost:   print(f"   - (fantôme) {s}")

    # Vide le fichier liste (garde l'en-tête)
    if not args.keep_file:
        list_path.write_text(HEADER, encoding="utf-8")

    print(f"::notice::Total: {total_deleted} article(s) supprimé(s), {total_ghost} fantôme(s) nettoyé(s).")

if __name__ == "__main__":
    main()
