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
from datetime import date as _date, datetime as _dt
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
    body = {"model": MODEL, "max_tokens": 6000,
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
        r.encoding = "utf-8"   # Google Sheets CSV = UTF-8 ; sinon mojibake (é→Ã©, '→â€™)
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


def _no_long_dash(t: str) -> str:
    """Le prompt interdit les tirets longs — on garantit leur absence."""
    t = re.sub(r"\s*—\s*", ", ", t)                 # em-dash → virgule
    t = re.sub(r"(\d)\s*–\s*(\d)", r"\1-\2", t)     # en-dash entre chiffres → trait d'union (plages)
    t = re.sub(r"\s*–\s*", ", ", t)                 # en-dash restant → virgule
    t = re.sub(r",\s*,", ",", t)                    # nettoie les virgules doublées
    return t


def _clean_html(t):
    """Nettoie les artefacts HTML (<br>/<div>) qui créent des sauts de ligne
    parasites : <br><br> -> nouveau paragraphe, <br> isolé -> espace, <div> retiré."""
    if not isinstance(t, str):
        return t
    t = re.sub(r"</?div[^>]*>", "", t)
    if "<p>" in t:
        t = re.sub(r"(?:\s*<br\s*/?>\s*){2,}", "</p><p>", t)
    t = re.sub(r"\s*<br\s*/?>\s*", " ", t)
    t = re.sub(r"<p>\s*</p>", "", t)
    return t.strip()


def _fix_mojibake(s):
    """Répare un texte UTF-8 mal décodé (é→Ã©, '→â€™). On tente cp1252 puis
    latin-1 (selon l'encodage fautif). Sûr sur un texte déjà correct : le reverse
    échoue ou ne change rien → chaîne inchangée."""
    if not isinstance(s, str):
        return s
    for enc in ("cp1252", "latin-1"):
        try:
            fixed = s.encode(enc).decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
        if fixed != s and "\ufffd" not in fixed:
            return fixed
    return s


def _deep_fix(obj):
    """Applique _fix_mojibake + _no_long_dash récursivement à toutes les chaînes."""
    if isinstance(obj, str):
        return _clean_html(_no_long_dash(_fix_mojibake(obj)))
    if isinstance(obj, list):
        return [_deep_fix(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _deep_fix(v) for k, v in obj.items()}
    return obj


def _hdr_norm(s: str) -> str:
    """Clé d'en-tête : mojibake réparé, sans accents, casse/espaces ignorés."""
    s = unicodedata.normalize("NFD", _fix_mojibake(str(s or ""))).encode("ascii", "ignore").decode()
    return s.strip().lower()


def _row_get(row: dict, *names) -> str:
    """Lit une colonne du Sheet par nom, insensible casse/accents/espaces et
    robuste au mojibake d'en-tête (Catégorie → CatÃ©gorie)."""
    nmap = {}
    for k in row.keys():
        if k is not None:
            nmap.setdefault(_hdr_norm(k), k)
    for name in names:
        key = nmap.get(_hdr_norm(name))
        if key is not None:
            v = row.get(key)
            if v not in (None, ""):
                return str(v)
    return ""


def gen(user: str, system: str) -> str:
    if not call_claude_fast:
        return ""
    try:
        raw = (call_claude_fast(user, system=system) or "").strip()
        raw = re.sub(r"^\s*```[a-zA-Z]*\s*", "", raw)   # retirer fence ```html
        raw = re.sub(r"\s*```\s*$", "", raw)
        return _clean_html(_no_long_dash(raw.strip()))
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
    # L'URL vit sous `site:` dans le config.yaml (comme blog_sheet_csv_url).
    sheet_url = (config.get("comparators_sheet_csv_url")
                 or (config.get("site") or {}).get("comparators_sheet_csv_url") or "").strip()
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

    # ── Réparation des entrées mojibakées (créées avant le fix d'encodage) ──
    # 1) Supprime les comparateurs autonomes dont le TITRE est mojibaké : leur
    #    slug est erroné → doublons/orphelins sur /nos-comparateurs. La version
    #    correcte est (re)générée depuis le Sheet plus bas.
    # 2) Répare mojibake + tirets longs dans les comparateurs autonomes conservés
    #    et leurs marques (contenu déjà en base), sans tout régénérer.
    _removed = []
    for _k in list(editorial.keys()):
        _v = editorial.get(_k)
        if (_k.startswith("classement-") and not _k.startswith("classement-prod-")
                and isinstance(_v, dict) and _v.get("autonome")):
            _cat = _v.get("categorie", "")
            if _fix_mojibake(_cat) != _cat:          # titre mojibaké → entrée orpheline
                _removed.append(_k)
                del editorial[_k]
    if _removed:
        print(f"  🧹 {len(_removed)} comparateur(s) mojibaké(s) supprimé(s) : {', '.join(_removed)}")
    _auto_prod = set()
    for _v in editorial.values():
        if isinstance(_v, dict) and _v.get("autonome"):
            for _s in _v.get("products_snapshot", []):
                _auto_prod.add(f"classement-prod-{_s}")
    for _k in list(editorial.keys()):
        _v = editorial.get(_k)
        if (isinstance(_v, dict) and _v.get("autonome")) or _k in _auto_prod:
            editorial[_k] = _deep_fix(_v)

    repo = load_backlink_repo()
    bl_sheet_urls: dict = {}   # norm(nom) -> (nom, url) à injecter dans le référentiel backlinks
    s_index = site_index_for(site)
    global_prompt, persona = load_schema_prompts(site_dir, config)
    shots_dir = site_dir / "public" / "screenshots"
    print(f"  → {len(rows)} ligne(s) · décalage screenshot site #{s_index} ({(s_index+1)*sg.OFFSET_STEP}px)")

    for row in rows:
        titre = _fix_mojibake(_row_get(row, "Titre")).strip()
        marques_cell = _fix_mojibake(_row_get(row, "Marques"))
        date = _row_get(row, "Date").strip()
        categorie_parente = _fix_mojibake(_row_get(row, "Catégorie", "Categorie")).strip()
        if not titre or not marques_cell.strip():
            continue
        # Publication programmée : on ignore les lignes dont la date est dans le
        # futur. Le cron quotidien les prendra en charge une fois la date arrivée.
        if date:
            try:
                if _dt.strptime(date[:10], "%Y-%m-%d").date() > _date.today():
                    print(f"  ⏳ {titre} — programmé pour {date}, ignoré pour l'instant")
                    continue
            except ValueError:
                pass  # date non parsable → génération normale
        brands = parse_brands(marques_cell)
        for _b in brands:
            _bu = (_b.get("url") or "").strip()
            if _bu:
                bl_sheet_urls[norm(_b["name"])] = (_b["name"], _bu)
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
        if categorie_parente:
            cls["cat_parent"] = categorie_parente   # catégorie parente (maillage + listing)
        # Titre H2 avant le classement : on retire un éventuel "Meilleur(s)/Top N"
        # en tête du titre pour éviter "Mon classement des meilleurs Meilleurs …".
        _ta = re.sub(r"^(?:meilleur[es]?s?|top\s*\d*)\s+", "", titre, flags=re.I).strip()
        cls["titre_analyse"] = f"Mon classement des meilleurs {_ta}" if _ta else titre
        # Fallbacks (si l'IA échoue)
        cls.setdefault("h1", titre)
        cls.setdefault("meta_title", f"{titre} ({YEAR})")
        cls.setdefault("meta_description", f"{titre} : notre comparatif pour bien choisir en {YEAR}.")
        # SEO généré (H1 accrocheur + title + meta) — uniques par comparateur
        if force or not str(existing.get("meta_title", "")).strip():
            seo = gen_json(
                f"Pour un comparatif de {len(brands)} marques intitulé « {titre} » en {YEAR}, génère le SEO. "
                f'Réponds UNIQUEMENT en JSON : {{"h1":"…","meta_title":"…","meta_description":"…"}}\n'
                f"- h1 : titre H1 accrocheur et UNIQUE (60-75 caractères), intègre le nombre ({len(brands)}) "
                f"et/ou {YEAR}, style vécu à la première personne (ex. « J'ai comparé … »), ne recopie pas mot "
                f"pour mot « {titre} ».\n"
                f"- meta_title : balise <title> SEO cliquable, max 60 caractères, inclut {YEAR}.\n"
                f"- meta_description : max 155 caractères, incitatif, bénéfice lecteur.",
                build_system(global_prompt, persona, [], True))
            if isinstance(seo, dict):
                if seo.get("h1"):
                    cls["h1"] = seo["h1"]
                if seo.get("meta_title"):
                    cls["meta_title"] = seo["meta_title"]
                if seo.get("meta_description"):
                    cls["meta_description"] = seo["meta_description"]

        # ── Contenu générique du comparateur (si absent) ──
        if force or not str(cls.get("intro", "")).strip():
            cls["intro"] = gen(
                f"Rédige l'introduction HTML (2 paragraphes <p>) d'un comparatif intitulé « {titre} » en {YEAR}. "
                f"120 MOTS MAXIMUM au total. Accroche concrète, à la première personne, sans lister les marques.",
                build_system(global_prompt, persona, brand_names, False))
        if force or not str(cls.get("en_bref", "")).strip():
            # "En bref" = seulement les 5 PREMIÈRES marques du classement (ordre figé)
            _slug2name = {slugify(b["name"]): b["name"] for b in brands}
            _top5 = [_slug2name.get(_s, _s) for _s in order[:5]]
            cls["en_bref"] = gen(
                f"Pour le comparatif « {titre} », rédige un bloc « En bref » : une puce <li> pour CHACUNE "
                f"de ces 5 marques (et UNIQUEMENT celles-ci, dans cet ordre), marque en <strong>, suivie de "
                f"« : » puis, pour quel profil elle est idéale en 14 MOTS MAXIMUM. Réponds en HTML <li>…</li> "
                f"uniquement, exactement 5 puces. "
                f"Marques : {', '.join(_top5)}.",
                build_system(global_prompt, persona, _top5, False))
        if force or not str(cls.get("contenu_custom", "")).strip():
            cls["contenu_custom"] = gen(
                f"Rédige un contenu éditorial SEO en HTML sur le thème « {titre} », à placer APRÈS le classement. "
                f"700 MOTS MAXIMUM. EXACTEMENT 3 sections <h2> (pas plus), avec des <h3> si utile. "
                f"Sujets : qu'est-ce que c'est et à qui ça s'adresse / comment bien choisir (critères) / erreurs fréquentes. "
                f"Ton vécu, première personne, exemples concrets. Ne cite aucune marque précise. "
                f"INTERDIT : ne génère AUCUNE FAQ ni liste de questions/réponses (elle est gérée séparément ailleurs). "
                f"Termine toujours par une phrase complète, jamais au milieu d'un mot ou d'une section. "
                f"HTML uniquement (<h2>,<h3>,<p>,<ul>,<li>).",
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

    # ── Référentiel backlinks : injecter les URLs du Sheet (sans écraser l'existant) ──
    if bl_sheet_urls:
        bl_path = ROOT / "backlink-settings.json"
        bl = {}
        if bl_path.exists():
            try:
                bl = json.loads(bl_path.read_text(encoding="utf-8"))
            except Exception:
                bl = {}
        bl.setdefault("brands", {})
        existing_norm = {norm(k): k for k in bl["brands"]}
        changed = 0
        for n, (name, url) in bl_sheet_urls.items():
            k = existing_norm.get(n)
            if k is None:
                bl["brands"][name] = url
                changed += 1
            elif not str(bl["brands"].get(k) or "").strip():
                bl["brands"][k] = url
                changed += 1
        if changed:
            bl_path.write_text(json.dumps(bl, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  🔗 référentiel backlinks : {changed} URL(s) ajoutée(s)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True)
    ap.add_argument("--force", action="store_true", help="régénère même les champs déjà remplis")
    a = ap.parse_args()
    main(a.site, a.force)
