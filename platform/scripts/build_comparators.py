#!/usr/bin/env python3
"""
Comparateurs EN MASSE depuis un Google Sheet par site.

Sheet (CSV publié) — 3 colonnes : Titre, Marques, Date
  Marques : "Nom | url ; Nom | url ; Nom"
    · séparateur entre marques : ;
    · lien optionnel après | (sert au screenshot + liens rotatifs, JAMAIS affiché)

Pour chaque ligne :
  - comparateur AUTONOME dans editorial.json (ordre des marques aléatoire, FIGÉ)
  - 1 entrée par marque (nom)
  - URL de la marque : Sheet sinon référentiel backlinks (sinon pas d'image)
  - screenshot décalé PAR SITE (screenshot_gen) → public/screenshots/
  - rédaction via le moteur IA : description + avantages/inconvénients par marque,
    intro + en_bref + contenu générique (« Qu'est-ce que… ») + FAQ,
    system = global_prompt (schema) + persona (config) + liste exacte des marques.

Lancé AVANT generate.py et enrich_editorial.py dans le build.
Idempotent : ne régénère pas un champ déjà rempli (--force pour tout refaire).
"""
import os
import sys
import csv
import io
import json
import re
import random
import unicodedata
import argparse
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import screenshot_gen as sg

try:
    import requests
except Exception:
    requests = None

ROOT = Path(__file__).resolve().parent.parent
YEAR = 2026

# ── Appel IA (même modèle que enrich_editorial, réécrit ici pour être
#    self-contained — pas d'import qui sys.exit sans clé) ──────────────────────
import json as _json
import time as _time
import urllib.request
import urllib.error
try:
    from _ai_model import CLAUDE_MODEL as MODEL
except Exception:
    MODEL = "claude-sonnet-4-6"
_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")


def call_claude_fast(prompt: str, system: str = None, max_retries: int = 3) -> str:
    if not _API_KEY:
        return ""
    body = {"model": MODEL, "max_tokens": 2000,
            "messages": [{"role": "user", "content": prompt}]}
    if system:
        body["system"] = system
    payload = _json.dumps(body).encode("utf-8")
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                "https://api.anthropic.com/v1/messages", data=payload,
                headers={"Content-Type": "application/json", "x-api-key": _API_KEY,
                         "anthropic-version": "2023-06-01"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                return _json.loads(resp.read())["content"][0]["text"]
        except Exception as e:
            print(f"    ⚠ IA tentative {attempt+1}/{max_retries} : {e}")
            if attempt < max_retries - 1:
                _time.sleep([5, 20, 40][attempt])
    return ""


# ── Utils ──────────────────────────────────────────────────────────────────
def slugify(s: str) -> str:
    # Identique à slugify_cat() de generate.py (gère apostrophes et parenthèses)
    # pour que la clé classement-<slug> corresponde à ce que generate.py cherche.
    s = str(s or "").replace("\u2019", " ").replace("\u2018", " ").replace("'", " ")
    s = re.sub(r"[()\[\]]", "", s)
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def norm(s: str) -> str:
    """Clé de matching marque↔référentiel (casse, accents, tirets, points)."""
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[-._/\s]+", " ", s).strip().lower()


def fetch_csv(url: str) -> list[dict]:
    if not requests:
        print("⚠ requests manquant"); return []
    if "/pubhtml" in url:
        url = re.sub(r"/pubhtml.*$", "/pub?output=csv", url)
    elif "output=csv" not in url:
        url += ("&" if "?" in url else "?") + "output=csv"
    try:
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        return list(csv.DictReader(io.StringIO(r.text)))
    except Exception as e:
        print(f"⚠ fetch Sheet comparateurs : {e}")
        return []


def parse_brands(cell: str) -> list[dict]:
    out = []
    for part in str(cell or "").split(";"):
        part = part.strip()
        if not part:
            continue
        if "|" in part:
            name, url = part.split("|", 1)
            out.append({"name": name.strip(), "url": url.strip()})
        else:
            out.append({"name": part.strip(), "url": ""})
    return out


def load_backlink_repo() -> dict:
    """Référentiel marque(normalisée) → URL (fallback pour le screenshot)."""
    p = ROOT / "backlink-settings.json"
    repo = {}
    if p.exists():
        try:
            for name, url in (json.loads(p.read_text(encoding="utf-8")).get("brands") or {}).items():
                if name and url:
                    repo[norm(name)] = str(url).strip()
        except Exception:
            pass
    return repo


def site_index_for(site: str) -> int:
    """Index STABLE du site (pour le décalage screenshot), borné à la marge dispo."""
    sites = sorted(d.name for d in (ROOT / "sites").iterdir() if d.is_dir() and d.name != "_shared")
    try:
        idx = sites.index(site)
    except ValueError:
        idx = 0
    # marge de décalage disponible dans le master
    max_off = min(sg.MASTER_W - sg.CROP_W, sg.MASTER_H - sg.CROP_H)
    max_idx = max(1, max_off // sg.OFFSET_STEP - 1)
    return idx % max_idx


def load_schema_prompts(site_dir: Path, config: dict):
    schema_name = (config.get("page_types", {}) or {}).get("classement", "")
    gp = ""
    if schema_name:
        sp = ROOT / "schemas" / f"{schema_name}.json"
        if sp.exists():
            try:
                gp = (json.loads(sp.read_text(encoding="utf-8")).get("global_prompt", "") or "").strip()
            except Exception:
                pass
    persona = (config.get("persona_prompt", "") or "").strip().lstrip("|").strip()
    return gp, persona


def build_system(global_prompt: str, persona: str, brand_names: list[str], is_json: bool) -> str:
    base = ("Tu es un expert rédacteur SEO. Réponds UNIQUEMENT en JSON valide sans backticks, sans preamble."
            if is_json else
            "Tu es un expert rédacteur SEO. Aucun tiret long (— ou –). Aucun markdown autre que le HTML demandé.")
    products = ("MARQUES DU COMPARATIF — utilise EXCLUSIVEMENT ces noms, n'en invente AUCUN autre :\n"
                + ", ".join(brand_names)) if brand_names else ""
    return "\n\n".join([p for p in [global_prompt, persona, products, base] if p])


def gen(user: str, system: str) -> str:
    if not call_claude_fast:
        return ""
    try:
        return (call_claude_fast(user, system=system) or "").strip()
    except Exception as e:
        print(f"    ⚠ génération : {e}")
        return ""


def gen_json(user: str, system: str):
    raw = gen(user, system)
    if not raw:
        return None
    raw = raw.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(raw)
    except Exception:
        return None


# ── Cœur ───────────────────────────────────────────────────────────────────
def main(site: str, force: bool = False):
    site_dir = ROOT / "sites" / site
    cfg_path = site_dir / "config.yaml"
    if not cfg_path.exists():
        print(f"❌ site inconnu : {site}"); return
    config = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
    sheet_url = (config.get("comparators_sheet_csv_url") or "").strip()
    if not sheet_url:
        print(f"  ⓘ {site} : pas de comparators_sheet_csv_url, rien à faire"); return

    rows = fetch_csv(sheet_url)
    if not rows:
        print("  ⓘ Sheet comparateurs vide"); return

    ed_path = site_dir / "editorial.json"
    editorial = {}
    if ed_path.exists():
        try:
            editorial = json.loads(ed_path.read_text(encoding="utf-8"))
        except Exception:
            editorial = {}

    repo = load_backlink_repo()
    s_index = site_index_for(site)
    global_prompt, persona = load_schema_prompts(site_dir, config)
    shots_dir = site_dir / "public" / "screenshots"
    print(f"  → {len(rows)} ligne(s) · décalage screenshot site #{s_index} ({(s_index+1)*sg.OFFSET_STEP}px)")

    for row in rows:
        titre = (row.get("Titre") or row.get("titre") or "").strip()
        marques_cell = row.get("Marques") or row.get("marques") or ""
        date = (row.get("Date") or row.get("date") or "").strip()
        if not titre or not marques_cell.strip():
            continue
        brands = parse_brands(marques_cell)
        if not brands:
            continue
        cat_slug = slugify(titre)
        cls_key = f"classement-{cat_slug}"
        brand_names = [b["name"] for b in brands]
        print(f"  ◆ {titre}  ({len(brands)} marques)")

        existing = editorial.get(cls_key, {}) if isinstance(editorial.get(cls_key), dict) else {}

        # ── Ordre aléatoire FIGÉ (réutilise le snapshot existant) ──
        if existing.get("products_snapshot") and not force:
            order = list(existing["products_snapshot"])
        else:
            order = [slugify(b["name"]) for b in brands]
            random.Random(cat_slug).shuffle(order)   # aléatoire déterministe → stable

        cls = dict(existing)
        cls.update({
            "categorie": titre,
            "autonome": True,
            "products_snapshot": order,
            "date_publication": date or cls.get("date_publication", ""),
        })
        cls.setdefault("h1", titre)
        cls.setdefault("meta_title", f"{titre} ({YEAR})")
        cls.setdefault("meta_description", f"{titre} : notre comparatif détaillé pour bien choisir en {YEAR}.")

        # ── Contenu générique du comparateur (si absent) ──
        if force or not str(cls.get("intro", "")).strip():
            cls["intro"] = gen(
                f"Rédige l'introduction HTML (2 paragraphes <p>) d'un comparatif intitulé « {titre} » en {YEAR}. "
                f"Accroche concrète, à la première personne, sans lister les marques.",
                build_system(global_prompt, persona, brand_names, False))
        if force or not str(cls.get("en_bref", "")).strip():
            cls["en_bref"] = gen(
                f"Pour le comparatif « {titre} », rédige un bloc « En bref » : une puce <li> par marque "
                f"(marque en <strong>) indiquant pour quel profil elle est idéale. "
                f"Réponds en HTML <li>…</li> uniquement, une puce par marque, marques : {', '.join(brand_names)}.",
                build_system(global_prompt, persona, brand_names, False))
        if force or not str(cls.get("contenu_custom", "")).strip():
            cls["contenu_custom"] = gen(
                f"Rédige un contenu éditorial SEO complet en HTML sur le thème « {titre} », à placer APRÈS le classement. "
                f"Structure avec des <h2> et <h3> : qu'est-ce que c'est / à qui ça s'adresse / comment bien choisir "
                f"(critères) / erreurs fréquentes à éviter / points techniques avancés. Ton vécu, première personne, "
                f"exemples concrets. Ne cite aucune marque précise. HTML uniquement (<h2>,<h3>,<p>,<ul>,<li>).",
                build_system(global_prompt, persona, [], False))
        if force or not cls.get("faq"):
            faq = gen_json(
                f"Rédige une FAQ de 6 questions/réponses utiles sur « {titre} » en {YEAR}. "
                f'Réponds UNIQUEMENT avec un tableau JSON : [{{"q":"…","a":"…"}}, …]. Réponses de 2-3 phrases.',
                build_system(global_prompt, persona, brand_names, True))
            if isinstance(faq, list):
                cls["faq"] = faq

        editorial[cls_key] = cls

        # ── Par marque : screenshot + contenu ──
        for b in brands:
            bslug = slugify(b["name"])
            prod_key = f"classement-prod-{bslug}"
            prod = dict(editorial.get(prod_key, {})) if isinstance(editorial.get(prod_key), dict) else {}
            prod.setdefault("nom", b["name"])
            prod.setdefault("marque", b["name"])

            # Screenshot (si URL connue et pas déjà produit pour ce site)
            url = b["url"] or repo.get(norm(b["name"]), "")
            shot = shots_dir / f"{bslug}-screenshot.png"
            if url and (force or not shot.exists()):
                sg.site_screenshot(bslug, url, s_index, shots_dir)

            # Contenu marque (desc + avantages/inconvénients) en 1 appel
            if force or not str(prod.get("description", "")).strip():
                data = gen_json(
                    f"Pour le comparatif « {titre} », présente la marque {b['name']}. "
                    f'Réponds UNIQUEMENT en JSON : {{"description":"<p>…</p><p>…</p>","points_forts":["…","…","…"],'
                    f'"points_faibles":["…","…"]}}. Description : 3 paragraphes <p> à la première personne, concrète, '
                    f"sans inventer de chiffres. 3-4 avantages, 2-3 inconvénients, courts.",
                    build_system(global_prompt, persona, brand_names, True))
                if isinstance(data, dict):
                    if data.get("description"):
                        prod["description"] = data["description"]
                    if isinstance(data.get("points_forts"), list):
                        prod["points_forts"] = data["points_forts"]
                    if isinstance(data.get("points_faibles"), list):
                        prod["points_faibles"] = data["points_faibles"]

            editorial[prod_key] = prod

    ed_path.write_text(json.dumps(editorial, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  ✓ editorial.json mis à jour ({len(rows)} comparateur(s))")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True)
    ap.add_argument("--force", action="store_true", help="régénère même les champs déjà remplis")
    a = ap.parse_args()
    main(a.site, a.force)
