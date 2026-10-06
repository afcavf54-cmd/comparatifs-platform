#!/usr/bin/env python3
"""Rescan des années en dur dans l'editorial → remplace par {year} quand c'est
une référence à l'ANNÉE COURANTE.

Règles :
  - 2026 (année courante)  → {year}  partout (sauf dans une date ISO 2026-10-05).
  - 2024 / 2025            → {year}  UNIQUEMENT dans une tournure « année courante »
    (comparatif / guide / classement / top / sélection / palmarès / meilleurs … AAAA,
     ou « AAAA : »). Les autres (ex. « fondée en 2024 ») sont LAISSÉES et listées.

Ne touche qu'aux champs texte éditoriaux (pas aux dates, slugs, snapshots).

Usage :
    python platform/scripts/rescan_years.py            # dry-run (rapport seul)
    python platform/scripts/rescan_years.py --apply    # applique les remplacements
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

SITES = Path(__file__).resolve().parents[1] / "sites"
CURRENT = "2026"

# Champs texte à traiter (on ignore date_publication, slug, products_snapshot, nom, marque…)
TEXT_FIELDS = {
    "description", "intro", "en_bref", "contenu_custom", "faq", "meta_title",
    "meta_description", "h1", "titre_analyse", "points_forts", "points_faibles",
    "title", "meta", "content", "excerpt", "sections_html",
    "description_a", "description_b",
}

# Mots-clés qui, suivis d'une année proche, désignent l'année courante
_KW = (r"(?:comparatif|comparatifs|guide|classement|top|s[ée]lection|palmar[èe]s|"
       r"meilleurs?|meilleures?|[ée]dition|version|mise à jour|actualis[ée]s?)")
_CUR_CTX = [
    re.compile(_KW + r"[^.\n]{0,25}?\b(?:2024|2025)\b", re.I),       # « comparatif … 2025 »
    re.compile(r"\b(?:2024|2025)\s*:"),                              # « 2025 : »
    re.compile(r"\b(?:2024|2025)\s*\?"),                             # « … 2025 ? » (FAQ)
    re.compile(r"\b(?:2024|2025)\s*(?:</h|</p|<br)", re.I),          # « … 2025 </h2> » (titre)
    re.compile(r"(?:choisir|utiliser|adopter|privil[ée]gier|opter)"
               r"[^.\n]{0,25}?\b(?:2024|2025)\b", re.I),             # « choisir … 2025 »
    re.compile(r"\ben\s+(?:2024|2025)\b(?=\s*(?:[?:<]|$))"),         # « en 2025 » suivi de ? : < ou fin
]
# 2026 isolé (pas dans une date type 2026-10-05 ni 05-2026)
_RE_2026 = re.compile(r"(?<![\d-])" + CURRENT + r"(?![\d-])")
# 2024/2025 isolés (pour le rapport)
_RE_PAST = re.compile(r"(?<![\d-])\b(?:2024|2025)\b(?![\d-])")


def fix_string(s: str, report: list, site: str, key: str):
    if not isinstance(s, str) or not any(y in s for y in ("2024", "2025", "2026")):
        return s, 0
    n = 0
    # 2026 → {year}
    s, c = _RE_2026.subn("{year}", s)
    n += c
    # 2024/2025 en contexte « année courante » → {year}
    for rx in _CUR_CTX:
        def _repl(m):
            nonlocal n
            g = m.group(0)
            g2 = re.sub(r"\b(2024|2025)\b", "{year}", g)
            if g2 != g:
                n += 1
            return g2
        s = rx.sub(_repl, s)
    # 2024/2025 restants → rapport (NON remplacés)
    for m in _RE_PAST.finditer(s):
        ctx = s[max(0, m.start() - 30):m.end() + 30].replace("\n", " ")
        report.append((site, key, m.group(0), ctx))
    return s, n


def walk(v, report, site, key):
    if isinstance(v, str):
        return fix_string(v, report, site, key)
    if isinstance(v, list):
        out, total = [], 0
        for x in v:
            r, c = walk(x, report, site, key)
            out.append(r)
            total += c
        return out, total
    if isinstance(v, dict):
        out, total = {}, 0
        for k, x in v.items():
            r, c = walk(x, report, site, key)
            out[k] = r
            total += c
        return out, total
    return v, 0


def main(apply: bool) -> None:
    report, total, files = [], 0, 0
    for ed_path in sorted(SITES.glob("*/editorial.json")):
        site = ed_path.parent.name
        try:
            ed = json.loads(ed_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        changed, new = 0, {}
        for key, val in ed.items():
            if isinstance(val, dict):
                nv = {}
                for fk, fv in val.items():
                    if fk in TEXT_FIELDS:
                        r, c = walk(fv, report, site, f"{key}.{fk}")
                        nv[fk] = r
                        changed += c
                    else:
                        nv[fk] = fv
                new[key] = nv
            else:
                new[key] = val
        if changed:
            files += 1
            total += changed
            if apply:
                ed_path.write_text(json.dumps(new, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  {'✏' if apply else '•'} {site}: {changed} remplacement(s)")

    print(f"\n{'✅ APPLIQUÉ' if apply else '🔍 DRY-RUN (rien modifié)'} : "
          f"{total} remplacement(s) sur {files} site(s)")

    if report:
        print(f"\n⚠ {len(report)} occurrence(s) 2024/2025 LAISSÉES (à vérifier à la main) :")
        for site, key, yr, ctx in report[:80]:
            print(f"  [{site}] {key} · {yr} · …{ctx}…")
        if len(report) > 80:
            print(f"  … et {len(report) - 80} autres")


if __name__ == "__main__":
    main("--apply" in sys.argv)
