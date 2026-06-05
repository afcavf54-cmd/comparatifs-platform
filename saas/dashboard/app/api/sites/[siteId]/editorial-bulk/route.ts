import { NextRequest, NextResponse } from 'next/server'
import { putFile } from '../../../../../lib/github'
import { gunzipSync } from 'zlib'

type Params = { params: Promise<{ siteId: string }> }

// ─────────────────────────────────────────────────────────────────────
// Endpoint dédié à la sauvegarde de gros editorial.json (>4.5 MB raw).
//
// Vercel Hobby limite le body POST à 4.5 MB. Or l'editorial.json de sites
// avec beaucoup de classements (ex: startuponly-com = 18 MB) dépasse.
//
// Cet endpoint accepte le payload gzippé+base64 : ~85% de compression sur
// du JSON, donc 18 MB → ~2-3 MB qui passe largement.
//
// Body attendu :
//   {
//     content_gzip_base64: string  // JSON.stringify(merged) → gzip → base64
//     message?: string             // commit message GitHub
//   }
// ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  const { siteId } = await params
  try {
    const body = await req.json()
    const { content_gzip_base64, message } = body
    if (!content_gzip_base64 || typeof content_gzip_base64 !== 'string') {
      return NextResponse.json({ error: 'content_gzip_base64 requis' }, { status: 400 })
    }

    // Décompression
    let content: string
    try {
      const compressed = Buffer.from(content_gzip_base64, 'base64')
      content = gunzipSync(compressed).toString('utf-8')
    } catch (e: any) {
      return NextResponse.json({ error: `Décompression échouée : ${e?.message || 'gzip invalide'}` }, { status: 400 })
    }

    // Validation JSON (évite de pousser un fichier corrompu sur GitHub)
    try {
      JSON.parse(content)
    } catch (e: any) {
      return NextResponse.json({ error: `JSON invalide après décompression : ${e?.message}` }, { status: 400 })
    }

    const path = `platform/sites/${siteId}/editorial.json`
    const sizeKb = (content.length / 1024).toFixed(0)
    const ok = await putFile(
      path,
      content,
      message || `HUB: Update editorial ${siteId} (${sizeKb} Ko via bulk endpoint)`
    )
    if (!ok) return NextResponse.json({ error: 'Erreur GitHub (putFile)' }, { status: 500 })
    return NextResponse.json({ ok: true, size_kb: Number(sizeKb) })
  } catch (e: any) {
    console.error('[editorial-bulk] Exception :', e)
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
