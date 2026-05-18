#!/usr/bin/env python3
"""
avis_publish_scheduled.py — Cron job pour publier les avis programmés.

Architecture parallèle à `blog_publish_scheduled.py` mais pour des AVIS produits
(template `avis-post.html.j2`) avec une structure éditoriale très différente :
note /5, points forts/faibles, tarifs, FAQ, verdict, schema.org Review.

Pour chaque site qui a un `avis_sheet_csv_url` configuré dans son config.yaml :
1. Lit le CSV de la sheet d'avis
2. Filtre les lignes dont date_publication <= maintenant (Europe/Paris)
3. Compare avec `posts_avis/schedule_processed.json` (clefs déjà traitées)
4. Pour les nouvelles lignes : appelle Claude API → génère contenu structuré (en_bref,
   points_forts, points_faibles, sections, faq, verdict) → écrit `posts_avis/<slug>.md`
5. Met à jour rétroactivement les avis déjà publiés depuis la sheet (metadata)

Variables d'env requises :
    ANTHROPIC_API_KEY
    FORCE_TITLES (optionnel) : marques séparées par `||` pour forcer la publication
                              immédiate, ignorant la date programmée

Format attendu du CSV (colonnes) :
    date_publication    obligatoire (YYYY-MM-DD HH:MM, heure de Paris)
    marque              obligatoire (ex: Qonto)
    categorie           obligatoire (ex: Banque pro)
    sentiment           obligatoire (positif | mitige | negatif)
    note_globale        obligatoire (1.0 à 5.0, demi-étoiles autorisées)
    cta_url             obligatoire (URL d'affiliation)
    cta_label           optionnel  (défaut: "Visiter <Marque>")
    cible               optionnel  (à qui s'adresse la marque, 1 phrase)
    tarifs              obligatoire (format multi-lignes : `Offre|Prix|Features`,
                                     séparateur de lignes : ; ou newline)
    note_trustpilot     optionnel  (ex: 4.7)
    nb_avis_trustpilot  optionnel  (ex: 3000)
    plateforme_avis     optionnel  (défaut: "Trustpilot")
    meta_title          optionnel  (par défaut: pattern config.seo.avis_title_pattern)
    meta_description    optionnel
    link_anchors        optionnel  ("ancre1:N;ancre2:M")
    slug                optionnel  (par défaut: slug(marque))
"""
from __future__ import annotations
import csv
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

PARIS = ZoneInfo("Europe/Paris")
ROOT = Path(__file__).parent.parent
SITES_DIR = ROOT / "sites"

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = "claude-sonnet-4-20250514"


# ─── Helpers de base (identiques au blog) ─────────────────────────────────

def slugify(text: str) -> str:
    s = unicodedata.normalize("NFD", str(text or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s.lower())
    return re.sub(r"-+", "-", s).strip("-")


def fetch_csv(url: str) -> list[dict]:
    """Lit un CSV public Google Sheet et renvoie une liste de dicts.
    Normalise les noms de colonnes (lowercase, sans accents, _ à la place des espaces)."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))
    rows = []
    for r in reader:
        clean = {}
        for k, v in r.items():
            if k is None:
                continue
            key = slugify(k).replace("-", "_")
            clean[key] = (v or "").strip()
        if any(clean.values()):
            rows.append(clean)
    return rows


def parse_pub_datetime(date_str: str, time_str: str = "") -> datetime | None:
    """Parse 'YYYY-MM-DD HH:MM' ou 'YYYY-MM-DD' (date_str peut contenir l'heure)
    et retourne un datetime AWARE en zone Europe/Paris."""
    s = (date_str or "").strip()
    if not s:
        return None
    # Si date_publication contient déjà l'heure (ex "2026-05-20 14:00")
    m = re.match(r"^(\d{4}-\d{2}-\d{2})[\sT]+(\d{1,2}):(\d{2})", s)
    if m:
        try:
            dt = datetime(int(m.group(1).split("-")[0]),
                          int(m.group(1).split("-")[1]),
                          int(m.group(1).split("-")[2]),
                          int(m.group(2)), int(m.group(3)))
            return dt.replace(tzinfo=PARIS)
        except Exception:
            return None
    # Sinon date seule + colonne heure
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return None
    t = (time_str or "09:00").strip() or "09:00"
    tm = re.match(r"^(\d{1,2}):(\d{2})", t)
    if not tm:
        return None
    try:
        y, mo, d = s.split("-")
        return datetime(int(y), int(mo), int(d), int(tm.group(1)), int(tm.group(2))).replace(tzinfo=PARIS)
    except Exception:
        return None


def call_claude(system: str, user: str, retries: int = 3, max_tokens: int = 4000) -> str:
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY manquante")
    body = json.dumps({
        "model": CLAUDE_MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }).encode("utf-8")
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                "https://api.anthropic.com/v1/messages",
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        except Exception as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep([5, 15, 30][attempt])
    raise RuntimeError(f"Claude API a échoué après {retries} tentatives : {last_err}")


def strip_code_fences(text: str) -> str:
    text = re.sub(r"^```(?:json|JSON|html|HTML|markdown|md)?\s*\n?", "", text.strip())
    text = re.sub(r"\n?\s*```\s*$", "", text)
    return text.strip()


# ─── Parsing des données métier (sentiment, tarifs, etc.) ────────────────

SENTIMENT_MAP = {
    "positif": "positif", "positive": "positif", "+": "positif", "bon": "positif",
    "mitige": "mitige", "mitigé": "mitige", "neutre": "mitige", "moyen": "mitige", "~": "mitige",
    "negatif": "negatif", "négatif": "negatif", "negative": "negatif", "-": "negatif", "mauvais": "negatif",
}


def normalize_sentiment(raw: str) -> str:
    s = unicodedata.normalize("NFD", (raw or "").strip().lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return SENTIMENT_MAP.get(s, "positif")


def parse_note(raw: str) -> float:
    """Parse '4.5', '4,5', '4.5/5', '9/10' etc. Retourne note sur 5.0 clampée."""
    s = (raw or "").strip().replace(",", ".")
    if not s:
        return 4.0
    m = re.match(r"^([\d.]+)\s*/\s*(\d+)", s)
    if m:
        val, denom = float(m.group(1)), float(m.group(2))
        if denom > 0:
            val = (val / denom) * 5.0
    else:
        m = re.match(r"^([\d.]+)", s)
        val = float(m.group(1)) if m else 4.0
    return max(0.0, min(5.0, round(val * 2) / 2))  # arrondi à 0.5


def parse_tarifs(raw: str) -> list[dict]:
    """Parse '`Offre|Prix|Features` séparées par `;` ou newline'.
    Retourne [{nom, prix, features}].
    """
    if not raw:
        return []
    items = []
    # Séparateur de lignes : newline OR semicolon (mais pas dans une URL)
    for ln in re.split(r"[\n;]+", raw):
        ln = ln.strip()
        if not ln:
            continue
        parts = [p.strip() for p in ln.split("|")]
        if len(parts) < 2:
            continue
        nom = parts[0]
        prix = parts[1]
        features = parts[2] if len(parts) > 2 else ""
        items.append({"nom": nom, "prix": prix, "features": features})
    return items


def parse_anchors(raw: str) -> list[dict]:
    """'ancre1:3;ancre2:1' → [{text, max}]"""
    out = []
    if not raw:
        return out
    for part in re.split(r"[;\n]+", raw):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"^(.+?):(\d+)\s*$", part)
        if m:
            out.append({"text": m.group(1).strip(), "max": int(m.group(2))})
        else:
            out.append({"text": part, "max": 5})
    return out


# ─── Génération du contenu via Claude ────────────────────────────────────

GENERATION_SYSTEM_PROMPT = """Tu es un rédacteur SEO expert spécialisé dans les avis produits.
Tu écris des avis honnêtes, structurés, factuels, conformes aux critères E-E-A-T de Google.
Ton style est direct, professionnel, sans superlatifs creux ni jargon marketing.
Tu cites des éléments concrets (fonctionnalités, prix réels, cas d'usage) plutôt que des généralités.
Tu réponds UNIQUEMENT en JSON valide, sans préambule ni guillemets autour.

Règle de sentiment :
- "positif" : avis globalement favorable, défauts mineurs reconnus
- "mitige" : avis nuancé, qualités ET défauts importants équilibrés
- "negatif" : avis défavorable, défauts majeurs dominants

Toutes les listes doivent être en français correct, sans tournures trop molles ("c'est bien", "ça va").
Les questions FAQ DOIVENT se terminer par '?'.
N'invente JAMAIS de note, de chiffre, de pourcentage qui n'est pas dans les données fournies."""


def build_generation_prompt(row: dict, site: dict) -> tuple[str, str]:
    """Construit le user prompt pour générer le contenu structuré d'un avis."""
    marque = row.get("marque", "").strip()
    categorie = row.get("categorie", "").strip()
    sentiment = normalize_sentiment(row.get("sentiment", ""))
    note = parse_note(row.get("note_globale", ""))
    cible = (row.get("cible") or "").strip()
    tarifs = parse_tarifs(row.get("tarifs", ""))
    note_tp = (row.get("note_trustpilot") or "").strip()
    nb_avis_tp = (row.get("nb_avis_trustpilot") or "").strip()
    plateforme_avis = (row.get("plateforme_avis") or "Trustpilot").strip()
    year = str(site.get("year") or datetime.now(PARIS).year)

    # Construction du paragraphe avis_clients hors f-string pour éviter les
    # problèmes d'échappement de quotes imbriquées
    if note_tp and nb_avis_tp:
        avis_clients_instructions = (
            f"Mentionne la note {note_tp}/5 sur {plateforme_avis} "
            f"({nb_avis_tp} avis) et résume les retours typiques."
        )
    else:
        avis_clients_instructions = (
            "Les avis externes ne sont pas fournis. Écris simplement en 1 ligne "
            "que les avis publics sont à vérifier sur les plateformes spécialisées."
        )

    user = f"""Tu rédiges un avis structuré sur **{marque}** ({categorie}).

DONNÉES FOURNIES (à respecter strictement, ne pas inventer) :
- Marque : {marque}
- Catégorie : {categorie}
- Sentiment global : {sentiment}
- Note globale donnée par l'éditeur : {note}/5
- Cible visée : {cible or "(à déduire de la marque)"}
- Offres tarifaires : {json.dumps(tarifs, ensure_ascii=False) if tarifs else "(pas de tarifs fournis)"}
- Avis utilisateurs externes : {f"{note_tp}/5 sur {nb_avis_tp} avis ({plateforme_avis})" if (note_tp and nb_avis_tp) else "(non renseigné, ne pas l'inventer)"}
- Année : {year}

CONTRAINTES :
1. Le ton suit le sentiment "{sentiment}" : tu DOIS refléter ce sentiment dans le texte.
2. Tu peux t'appuyer sur ce que tu sais publiquement de {marque} (fonctionnalités, positionnement marché)
   mais sans inventer de chiffres, de partenariats, de récompenses, ou d'événements précis.
3. Si certaines données ne sont pas fournies (cible, avis externes), ne les mentionne pas.
4. Tu écris pour des humains pressés. Phrases courtes. Vocabulaire concret.

Réponds STRICTEMENT en JSON avec cette structure exacte (rien d'autre, pas de ```) :

{{
  "h1": "Titre principal au format 'Avis {marque} ({year}) : ...' (incitatif, max 75 caractères)",
  "en_bref": "Paragraphe d'intro de 2-3 phrases (max 280 caractères) : qui c'est, à qui ça s'adresse",
  "points_forts": ["3 points forts CONCRETS, 5-12 mots chacun, formulés positivement"],
  "points_faibles": ["2 points faibles HONNÊTES, 5-12 mots chacun, formulés sans diplomatie creuse"],
  "h2_fonctionnalites": {{
    "titre": "Titre H2 sur les fonctionnalités/le service (ex: 'Que permet {marque} concrètement ?')",
    "contenu_html": "2-4 paragraphes en HTML <p>...</p>. Description objective de ce que fait la plateforme. Aucun H3 sauf si vraiment nécessaire."
  }},
  "h2_support": {{
    "titre": "Titre H2 sur le service client/support",
    "contenu_html": "1-2 paragraphes en HTML <p>...</p>. Canaux de support (chat, mail, téléphone), réactivité, qualité."
  }},
  "h2_qualite_prix": {{
    "titre": "Titre H2 sur le rapport qualité/prix",
    "contenu_html": "1-2 paragraphes en HTML <p>...</p>. Positionnement vs concurrence, justification du prix, à qui c'est rentable."
  }},
  "h2_avis_clients": {{
    "titre": "Titre H2 sur les avis clients (ex: 'Que disent les utilisateurs ?')",
    "contenu_html": "1 paragraphe en HTML <p>...</p>. {avis_clients_instructions}"
  }},
  "faq": [
    {{"q": "Question fréquente 1 ? (DOIT se terminer par '?')", "r": "Réponse en 1-3 phrases (HTML interdit, texte brut)"}},
    {{"q": "Question 2 ?", "r": "..."}},
    {{"q": "Question 3 ?", "r": "..."}},
    {{"q": "Question 4 ?", "r": "..."}}
  ],
  "verdict": "Verdict final tranché de 3-4 phrases (max 400 caractères). Réitère la note {note}/5 et donne une recommandation claire (pour qui c'est, pour qui ce n'est pas).",
  "meta_title": "Title SEO max 60 caractères, doit contenir '{marque}' et '{year}'",
  "meta_description": "Meta description SEO max 155 caractères, doit donner envie de cliquer"
}}"""
    return GENERATION_SYSTEM_PROMPT, user


def generate_avis_content(row: dict, site: dict) -> dict:
    """Appelle Claude et parse le JSON retourné. Lève si parsing échoue."""
    system, user = build_generation_prompt(row, site)
    raw = call_claude(system, user, max_tokens=4000)
    raw = strip_code_fences(raw)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        # Tentative de récupération : extraire le premier objet JSON
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            raise RuntimeError(f"Pas de JSON dans la réponse Claude : {raw[:200]}")
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            raise RuntimeError(f"JSON invalide : {e}\nRaw : {raw[:500]}")
    # Garantit la présence de toutes les clés (valeurs par défaut)
    return {
        "h1": data.get("h1", f"Avis {row.get('marque','')}"),
        "en_bref": data.get("en_bref", ""),
        "points_forts": data.get("points_forts") or [],
        "points_faibles": data.get("points_faibles") or [],
        "h2_fonctionnalites": data.get("h2_fonctionnalites") or {"titre": "", "contenu_html": ""},
        "h2_support": data.get("h2_support") or {"titre": "", "contenu_html": ""},
        "h2_qualite_prix": data.get("h2_qualite_prix") or {"titre": "", "contenu_html": ""},
        "h2_avis_clients": data.get("h2_avis_clients") or {"titre": "", "contenu_html": ""},
        "faq": data.get("faq") or [],
        "verdict": data.get("verdict", ""),
        "meta_title": data.get("meta_title", ""),
        "meta_description": data.get("meta_description", ""),
    }


# ─── Écriture du markdown ────────────────────────────────────────────────

def write_avis_md(filepath: Path, fm: dict, body_html: str) -> None:
    """Sérialise le frontmatter YAML + le corps HTML.
    Le frontmatter contient les données structurées non textuelles (note, tarifs,
    points forts/faibles, FAQ) que le template lira directement plutôt que de
    parser du HTML."""
    fm_yaml = yaml.safe_dump(fm, allow_unicode=True, sort_keys=False, width=10000)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_text(f"---\n{fm_yaml}---\n\n{body_html}\n", encoding="utf-8")


def build_frontmatter(row: dict, generated: dict, site: dict, slug: str) -> dict:
    """Combine données sheet + données IA en un frontmatter complet."""
    marque = row.get("marque", "").strip()
    sentiment = normalize_sentiment(row.get("sentiment", ""))
    note = parse_note(row.get("note_globale", ""))
    tarifs = parse_tarifs(row.get("tarifs", ""))
    note_tp = row.get("note_trustpilot", "").strip()
    nb_avis_tp = row.get("nb_avis_trustpilot", "").strip()
    plateforme_avis = (row.get("plateforme_avis") or "Trustpilot").strip()
    cta_url = row.get("cta_url", "").strip()
    cta_label = row.get("cta_label", "").strip() or f"Visiter {marque}"
    pub_dt = parse_pub_datetime(row.get("date_publication", ""))
    pub_iso = pub_dt.isoformat() if pub_dt else datetime.now(PARIS).isoformat()
    link_anchors = parse_anchors(row.get("link_anchors", ""))

    return {
        # Métadonnées d'identification
        "slug": slug,
        "type": "avis",  # discriminant utilisé par generate.py
        "marque": marque,
        "categorie": (row.get("categorie") or "").strip(),
        "sentiment": sentiment,
        # Note + données quantifiables
        "note": note,
        "note_max": 5,
        "note_trustpilot": float(note_tp.replace(",", ".")) if note_tp.replace(",", ".").replace(".", "").isdigit() else None,
        "nb_avis_trustpilot": int(re.sub(r"\D", "", nb_avis_tp)) if nb_avis_tp else None,
        "plateforme_avis": plateforme_avis if (note_tp and nb_avis_tp) else None,
        # CTA
        "cta_url": cta_url,
        "cta_label": cta_label,
        "cible": (row.get("cible") or "").strip(),
        # Tarifs
        "tarifs": tarifs,
        # Contenu IA
        "h1": (row.get("h1") or generated.get("h1") or f"Avis {marque}").strip(),
        "en_bref": generated.get("en_bref", ""),
        "points_forts": generated.get("points_forts", []),
        "points_faibles": generated.get("points_faibles", []),
        "h2_fonctionnalites": generated.get("h2_fonctionnalites", {}),
        "h2_support": generated.get("h2_support", {}),
        "h2_qualite_prix": generated.get("h2_qualite_prix", {}),
        "h2_avis_clients": generated.get("h2_avis_clients", {}),
        "faq": generated.get("faq", []),
        "verdict": generated.get("verdict", ""),
        # SEO
        "meta_title": (row.get("meta_title") or generated.get("meta_title") or f"Avis {marque} : notre verdict").strip(),
        "meta_description": (row.get("meta_description") or generated.get("meta_description") or "").strip(),
        "link_anchors": link_anchors,
        # Date
        "date": pub_iso,
    }


# ─── Tracking des avis déjà publiés ──────────────────────────────────────

def load_processed(processed_file: Path) -> set[str]:
    if not processed_file.exists():
        return set()
    try:
        return set(json.loads(processed_file.read_text(encoding="utf-8")))
    except Exception:
        return set()


def save_processed(processed_file: Path, processed: set[str]) -> None:
    processed_file.parent.mkdir(parents=True, exist_ok=True)
    processed_file.write_text(
        json.dumps(sorted(processed), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def row_key(row: dict) -> str:
    """Clé unique d'un avis : marque + date_publication (un avis par marque pour MVP).
    Si le même couple revient dans la sheet, on ne re-publie pas."""
    return f"{slugify(row.get('marque',''))}|{(row.get('date_publication') or '').strip()}"


def _normalize_marque(m: str) -> str:
    return slugify(m).replace("-", "")


# ─── Sync metadata sur avis déjà publiés ─────────────────────────────────
# Comme pour le blog : si Julien modifie note, cta_url, link_anchors dans la
# sheet, on met à jour les .md déjà publiés sans régénérer le contenu IA.

EDITABLE_KEYS = (
    "note", "cta_url", "cta_label", "cible", "tarifs", "categorie",
    "note_trustpilot", "nb_avis_trustpilot", "plateforme_avis",
    "meta_title", "meta_description", "link_anchors",
)


def sync_metadata(posts_dir: Path, rows: list[dict]) -> int:
    """Pour chaque .md existant, retrouve la ligne par marque slugifiée et met
    à jour les champs éditables si la sheet a changé."""
    if not posts_dir.exists():
        return 0
    rows_by_marque = {}
    for r in rows:
        m = slugify(r.get("marque", ""))
        if m:
            rows_by_marque[m] = r
    updated = 0
    for md in posts_dir.glob("*.md"):
        try:
            raw = md.read_text(encoding="utf-8")
        except Exception:
            continue
        if not raw.startswith("---"):
            continue
        parts = raw.split("---", 2)
        if len(parts) < 3:
            continue
        try:
            fm = yaml.safe_load(parts[1]) or {}
        except Exception:
            continue
        marque_slug = slugify(fm.get("marque", "") or md.stem)
        row = rows_by_marque.get(marque_slug)
        if not row:
            continue
        # Recalcule les valeurs depuis la sheet
        new_fm = dict(fm)
        if row.get("note_globale"):
            new_fm["note"] = parse_note(row["note_globale"])
        if row.get("cta_url"):
            new_fm["cta_url"] = row["cta_url"].strip()
        if row.get("cta_label"):
            new_fm["cta_label"] = row["cta_label"].strip()
        if row.get("cible"):
            new_fm["cible"] = row["cible"].strip()
        if row.get("tarifs"):
            new_fm["tarifs"] = parse_tarifs(row["tarifs"])
        if row.get("categorie"):
            new_fm["categorie"] = row["categorie"].strip()
        if row.get("note_trustpilot"):
            try:
                new_fm["note_trustpilot"] = float(row["note_trustpilot"].replace(",", "."))
            except Exception:
                pass
        if row.get("nb_avis_trustpilot"):
            try:
                new_fm["nb_avis_trustpilot"] = int(re.sub(r"\D", "", row["nb_avis_trustpilot"]))
            except Exception:
                pass
        if row.get("plateforme_avis"):
            new_fm["plateforme_avis"] = row["plateforme_avis"].strip()
        if row.get("meta_title"):
            new_fm["meta_title"] = row["meta_title"].strip()
        if row.get("meta_description"):
            new_fm["meta_description"] = row["meta_description"].strip()
        if row.get("link_anchors"):
            new_fm["link_anchors"] = parse_anchors(row["link_anchors"])
        if new_fm != fm:
            new_yaml = yaml.safe_dump(new_fm, allow_unicode=True, sort_keys=False, width=10000)
            md.write_text(f"---\n{new_yaml}---{parts[2]}", encoding="utf-8")
            updated += 1
    return updated


# ─── Process d'un site ───────────────────────────────────────────────────

def get_csv_url(config: dict) -> str:
    site = config.get("site", {}) or {}
    return site.get("avis_sheet_csv_url", "") or ""


def process_site(site_id: str, site_dir: Path, config: dict) -> int:
    """Retourne le nombre d'avis nouvellement publiés."""
    csv_url = get_csv_url(config)
    if not csv_url:
        return 0
    print(f"\n→ Avis : {site_id}")
    try:
        rows = fetch_csv(csv_url)
    except Exception as e:
        print(f"  ⚠ Lecture CSV échouée : {e}")
        return 0
    print(f"  {len(rows)} ligne(s) dans la sheet")
    if not rows:
        return 0

    posts_dir = site_dir / "posts_avis"
    posts_dir.mkdir(parents=True, exist_ok=True)
    processed_file = posts_dir / "schedule_processed.json"
    processed = load_processed(processed_file)

    # Slugs déjà existants pour éviter collisions
    existing_slugs = {p.stem for p in posts_dir.glob("*.md")}

    now = datetime.now(PARIS)
    force_titles_env = os.environ.get("FORCE_TITLES", "") or ""
    force_titles = set(t.strip() for t in re.split(r"\|\||;", force_titles_env) if t.strip())

    # Filet de sécurité : si une marque est déjà publiée (fichier .md existe)
    # même si processed.json ne le sait pas, on l'ajoute pour ne pas re-générer.
    for slug in existing_slugs:
        # On ne connaît pas la marque exacte → on cherche dans les rows
        for r in rows:
            if slugify(r.get("marque", "")) == slug:
                processed.add(row_key(r))

    new_count = 0
    for row in rows:
        marque = (row.get("marque") or "").strip()
        if not marque:
            continue
        key = row_key(row)
        if key in processed:
            continue
        is_forced = marque in force_titles
        # Convention : date_publication vide = publication immédiate (au prochain
        # passage du cron, ou maintenant si on est dans la boucle). Permet à
        # Julien d'ajouter une ligne dans la sheet sans avoir à choisir une date.
        date_raw = (row.get("date_publication") or "").strip()
        if not is_forced and date_raw:
            pub_dt = parse_pub_datetime(date_raw)
            if pub_dt is None:
                print(f"  ✗ Date invalide pour '{marque}' (« {date_raw} ») → ignoré")
                continue
            if pub_dt > now:
                # Pas encore l'heure
                continue
        elif not is_forced and not date_raw:
            # Date vide → publication immédiate
            print(f"  ⚡ '{marque}' : date_publication vide → publication immédiate")
        # Slug : "avis-<marque>" pour avoir des URLs cohérentes (/avis-qonto,
        # /avis-legalplace, etc.) distinctes des articles de blog.
        raw_slug = (row.get("slug") or "").strip() or slugify(marque)
        if not raw_slug.startswith("avis-"):
            slug = f"avis-{raw_slug}"
        else:
            slug = raw_slug
        # Si collision, suffixer
        if slug in existing_slugs:
            i = 2
            while f"{slug}-{i}" in existing_slugs:
                i += 1
            slug = f"{slug}-{i}"

        print(f"  → Génération avis : {marque} ({normalize_sentiment(row.get('sentiment',''))}, {parse_note(row.get('note_globale',''))}/5)")
        try:
            generated = generate_avis_content(row, config.get("site", {}))
        except Exception as e:
            print(f"    ✗ Échec génération : {e}")
            continue
        fm = build_frontmatter(row, generated, config.get("site", {}), slug)
        # Le corps "body" du markdown est ici vide : tout est dans le frontmatter
        # (le template avis-post.html.j2 lit fm.* directement, ce qui permet
        # d'éditer chaque section indépendamment depuis un futur dashboard).
        body = ""
        out_path = posts_dir / f"{slug}.md"
        write_avis_md(out_path, fm, body)
        existing_slugs.add(slug)
        processed.add(key)
        new_count += 1
        print(f"    ✓ {out_path.relative_to(ROOT)}")

    save_processed(processed_file, processed)

    # Sync metadata des avis déjà publiés
    try:
        n_sync = sync_metadata(posts_dir, rows)
        if n_sync:
            print(f"  ↻ {n_sync} avis(s) mis à jour depuis la sheet (metadata)")
    except Exception as e:
        print(f"  ⚠ Sync metadata échoué : {e}")

    return new_count


# ─── Main ────────────────────────────────────────────────────────────────

def main():
    sites_to_deploy: list[str] = []
    if not SITES_DIR.exists():
        print(f"⚠ {SITES_DIR} introuvable")
        return
    for site_dir in sorted(SITES_DIR.iterdir()):
        if not site_dir.is_dir() or site_dir.name.startswith("_"):
            continue
        cfg_path = site_dir / "config.yaml"
        if not cfg_path.exists():
            continue
        try:
            config = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
        except Exception:
            continue
        if not get_csv_url(config):
            continue
        try:
            n = process_site(site_dir.name, site_dir, config)
        except Exception as e:
            print(f"  ⚠ Erreur sur {site_dir.name} : {e}")
            n = 0
        if n > 0:
            sites_to_deploy.append(site_dir.name)

    print(f"\n✓ Total sites à redéployer : {len(sites_to_deploy)} → {sites_to_deploy}")
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write(f"sites_to_deploy={','.join(sites_to_deploy)}\n")


if __name__ == "__main__":
    main()
