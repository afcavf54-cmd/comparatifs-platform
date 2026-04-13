"""
Règles éditoriales centralisées — appliquées à tous les sites.
Modifier ce fichier suffit pour changer le formatage sur toute la plateforme.

RÈGLES DE STYLE GLOBALES (valables pour tous les sites et la génération IA) :
- Pas de tiret long (—) ni demi-tiret (–) dans les textes ou titres
- Utiliser le pipe (|) ou la virgule comme séparateur dans les titres
- Paragraphes de 3 lignes max
- Chiffres en gras automatique
"""
import re
import json
from pathlib import Path

# Charge les règles depuis editorial-rules.json si disponible
_rules_path = Path(__file__).parent.parent.parent / "editorial-rules.json"
_rules = {}
if _rules_path.exists():
    with open(_rules_path, encoding="utf-8") as f:
        _rules = json.load(f)

# ── Paramètres ──────────────────────────────────────────────────────────────
MAX_CHARS_PER_PARA = (
    _rules.get("text_formatting", {}).get("chars_per_line_estimate", 80) *
    _rules.get("text_formatting", {}).get("max_lines_per_paragraph", 3)
)  # ~240 chars = 3 lignes de 80 chars

BOLD_PATTERNS = [
    r'\b(\d+[,.]?\d*\s*%)',
    r'\b(\d+[,.]?\d*\s*€)',
    r'\b(\d+[,.]?\d*\s*M€)',
    r'\b(TD|TRI|TOF|PGA|CGP|AMF|ISR)\b',
    r'\b(0\s*%|zéro frais|sans frais d\'entrée|sans frais)\b',
]

FIELDS_TO_FORMAT = {
    "description_a", "description_b", "mix_text", "description",
    "intro_edito", "td_analyse", "verdict_text", "concurrents_text",
    "expert_performance", "expert_fiscalite", "expert_frais", "expert_decote",
    "risk_note", "short_desc",
}


def format_text(text: str, product_names: list = None) -> str:
    """Formate un texte HTML : paragraphes 3 lignes max + gras automatique."""
    if not text or not isinstance(text, str):
        return text

    # 1. Nettoie tirets longs (règle globale : pas de — sur le site)
    text = text.replace("—", " ").replace("–", "-").replace(" | ", ", ")

    # 2. Split en blocs existants
    parts = re.split(r'<br\s*/?>\s*<br\s*/?>', text)
    if len(parts) == 1:
        parts = re.split(r'\n{2,}', text)

    # 3. Redécoupe les blocs trop longs aux phrases
    new_parts = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if len(part) > MAX_CHARS_PER_PARA:
            sentences = re.split(r'(?<=[.!?])\s+', part)
            chunk = ""
            for s in sentences:
                if len(chunk) + len(s) > MAX_CHARS_PER_PARA and chunk:
                    new_parts.append(chunk.strip())
                    chunk = s
                else:
                    chunk = (chunk + " " + s).strip() if chunk else s
            if chunk:
                new_parts.append(chunk.strip())
        else:
            new_parts.append(part)

    # 4. Rejoint en paragraphes HTML
    text = "\n\n".join(
        f"<p>{p}</p>" if not p.startswith("<p") else p
        for p in new_parts if p
    )

    # 5. Gras automatique sur patterns clés
    def add_bold(t: str, pattern: str) -> str:
        result = []
        last = 0
        for m in re.finditer(pattern, t, flags=re.IGNORECASE):
            before = t[last:m.start()]
            # Ne pas doubler le gras
            if t[max(0, m.start()-8):m.start()].endswith('<strong>'):
                result.append(before + m.group(0))
            else:
                result.append(before + f"<strong>{m.group(0)}</strong>")
            last = m.end()
        result.append(t[last:])
        return "".join(result)

    for pattern in BOLD_PATTERNS:
        text = add_bold(text, pattern)

    # 6. Gras sur noms de produits
    if product_names:
        for name in sorted(product_names, key=len, reverse=True):
            if len(name) > 3:
                escaped = re.escape(name)
                text = re.sub(
                    rf'(?<!<strong>)\b({escaped})\b(?!</strong>)',
                    r'<strong>\1</strong>',
                    text
                )

    return text


def format_editorial(ed: dict, product_names: list = None) -> dict:
    """Applique format_text sur tous les champs texte d'un dict éditorial."""
    result = {}
    for key, value in ed.items():
        if key in FIELDS_TO_FORMAT and isinstance(value, str):
            result[key] = format_text(value, product_names)
        else:
            result[key] = value
    return result
