import { NextRequest, NextResponse } from 'next/server'
import { getFile } from '../../../../../lib/github'

/**
 * GET /api/sites/[siteId]/products
 *
 * Retourne la liste des produits depuis `platform/sites/<id>/products.yaml`.
 * Utilisé par la page Éditorial du dashboard pour récupérer les champs
 * `url_affiliation` et `cta_text` qui ne sont pas toujours présents dans
 * la Google Sheet (mais qui le sont dans le YAML local, géré à la main).
 *
 * Le pipeline de génération `generate.py` consomme aussi products.yaml en
 * fallback quand la sheet n'est pas configurée. Cette route reflète la
 * même source pour que le dashboard et le site live restent cohérents.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const file = await getFile(`platform/sites/${siteId}/products.yaml`)
  if (!file) return NextResponse.json({ products: [] })

  // Mini-parser YAML pour le format spécifique de products.yaml :
  //   products:
  //     - slug: foo
  //       nom: Foo
  //       url_affiliation: "..."
  //       cta_text: "..."
  // On ne dépend pas d'une lib YAML lourde pour ce parsing simple.
  try {
    const raw = file.content
    const products: any[] = []
    let current: Record<string, any> | null = null
    const lines = raw.split('\n')
    for (const line of lines) {
      // Nouvelle entrée produit : `  - slug: foo` ou `  - key: value`
      const newItem = line.match(/^\s{2,4}-\s+([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i)
      if (newItem) {
        if (current) products.push(current)
        current = {}
        const k = newItem[1]
        const v = unquote(newItem[2].trim())
        current[k] = v
        continue
      }
      // Suite des champs d'un produit : `    key: value` (indentation alignée)
      const kv = line.match(/^\s{4,}([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i)
      if (kv && current !== null) {
        const k = kv[1]
        const v = unquote(kv[2].trim())
        current[k] = v
        continue
      }
    }
    if (current) products.push(current)
    return NextResponse.json({ products })
  } catch (e: any) {
    return NextResponse.json({ products: [], error: e.message })
  }
}

function unquote(s: string): string {
  if (!s) return s
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    return s.slice(1, -1).replace(/''/g, "'")
  }
  return s
}
