#!/usr/bin/env python3
"""Fusion ADDITIVE du référentiel backlinks (fichier GLOBAL partagé).

`platform/backlink-settings.json` est écrit par le build de CHAQUE site. Comme
les builds tournent en parallèle et que le push utilise `git rebase -X theirs`
(= notre version gagne), un build parti d'une copie périmée écrasait les
marques ajoutées entre-temps par d'autres sites → des URLs disparaissaient du
référentiel (bug observé : gobelets de digicube effacés par le build suivant).

Ce script fusionne la version du WORKING TREE (la nôtre) avec celle d'une
référence git (origin/main) en NE PERDANT JAMAIS une marque : union des deux,
en gardant une URL non vide quand elle existe. À appeler dans la boucle de push
APRÈS `git fetch`, avant le rebase, puis `git add` + `git commit --amend`.

  python platform/scripts/merge_backlinks.py origin/main
"""
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

REL = "platform/backlink-settings.json"
REPO = Path(__file__).resolve().parents[2]          # racine du repo
PATH = Path(__file__).resolve().parents[1] / "backlink-settings.json"  # platform/backlink-settings.json


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[-._/\s]+", " ", s).strip().lower()


def _load_ours() -> dict:
    try:
        return json.loads(PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _load_ref(ref: str) -> dict:
    try:
        raw = subprocess.check_output(["git", "show", f"{ref}:{REL}"],
                                      cwd=str(REPO), stderr=subprocess.DEVNULL)
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return {}


def main() -> None:
    ref = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
    ours = _load_ours()
    theirs = _load_ref(ref)

    ob = (ours.get("brands") or {}) if isinstance(ours, dict) else {}
    tb = (theirs.get("brands") or {}) if isinstance(theirs, dict) else {}

    # On part du DISTANT (pour conserver ce que les autres builds ont ajouté),
    # puis on ajoute/complète avec les nôtres. Union, jamais de suppression.
    merged = dict(tb)
    by_norm = {_norm(k): k for k in merged}
    added = filled = 0
    for name, url in ob.items():
        k = by_norm.get(_norm(name))
        if k is None:
            merged[name] = url
            by_norm[_norm(name)] = name
            added += 1
        elif url and not str(merged.get(k) or "").strip():
            merged[k] = url
            filled += 1

    # Base de sortie : le distant s'il existe (garde ses autres clés), sinon nous.
    out = dict(theirs) if isinstance(theirs, dict) and theirs else dict(ours) if isinstance(ours, dict) else {}
    out["brands"] = merged
    # Conserver nos éventuelles clés non présentes côté distant (ex. known_clients).
    if isinstance(ours, dict):
        for k, v in ours.items():
            if k != "brands" and k not in out:
                out[k] = v

    PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  🔗 merge backlinks ({ref}) : {len(merged)} marques "
          f"(+{added} ajoutée(s), {filled} URL(s) complétée(s))")


if __name__ == "__main__":
    main()
