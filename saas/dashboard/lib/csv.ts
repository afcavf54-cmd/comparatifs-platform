// Parseur CSV partagé pour les 3 routes preview-sheet (avis, blog, classements).
// Bâti sur papaparse, qui est conforme RFC 4180 et gère correctement tous les
// cas vicieux que le parser custom précédent ratait :
//   - Virgules à l'intérieur des cellules quotées
//   - Newlines (\n, \r\n) à l'intérieur des cellules quotées
//   - Guillemets échappés ("") à l'intérieur des cellules
//   - Lignes vides intercalaires
//   - BOM en début de fichier
//   - Whitespace en début/fin de cellule
//
// Symptôme historique sans papaparse : si une cellule de la sheet contenait
// une virgule (ex: "Mon avis complet : comptabilité, facturation"), le parser
// custom la splittait en 2 valeurs → décalage de toutes les colonnes
// suivantes pour cette ligne dans le dashboard.
//
// Note : ce module ne dépend de RIEN d'autre que papaparse + une fonction
// slugify locale. Il peut être utilisé côté serveur (routes API) comme côté
// client si besoin.

import Papa from 'papaparse'

function slugify(s: string): string {
  return (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export interface ParsedCSV {
  headers: string[]
  rows: Record<string, string>[]
}

/**
 * Parse un CSV brut en retournant headers slugifiés et rows en dicts.
 *
 * Les headers sont normalisés en snake_case (ex: "Note Globale" → "note_globale").
 * Les valeurs des cellules sont trimées. Les lignes vides sont ignorées.
 *
 * @param raw  Le contenu CSV brut (avec ou sans BOM)
 * @returns    { headers: ["marque", "categorie", ...], rows: [{marque: "X", ...}, ...] }
 */
export function parseCSV(raw: string): ParsedCSV {
  if (!raw) return { headers: [], rows: [] }

  const result = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: 'greedy',         // ignore lignes vides ET lignes ne contenant que des séparateurs
    transformHeader: (h: string) => slugify(h),
    transform: (v: string) => (v ?? '').trim(),
  })

  // papaparse peut signaler des erreurs non-bloquantes (champs en trop, etc.).
  // On les log côté serveur pour debug sans planter le parsing.
  if (result.errors && result.errors.length > 0) {
    // En prod (Vercel) ces logs apparaissent dans les Function Logs.
    for (const err of result.errors.slice(0, 5)) {
      console.warn(`[parseCSV] ${err.type}/${err.code} row=${err.row}: ${err.message}`)
    }
  }

  const headers = (result.meta.fields || []).filter(Boolean)
  const rows = (result.data || []).filter(r => {
    // Ignore les rows complètement vides (papaparse peut en générer en fin de fichier)
    return headers.some(h => (r[h] || '').trim() !== '')
  })

  return { headers, rows }
}
