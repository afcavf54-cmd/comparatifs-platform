import { NextRequest, NextResponse } from 'next/server'
import yaml from 'js-yaml'
import { getFile } from '../../../../../lib/github'

/**
 * GET /api/sites/[siteId]/products
 *
 * Retourne la liste des produits depuis `platform/sites/<id>/products.yaml`.
 * Utilisé par la page Éditorial du dashboard pour récupérer les champs
 * `url_affiliation` et `cta_text` qui ne sont pas toujours présents dans
 * la Google Sheet (mais qui le sont dans le YAML local, géré à la main).
 *
 * En mode debug (?debug=1), retourne aussi le contenu brut du YAML
 * pour diagnostiquer les problèmes de parsing.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const debug = new URL(req.url).searchParams.get('debug') === '1'
  const filePath = `platform/sites/${siteId}/products.yaml`
  const file = await getFile(filePath)

  if (!file) {
    return NextResponse.json({
      products: [],
      ...(debug && { debug: { error: 'File not found', path: filePath } }),
    })
  }

  try {
    const parsed: any = yaml.load(file.content)
    const products = Array.isArray(parsed?.products) ? parsed.products : []
    return NextResponse.json({
      products,
      ...(debug && {
        debug: {
          path: filePath,
          file_size: file.content.length,
          first_300_chars: file.content.slice(0, 300),
          parsed_keys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : [],
          products_count: products.length,
        },
      }),
    })
  } catch (e: any) {
    return NextResponse.json({
      products: [],
      error: 'YAML parse error: ' + e.message,
      ...(debug && {
        debug: {
          path: filePath,
          first_300_chars: file.content.slice(0, 300),
        },
      }),
    })
  }
}
