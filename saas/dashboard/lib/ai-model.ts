/**
 * Source de vérité UNIQUE du modèle Claude pour le dashboard.
 *
 * Pour changer la version de Sonnet (ou tester Opus/Haiku), modifier la valeur
 * par défaut ci-dessous : ça s'applique à TOUTES les routes API d'un coup
 * (blog, blog-meta, outils, codes-promo, regenerate-block, generate-text…).
 * Plus besoin d'éditer chaque route une par une.
 *
 * Surchargeable via la variable d'environnement CLAUDE_MODEL (Vercel) sans
 * toucher au code.
 *
 * Historique : "claude-sonnet-4-20250514" (Sonnet 4) retiré par Anthropic le
 * 15 juin 2026 (→ HTTP 404). Migré vers "claude-sonnet-4-6".
 */

// ⇩⇩⇩  LA SEULE LIGNE À CHANGER POUR METTRE À JOUR LE MODÈLE PARTOUT  ⇩⇩⇩
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
