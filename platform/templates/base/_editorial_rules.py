"""
Règles éditoriales centralisées — appliquées à tous les sites.
Modifier ce fichier = applicable à tous les futurs sites.
"""

import re

def format_text(text: str) -> str:
    """
    Applique les règles éditoriales à un bloc de texte HTML :
    - Coupe après 3 phrases max → nouveau paragraphe
    - Ajoute du gras sur les chiffres clés et termes importants
    - Nettoie les tirets longs
    """
    if not text:
        return text

    # 1. Nettoie les tirets longs
    text = text.replace('—', '-').replace('–', '-')

    # 2. Si le texte est déjà en HTML avec <p>, on respecte la structure
    if '<p>' in text:
        return _bold_keywords(text)

    # 3. Découpe en phrases
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())

    # 4. Regroupe par blocs de 3 phrases max
    paragraphs = []
    for i in range(0, len(sentences), 3):
        chunk = ' '.join(sentences[i:i+3])
        if chunk:
            paragraphs.append(chunk)

    # 5. Reconstruit en HTML avec <p>
    html = '\n'.join(f'<p>{p}</p>' for p in paragraphs if p.strip())

    # 6. Ajoute le gras
    html = _bold_keywords(html)

    return html


def _bold_keywords(text: str) -> str:
    """
    Met en gras :
    - Les chiffres avec % ou € (ex: 9%, 250€, 7,5%)
    - Les chiffres importants (ex: 10 ans, 5 000€)
    - Certains mots clés financiers/stratégiques
    Ne double pas les <strong> déjà présents.
    """
    # Ne pas re-bolde ce qui est déjà en gras
    if text.count('<strong>') > 5:
        return text

    # Chiffres avec unités
    text = re.sub(
        r'(?<!</strong>)(?<!>)(\d+[\.,]?\d*\s*(?:%|€|M€|milliards?|millions?|ans?|mois|parts?))',
        r'<strong>\1</strong>',
        text
    )

    # Mots clés financiers importants (seulement si pas déjà dans un tag)
    KEYWORDS = [
        'sans frais d\'entrée', '0% de frais', 'zéro frais',
        'taux de distribution', 'hors France', '100% hors France',
        'label ISR', 'track record', 'zéro endettement',
        'capital variable', 'capital fixe',
        'diversification', 'rendement', 'performance',
    ]
    for kw in KEYWORDS:
        # Évite de bolde dans les attributs HTML
        text = re.sub(
            r'(?<!["\'/=>])(' + re.escape(kw) + r')(?!["\'/])',
            r'<strong>\1</strong>',
            text, flags=re.IGNORECASE, count=1
        )

    # Nettoie les doubles strong imbriqués
    text = re.sub(r'<strong><strong>', '<strong>', text)
    text = re.sub(r'</strong></strong>', '</strong>', text)
    text = re.sub(r'<strong>([^<]*)</strong>(\s*)<strong>', r'<strong>\1\2', text)

    return text


def format_editorial(editorial: dict) -> dict:
    """
    Applique format_text à tous les champs textuels d'un dict éditorial.
    """
    text_fields = ['description_a', 'description_b', 'mix_text']
    result = dict(editorial)
    for field in text_fields:
        if field in result and result[field]:
            result[field] = format_text(result[field])
    return result
