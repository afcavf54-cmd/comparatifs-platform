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
    mot_minimum         optionnel  (entier, défaut 800 — nombre total de mots minimum
                                    pour la somme des champs textuels : en_bref +
                                    H2 + verdict + FAQ. L'IA est instruite d'atteindre
                                    ce volume sans inventer de faits précis.)
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
    """Appelle l'API Anthropic en mode STREAMING. Cf blog_publish_scheduled.py
    pour le raisonnement complet : le streaming évite les "read timed out" sur
    les générations longues en gardant la connexion vivante chunk par chunk."""
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY manquante")
    body = json.dumps({
        "model": CLAUDE_MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "stream": True,
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
            chunks: list[str] = []
            with urllib.request.urlopen(req, timeout=120) as resp:
                for raw_line in resp:
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line.startswith("data: "):
                        continue
                    payload = line[len("data: "):]
                    if payload == "[DONE]":
                        break
                    try:
                        event = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    if event.get("type") == "content_block_delta":
                        delta = event.get("delta") or {}
                        if delta.get("type") == "text_delta":
                            chunks.append(delta.get("text", ""))
                    elif event.get("type") == "error":
                        err_info = event.get("error") or {}
                        raise RuntimeError(
                            f"Erreur API streaming : {err_info.get('type', '?')} — "
                            f"{err_info.get('message', '')}"
                        )
            text = "".join(chunks)
            if not text:
                raise RuntimeError("Réponse streaming vide (aucun text_delta reçu)")
            return text
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
    """Parse '4.5', '4,5', '4.8/5', '9.5/10' etc. Retourne note sur 5.0, sans arrondi.

    L'arrondi à la demi-étoile pour le rendu visuel est fait CÔTÉ TEMPLATE
    (avis-post.html.j2) afin que la valeur numérique exacte (ex: 4.8) reste
    disponible pour Schema.org Review et l'affichage texte « 4.8/5 ».
    """
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
    # Clamp 0..5 ; on garde 1 décimale pour l'affichage texte (4.8/5 plutôt que 4.8000001/5)
    return round(max(0.0, min(5.0, val)), 1)


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


def build_generation_prompt(row: dict, site: dict, faq_questions: list = None, persona_prompt: str = "") -> tuple:
    """Construit le user prompt pour générer le contenu structuré d'un avis.

    Si `faq_questions` est fourni (liste non vide), Claude doit reproduire ces
    questions VERBATIM dans la FAQ et ne génère QUE les réponses. Cela évite
    le doublon avec une FAQ déjà imposée par l'éditeur dans le dashboard.
    Sinon, Claude invente 4 questions + réponses (comportement historique).

    Si `persona_prompt` est fourni (lu depuis `config.yaml`, champ
    `persona_prompt`), il est injecté en tête du user prompt pour cadrer le
    ton, le persona du rédacteur, l'angle éditorial, le niveau de détail, etc.
    Le persona s'applique uniformément à toutes les sections générées.
    """
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

    # Colonne « mot_minimum » : nombre total minimum de mots pour l'article
    # (somme de en_bref + 4 H2 contenu_html + faq + verdict). Si vide ou
    # invalide, valeur par défaut 800 (équivalent du dimensionnement actuel).
    try:
        mot_min = int(str(row.get("mot_minimum") or "").strip() or 800)
    except Exception:
        mot_min = 800
    # On distribue grossièrement le budget mots pour guider l'IA :
    #  - en_bref : ~5 % (intro courte)
    #  - chaque H2 : ~22 % (4 blocs principaux)
    #  - verdict : ~7 %
    # Le reste va dans la FAQ. Les nombres ci-dessous sont des cibles SOUPLES,
    # pas des limites strictes : l'IA peut dépasser légèrement si nécessaire.
    target_h2 = max(120, int(mot_min * 0.22))
    target_intro = max(50, int(mot_min * 0.05))
    target_verdict = max(60, int(mot_min * 0.07))

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

    # ─── FAQ : questions imposées par l'éditeur OU auto-générées ────────────
    # Si l'éditeur a saisi une liste de questions dans le dashboard, Claude doit
    # les reproduire verbatim et ne générer QUE les réponses. Sinon, format
    # historique avec 4 questions inventées par Claude.
    # ⚠ Important : `faq_block` est injecté COMME UNE VARIABLE dans l'f-string
    # final `user`. Les accolades dans cette variable ne sont PAS rééchappées
    # par l'f-string (contrairement à un littéral). On utilise donc des
    # accolades SIMPLES `{...}` ici (et non `{{...}}` comme dans le reste du
    # template JSON qui, lui, est littéral dans l'f-string).
    faq_questions = [q.strip() for q in (faq_questions or []) if isinstance(q, str) and q.strip()]
    if faq_questions:
        # On échappe les caractères qui pourraient casser le JSON template,
        # principalement les guillemets et les antislashs.
        def _esc(q: str) -> str:
            return q.replace("\\", "\\\\").replace('"', '\\"')
        faq_items = ",\n    ".join(
            '{"q": "' + _esc(q) + '", "r": "Réponse en 2-4 phrases (HTML interdit, texte brut). '
            'Réponds factuellement à CETTE question précise."}'
            for q in faq_questions
        )
        faq_block = f"[\n    {faq_items}\n  ]"
        faq_constraint = (
            f"\n6. FAQ - LISTE IMPOSÉE : Les {len(faq_questions)} questions de la FAQ ci-dessous te sont "
            f"IMPOSÉES par l'éditeur. Reproduis-les VERBATIM (texte exact, "
            f"même formulation, même ponctuation). Tu ne génères QUE les réponses. "
            f"Ne supprime, n'ajoute ni ne reformule aucune question."
        )
    else:
        # Format historique : 4 questions inventées. Accolades simples ici aussi
        # car la string sera injectée comme variable dans l'f-string user.
        faq_block = """[
    {"q": "Question fréquente 1 ? (DOIT se terminer par '?')", "r": "Réponse en 2-4 phrases (HTML interdit, texte brut)"},
    {"q": "Question 2 ?", "r": "..."},
    {"q": "Question 3 ?", "r": "..."},
    {"q": "Question 4 ?", "r": "..."}
  ]"""
        faq_constraint = ""

    # ─── Persona éditorial injecté en tête du user prompt ────────────────
    # Le persona est défini par l'éditeur dans config.yaml (champ
    # `persona_prompt`) et donne le ton, l'angle, le persona du rédacteur,
    # le niveau de détail attendu, etc. On le place en TÊTE pour qu'il cadre
    # tout ce qui suit (la section DONNÉES/CONTRAINTES vient ensuite).
    persona_section = ""
    if persona_prompt and persona_prompt.strip():
        persona_section = (
            "PERSONA ÉDITORIAL (à incarner pour toute la rédaction — c'est ta voix, "
            "ton ton, ton positionnement) :\n"
            f"{persona_prompt.strip()}\n\n"
        )

    user = f"""{persona_section}Tu rédiges un avis structuré sur **{marque}** ({categorie}).

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
5. LONGUEUR : la somme des champs textuels (en_bref + 4 H2 contenu_html + verdict + réponses FAQ)
   DOIT atteindre AU MINIMUM {mot_min} mots au total. Si tu sais peu de choses sur {marque},
   développe les analyses (positionnement marché, profil-type d'utilisateur, comparaison
   sectorielle générique) plutôt que d'inventer des faits précis.{faq_constraint}

Réponds STRICTEMENT en JSON avec cette structure exacte (rien d'autre, pas de ```) :

{{
  "h1": "Titre principal au format 'Avis {marque} ({year}) : ...' (incitatif, max 75 caractères)",
  "en_bref": "Paragraphe d'intro de ~{target_intro} mots : qui c'est, à qui ça s'adresse, positionnement",
  "points_forts": ["3 points forts CONCRETS, 5-12 mots chacun, formulés positivement"],
  "points_faibles": ["2 points faibles HONNÊTES, 5-12 mots chacun, formulés sans diplomatie creuse"],
  "h2_fonctionnalites": {{
    "titre": "Titre H2 sur les fonctionnalités/le service (ex: 'Que permet {marque} concrètement ?')",
    "contenu_html": "Au moins {target_h2} mots, répartis sur 2-4 paragraphes en HTML <p>...</p>. Description objective de ce que fait la plateforme. Aucun H3 sauf si vraiment nécessaire."
  }},
  "h2_support": {{
    "titre": "Titre H2 sur le service client/support",
    "contenu_html": "Au moins {target_h2} mots en HTML <p>...</p>. Canaux de support (chat, mail, téléphone), réactivité, qualité, escalade."
  }},
  "h2_qualite_prix": {{
    "titre": "Titre H2 sur le rapport qualité/prix",
    "contenu_html": "Au moins {target_h2} mots en HTML <p>...</p>. Positionnement vs concurrence, justification du prix, à qui c'est rentable, à qui ça ne l'est pas."
  }},
  "h2_avis_clients": {{
    "titre": "Titre H2 sur les avis clients (ex: 'Que disent les utilisateurs ?')",
    "contenu_html": "1 paragraphe en HTML <p>...</p>. {avis_clients_instructions}"
  }},
  "faq": {faq_block},
  "verdict": "Verdict final tranché d'environ {target_verdict} mots. Réitère la note {note}/5 et donne une recommandation claire (pour qui c'est, pour qui ce n'est pas).",
  "meta_title": "Title SEO max 60 caractères, doit contenir '{marque}' et '{year}'",
  "meta_description": "Meta description SEO max 155 caractères, doit donner envie de cliquer"
}}"""
    return GENERATION_SYSTEM_PROMPT, user


def generate_avis_content(row: dict, site: dict, custom_prompt: str = "", faq_questions: list = None, persona_prompt: str = "") -> dict:
    """Appelle Claude et parse le JSON retourné. Lève si parsing échoue.

    Si `custom_prompt` est fourni (saisi par l'éditeur via le dashboard et
    stocké dans posts_avis/_drafts.json), un SECOND appel Claude est effectué
    pour générer un bloc HTML libre `sections_html` qui remplacera les 3 H2
    standards (fonctionnalites/support/qualite_prix) dans le rendu.
    Si aucun custom_prompt n'est fourni, on retombe sur le format historique
    avec les 3 H2 nommés (rétro-compat avec les avis déjà publiés).

    Si `faq_questions` est fourni (liste non vide), Claude est instruit de
    reproduire ces questions verbatim et ne génère QUE les réponses. On force
    aussi côté Python l'alignement (les questions retournées sont remplacées
    par les questions imposées en cas de drift).

    Si `persona_prompt` est fourni (lu depuis config.yaml), il est injecté à
    la fois dans le 1er appel (build_generation_prompt) et le 2e appel
    (generate_sections_html) pour garantir la cohérence de ton sur toute la
    page (intro, en bref, sections custom, FAQ, verdict)."""
    # Normalisation de la liste FAQ imposée
    forced_faq = [q.strip() for q in (faq_questions or []) if isinstance(q, str) and q.strip()]

    system, user = build_generation_prompt(row, site, faq_questions=forced_faq, persona_prompt=persona_prompt)
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

    # ─── Génération du bloc sections custom (si prompt fourni) ──────────
    sections_html = ""
    sections_toc: list = []
    if custom_prompt and custom_prompt.strip():
        try:
            sections_html, sections_toc = generate_sections_html(row, site, custom_prompt, persona_prompt=persona_prompt)
        except Exception as e:
            print(f"    ⚠ Échec génération sections custom : {e}")
            # On garde les 3 H2 standards en fallback
            sections_html = ""
            sections_toc = []

    # ─── Réalignement FAQ avec les questions imposées ──────────────────────
    # Si l'éditeur a saisi une liste, on FORCE les questions à correspondre
    # même si Claude a dérivé. On garde les réponses générées dans l'ordre.
    faq_generated = data.get("faq") or []
    if forced_faq:
        aligned = []
        for i, q in enumerate(forced_faq):
            # Récupère la réponse à l'index correspondant si Claude a respecté
            # l'ordre. Sinon : réponse vide (le template j2 affichera quand
            # même la question, et Julien pourra éditer manuellement).
            r = ""
            if i < len(faq_generated) and isinstance(faq_generated[i], dict):
                r = (faq_generated[i].get("r") or "").strip()
            aligned.append({"q": q, "r": r})
        faq_final = aligned
    else:
        faq_final = faq_generated

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
        "faq": faq_final,
        "verdict": data.get("verdict", ""),
        "meta_title": data.get("meta_title", ""),
        "meta_description": data.get("meta_description", ""),
        # Bloc HTML libre généré à partir du prompt custom. Vide si pas de
        # custom_prompt fourni → le template j2 retombe sur les 3 H2 standards.
        "sections_html": sections_html,
        # Liste des H2 du sections_html avec leurs IDs d'ancre, pour que le
        # template puisse construire un sommaire reflétant la structure custom
        # plutôt qu'une entrée unique "Analyse détaillée".
        "sections_toc": sections_toc,
    }


# ─── Génération du bloc sections via prompt custom ────────────────────────

SECTIONS_HTML_SYSTEM_PROMPT = """Tu es un rédacteur SEO francophone spécialisé dans les avis produits.
Tu écris des sections d'avis en HTML pur, prêt à être inséré dans une page web.

RÈGLES TECHNIQUES IMPÉRATIVES :
- HTML pur uniquement : <h2>, <h3>, <p>, <strong>, <em>, <ul>, <li>
- AUCUNE balise <html>, <head>, <body>, <main>, <article>, <section>, <div>
- AUCUN markdown, AUCUN ``` code block
- Commence DIRECTEMENT par un <h2>
- N'invente JAMAIS de chiffres précis, partenariats ou récompenses : reste sur des
  faits notoires ou des analyses générales si tu manques d'éléments
- Aucun tiret long (—), utilise des virgules ou des points
- Tu réponds UNIQUEMENT avec le HTML, sans préambule ni commentaire

RÈGLES ÉDITORIALES :
- Adopte STRICTEMENT le persona éditorial qui te sera fourni en tête du user prompt
  (voix, ton, vouvoiement, niveau de pédagogie, angle prioritaire). Ce persona prime
  sur toute autre considération stylistique.
- Donne ton avis : un avis est une opinion argumentée, pas un résumé descriptif. Tu
  peux pointer ce qui marche, ce qui coince, à qui ça convient ou pas.
- Conforme E-E-A-T : appuie tes affirmations sur des éléments visibles (interface,
  tarification publique, retours utilisateurs typiques) plutôt que sur des données
  inventées."""


def _slugify_anchor(s: str) -> str:
    """Slugifie un titre pour servir d'ID HTML d'ancre. Strip les tags HTML
    qui pourraient être imbriqués (<strong>...</strong> dans un H2), normalise
    en ASCII lowercase, remplace tout caractère non alphanumérique par un tiret."""
    s = re.sub(r"<[^>]+>", "", s or "")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "section"


def _enrich_sections_html(html: str) -> tuple:
    """Parse les <h2>...</h2> du HTML, ajoute un attribut id="..." à chacun
    (slug du titre), et retourne (html_enrichi, [{titre, id}, ...]).

    La liste retournée permet au template j2 de construire le sommaire avec une
    ancre par H2. Si un <h2> contient déjà un id, on le préserve."""
    toc = []
    used_ids: set = set()

    def repl(m):
        existing_attrs = m.group(1) or ""
        inner = m.group(2)
        # Titre lisible : strip tags imbriqués (ex: <strong>) pour l'affichage TOC
        title = re.sub(r"<[^>]+>", "", inner).strip()
        # Réutilise un id existant si présent dans le HTML retourné par Claude
        id_match = re.search(r'\bid\s*=\s*"([^"]+)"', existing_attrs)
        if id_match:
            slug = id_match.group(1)
            new_attrs = existing_attrs
        else:
            base = _slugify_anchor(title)
            slug = base
            n = 2
            while slug in used_ids:
                slug = f"{base}-{n}"
                n += 1
            # On ajoute l'id sans toucher aux autres attributs éventuels
            new_attrs = f'{existing_attrs} id="{slug}"'
        used_ids.add(slug)
        toc.append({"titre": title, "id": slug})
        return f"<h2{new_attrs}>{inner}</h2>"

    new_html = re.sub(
        r"<h2([^>]*)>(.*?)</h2>",
        repl, html, flags=re.DOTALL | re.IGNORECASE
    )
    return new_html, toc


def generate_sections_html(row: dict, site: dict, custom_prompt: str, persona_prompt: str = "") -> tuple:
    """Génère le bloc HTML des sections H2 entre le sommaire et 'Retours
    d'expérience des utilisateurs', à partir d'un prompt rédigé par l'éditeur.

    Le prompt est libre — il contient la structure Hn souhaitée et les
    instructions de rédaction. On l'enrichit avec les métadonnées de l'avis
    (marque, catégorie, sentiment) pour cadrer le ton.

    Si `persona_prompt` est fourni (lu depuis config.yaml), il est injecté
    en tête du user prompt pour aligner le ton/style/persona avec le 1er appel
    Claude (build_generation_prompt). Sans persona, ton neutre par défaut.

    Retourne un tuple (html_enrichi, sections_toc) :
      - html_enrichi : le HTML retourné par Claude, nettoyé, avec un id="..."
        ajouté à chaque <h2> pour servir d'ancre depuis le sommaire
      - sections_toc : liste [{titre, id}, ...] pour construire le sommaire"""
    marque = row.get("marque", "").strip()
    categorie = row.get("categorie", "").strip()
    sentiment = normalize_sentiment(row.get("sentiment", ""))
    note = parse_note(row.get("note_globale", ""))
    year = str(site.get("year") or datetime.now(PARIS).year)
    cible = (row.get("cible") or "").strip()

    # Persona éditorial : injecté en tête pour aligner le ton avec le 1er appel
    persona_section = ""
    if persona_prompt and persona_prompt.strip():
        persona_section = (
            "PERSONA ÉDITORIAL (à incarner pour toute la rédaction — c'est ta voix, "
            "ton ton, ton positionnement) :\n"
            f"{persona_prompt.strip()}\n\n"
        )

    user = f"""{persona_section}Tu rédiges les sections principales d'un avis sur **{marque}** ({categorie}).

CONTEXTE DE L'AVIS :
- Marque : {marque}
- Catégorie : {categorie}
- Sentiment global : {sentiment}
- Note éditeur : {note}/5
- Cible : {cible or "(à déduire de la marque)"}
- Année : {year}

INSTRUCTIONS DE L'ÉDITEUR (à respecter strictement, c'est ta structure et ton brief) :

{custom_prompt.strip()}

Réponds avec le HTML des sections, prêt à être inséré tel quel dans la page (commence par <h2>)."""

    raw = call_claude(SECTIONS_HTML_SYSTEM_PROMPT, user, max_tokens=4000)
    raw = strip_code_fences(raw)
    # Petit nettoyage défensif : si Claude a quand même ajouté un wrapper, on
    # retire les balises inutiles. Si Claude a renvoyé un préambule avant le
    # premier <h2>, on coupe avant.
    raw = re.sub(r"^(?:.*?)(<h[1-6])", r"\1", raw, count=1, flags=re.DOTALL | re.IGNORECASE)
    raw = re.sub(r"</?(?:html|body|head|main|article|section|div)[^>]*>", "", raw, flags=re.IGNORECASE)
    # Enrichit chaque <h2> avec un id="..." et extrait la TOC pour le template
    enriched_html, toc = _enrich_sections_html(raw.strip())
    return enriched_html, toc


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
        # Bloc HTML libre des sections principales (remplace h2_fonctionnalites,
        # h2_support, h2_qualite_prix dans le rendu si non vide). Cf. template
        # avis-post.html.j2.
        "sections_html": generated.get("sections_html", ""),
        # Liste [{titre, id}, ...] des H2 du sections_html, utilisée par le
        # template pour construire le sommaire dynamique reflétant la structure
        # custom imposée par l'éditeur.
        "sections_toc": generated.get("sections_toc", []),
        # SEO
        "meta_title": (row.get("meta_title") or generated.get("meta_title") or f"Avis {marque} : notre verdict").strip(),
        "meta_description": (row.get("meta_description") or generated.get("meta_description") or "").strip(),
        "link_anchors": link_anchors,
        # Configuration éditoriale (lue par avis_publish_scheduled au build et
        # éditable depuis le dashboard ou directement dans le .md).
        # Sert à régénérer ou comprendre comment l'IA a calibré la longueur.
        "mot_minimum": _safe_int(row.get("mot_minimum"), 800),
        # Date
        "date": pub_iso,
    }


def _safe_int(value, default: int) -> int:
    """Cast tolérant pour les colonnes numériques (chaînes vides, espaces, etc.)."""
    try:
        s = str(value or "").strip()
        return int(s) if s else default
    except Exception:
        return default


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
        # `mot_minimum` est purement informatif côté .md déjà publié (la
        # longueur du contenu existant n'est pas régénérée). Mais on la sync
        # quand même pour que le dashboard reflète la valeur courante de la sheet.
        if row.get("mot_minimum"):
            new_fm["mot_minimum"] = _safe_int(row["mot_minimum"], new_fm.get("mot_minimum", 800))
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

    # ─── Brouillons (prompt custom par slug) ──────────────────────────────
    # Le fichier _drafts.json est géré par le dashboard via
    # /api/sites/<siteId>/avis/draft/<slug>. Format :
    #   { "avis-qonto": { "prompt_custom": "...", "updated": "..." }, ... }
    # Si la marque qu'on s'apprête à publier a un prompt ici, on l'utilise
    # pour générer le bloc sections_html (qui remplace les 3 H2 standards).
    drafts_file = posts_dir / "_drafts.json"
    drafts: dict = {}
    if drafts_file.exists():
        try:
            drafts = json.loads(drafts_file.read_text(encoding="utf-8")) or {}
            if not isinstance(drafts, dict):
                drafts = {}
        except Exception:
            drafts = {}

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
        # ⚠ Nouveau workflow (mai 2026) : plus de génération automatique.
        # Les avis ne sont publiés QUE quand Julien clique "Générer & Publier"
        # depuis le dashboard, ce qui déclenche le workflow avec FORCE_TITLES.
        # Si FORCE_TITLES n'est pas renseigné, on saute (l'avis reste en
        # brouillon visible dans le dashboard).
        if not is_forced:
            continue
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
        # Récupère le prompt custom + questions FAQ pour ce slug (saisis via
        # le dashboard et stockés dans _drafts.json).
        # - custom_prompt : utilisé pour générer le bloc sections_html
        # - faq_questions : liste de questions FAQ à imposer verbatim (Claude
        #   ne génère que les réponses, évite le doublon)
        custom_prompt = ""
        faq_questions: list = []
        draft_entry = drafts.get(slug) if isinstance(drafts.get(slug), dict) else None
        if draft_entry:
            custom_prompt = (draft_entry.get("prompt_custom") or "").strip()
            raw_faq = draft_entry.get("faq_questions")
            if isinstance(raw_faq, list):
                faq_questions = [q.strip() for q in raw_faq if isinstance(q, str) and q.strip()]
        if custom_prompt:
            print(f"    📝 Prompt custom détecté ({len(custom_prompt)} caractères)")
        if faq_questions:
            print(f"    ❓ {len(faq_questions)} question(s) FAQ imposée(s)")

        try:
            generated = generate_avis_content(
                row,
                config.get("site", {}),
                custom_prompt=custom_prompt,
                faq_questions=faq_questions,
            )
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
