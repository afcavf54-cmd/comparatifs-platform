"""Source de vérité UNIQUE du modèle Claude pour tous les scripts Python.

Pour changer la version de Sonnet (ou tester Opus/Haiku), il suffit de modifier
la valeur par défaut ci-dessous : ça s'applique PARTOUT d'un coup — génération
des classements (enrich_editorial), articles de blog (blog_publish_scheduled) et
avis (avis_publish_scheduled). Plus besoin d'éditer chaque script un par un.

Surchargeable à l'exécution sans toucher au code via la variable d'environnement
CLAUDE_MODEL (ex. pour tester un modèle ponctuellement).

Historique : "claude-sonnet-4-20250514" (Sonnet 4) a été retiré par Anthropic
(→ HTTP 404 not_found_error sur chaque appel). Migré vers "claude-sonnet-4-6".
"""
import os

# ⇩⇩⇩  LA SEULE LIGNE À CHANGER POUR METTRE À JOUR LE MODÈLE PARTOUT  ⇩⇩⇩
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")
