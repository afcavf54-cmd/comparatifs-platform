#!/usr/bin/env python3
"""
codes_promo_import_sheet.py — Import des marques codes promo depuis un Google Sheet.

Pour chaque ligne du sheet, crée 1 fichier brouillon
`platform/sites/<site>/codes_promo/<marque-slug>.md` avec frontmatter minimal.
Les marques déjà présentes (fichier existant avec le même slug) sont ignorées.

Le sheet doit avoir AU MINIMUM la colonne `marque`. Colonnes optionnelles :
- `url_affiliation` : URL avec param d'affiliation (utilisée par les CTAs)
- `categorie_marque` : catégorie de la marque (Mode, Beauté, Tech…) — utile pour
  les marques similaires sur la page rendue
- `url_marchand` : URL marchand sans affiliation
- `logo_url` : URL du logo de la marque

Configuration : l'URL du sheet est lue dans le `config.yaml` du site sous
la clé `codes_promo_sheet_url`. Format attendu : URL CSV publiée
(Fichier > Publier sur le web > CSV) ou export direct avec `gid=`.

Usage :
    python3 codes_promo_import_sheet.py <site-id>

Exemple :
    python3 codes_promo_import_sheet.py cadeauclic-com

Sortie : exit 0 si OK même sans nouvelle marque. Exit 1 si erreur (sheet
inaccessible, config manquante, etc.). Le workflow GitHub Actions appelant
fera ensuite un git diff + commit + push.
"""
from __future__ import annotations
import csv
import io
import re
import sys
import unicodedata
import urllib.request
from datetime import date
from pathlib import Path

import yaml


# ═══════════════════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════════════════

ROOT = Path(__file__).parent.parent           # platform/
SITES_DIR = ROOT / "sites"

# Délai HTTP raisonnable (Google Sheets répond vite, mais filets de sécurité)
HTTP_TIMEOUT = 30


# ═══════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def slugify(text: str) -> str:
    """Slug propre français : lowercase, sans accents, tirets."""
    s = unicodedata.normalize("NFD", str(text or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "marque"


def load_site_config(site_id: str) -> dict:
    """Charge le config.yaml du site et retourne le dict complet. Lève une
    exception si introuvable ou invalide."""
    cfg_path = SITES_DIR / site_id / "config.yaml"
    if not cfg_path.exists():
        raise FileNotFoundError(f"config.yaml introuvable pour le site '{site_id}' : {cfg_path}")
    with cfg_path.open(encoding="utf-8") as fp:
        cfg = yaml.safe_load(fp) or {}
    if not isinstance(cfg, dict):
        raise ValueError(f"config.yaml invalide pour '{site_id}'")
    return cfg


def fetch_csv(url: str) -> str:
    """Télécharge le CSV depuis l'URL Google Sheets, retourne le texte UTF-8."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "viseoweb-codes-promo-import/1.0"},
    )
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        raw = resp.read()
    # Google Sheets sert en UTF-8 sans BOM, mais on est défensif
    text = raw.decode("utf-8-sig")  # gère le BOM s'il est présent
    return text


def parse_rows(csv_text: str) -> list[dict]:
    """Parse le CSV en liste de dicts. Normalise les clés en lowercase + trim."""
    reader = csv.DictReader(io.StringIO(csv_text))
    rows: list[dict] = []
    for raw in reader:
        # Normalise les clés (lowercase + trim) et les valeurs (trim)
        normalized = {}
        for k, v in raw.items():
            if k is None:
                continue
            key = str(k).strip().lower()
            val = (str(v) if v is not None else "").strip()
            normalized[key] = val
        if normalized.get("marque"):
            rows.append(normalized)
    return rows


def serialize_frontmatter(fm: dict) -> str:
    """Sérialise le frontmatter en YAML stable (ordre des clés respecté).
    On ne met pas dans la fm les clés vides (cleaner pour le diff Git)."""
    # Filtrer les clés vides
    clean = {k: v for k, v in fm.items() if v not in (None, "", [], {})}
    return yaml.dump(
        clean,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
        width=1000,
    )


def build_draft_brand(row: dict, today_iso: str) -> dict:
    """Construit le dict frontmatter d'une marque brouillon à partir d'une
    ligne du sheet. L'ordre des clés est respecté à la sérialisation."""
    marque = row["marque"]
    fm: dict = {
        "marque": marque,
        "slug": slugify(marque),
        "categorie_marque": row.get("categorie_marque", ""),
        "url_marchand": row.get("url_marchand", ""),
        "url_affiliation": row.get("url_affiliation", ""),
        "logo_url": row.get("logo_url", ""),
        "description_marque": "",
        "avis_sophie": "",
        "conseil_sophie": "",
        "rating": {"value": 0, "count": 0},
        "codes": [],
        "faq": [],
        "historique_12_mois": [],
        "related_brands": [],
        "status": "draft",
        "date_creation": today_iso,
        "date_maj": today_iso,
    }
    return fm


def write_brand_file(filepath: Path, fm: dict) -> None:
    """Écrit un fichier marque (frontmatter + body squelette)."""
    body = (
        f"# Comment utiliser un code promo {fm['marque']}\n\n"
        f"_À rédiger…_ Tu peux cliquer sur « ✨ Générer le contenu » dans "
        f"le dashboard pour qu'il soit rédigé automatiquement.\n"
    )
    raw = f"---\n{serialize_frontmatter(fm)}---\n\n{body}"
    filepath.write_text(raw, encoding="utf-8")


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main(site_id: str) -> int:
    print(f"━━━ Import codes promo — site: {site_id} ━━━")

    # 1. Charger la config du site
    try:
        cfg = load_site_config(site_id)
    except Exception as e:
        print(f"❌ Erreur config : {e}")
        return 1

    sheet_url = (cfg.get("codes_promo_sheet_url") or "").strip()
    if not sheet_url:
        print(f"⚠  Pas de clé `codes_promo_sheet_url` dans le config.yaml de {site_id}")
        print(f"   → Ajoute la ligne suivante dans platform/sites/{site_id}/config.yaml :")
        print(f"     codes_promo_sheet_url: \"https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<GID>\"")
        return 0  # Pas une erreur fatale : juste rien à faire

    # 2. Télécharger le sheet
    print(f"📥 Téléchargement du sheet : {sheet_url[:80]}…")
    try:
        csv_text = fetch_csv(sheet_url)
    except Exception as e:
        print(f"❌ Erreur téléchargement sheet : {e}")
        return 1

    # 3. Parser
    rows = parse_rows(csv_text)
    print(f"📊 Sheet parsé : {len(rows)} ligne(s) avec une marque")
    if not rows:
        print("✓ Rien à importer (sheet vide ou aucune ligne avec marque)")
        return 0

    # 4. Importer dans codes_promo/ (créer les manquantes, skip les existantes)
    cp_dir = SITES_DIR / site_id / "codes_promo"
    cp_dir.mkdir(parents=True, exist_ok=True)

    today_iso = date.today().isoformat()
    existing_slugs = {p.stem for p in cp_dir.glob("*.md")}
    print(f"📂 Marques déjà présentes : {len(existing_slugs)}")

    n_created = 0
    n_skipped = 0
    n_skipped_collision = 0
    seen_in_sheet: set[str] = set()

    for row in rows:
        marque = row["marque"]
        slug = slugify(marque)
        if slug in seen_in_sheet:
            print(f"  ⚠  Doublon dans le sheet : '{marque}' (slug '{slug}') — ignoré (1re occurrence conservée)")
            continue
        seen_in_sheet.add(slug)

        if slug in existing_slugs:
            # Skip : marque déjà présente (l'utilisateur a déjà édité ou créé manuellement)
            n_skipped += 1
            continue

        fp = cp_dir / f"{slug}.md"
        fm = build_draft_brand(row, today_iso)
        try:
            write_brand_file(fp, fm)
            n_created += 1
            print(f"  ✓ Créé : {slug}.md  ({marque})")
        except Exception as e:
            print(f"  ❌ Erreur écriture {slug}.md : {e}")
            n_skipped_collision += 1

    # 5. Récap
    print()
    print(f"━━━ Récap ━━━")
    print(f"   Créées  : {n_created}")
    print(f"   Skippées (déjà présentes) : {n_skipped}")
    if n_skipped_collision:
        print(f"   Erreurs d'écriture : {n_skipped_collision}")
    print(f"   Total sheet : {len(seen_in_sheet)} marques uniques")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage : python3 codes_promo_import_sheet.py <site-id>")
        print("Exemple : python3 codes_promo_import_sheet.py cadeauclic-com")
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
