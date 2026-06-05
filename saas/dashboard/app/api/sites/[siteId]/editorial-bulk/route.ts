import { NextRequest, NextResponse } from 'next/server'
import { getFile, putFile } from '../../../../../lib/github'
import { gunzipSync } from 'zlib'

type Params = { params: Promise<{ siteId: string }> }

// ─────────────────────────────────────────────────────────────────────
// Sauvegarde de gros editorial.json (> 4.5 MB raw = limite Vercel POST).
//
// Modes :
//   - 'overwrite' : remplace tout le fichier (par défaut, pour petits payloads)
//   - 'merge'     : lit le fichier existant, merge les clés reçues, PUT
//                   → permet d'envoyer en plusieurs chunks séquentiels
//                     (chaque chunk = un sous-ensemble des clés à mettre à jour)
//
// Body attendu :
//   {
//     content_gzip_base64: string  // gzip(JSON.stringify(data)) → base64
//     message?: string
//     mode?: 'overwrite' | 'merge'  // défaut 'overwrite'
//     chunk_idx?: number            // info debug (logs commit)
//     total_chunks?: number
//   }
// ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  const { siteId } = await params
  try {
    const body = await req.json()
    const { content_gzip_base64, message, mode = 'overwrite', chunk_idx, total_chunks } = body
    if (!content_gzip_base64 || typeof content_gzip_base64 !== 'string') {
      return NextResponse.json({ error: 'content_gzip_base64 requis' }, { status: 400 })
    }

    // Décompression
    let chunkContent: string
    try {
      const compressed = Buffer.from(content_gzip_base64, 'base64')
      chunkContent = gunzipSync(compressed).toString('utf-8')
    } catch (e: any) {
      return NextResponse.json({ error: `Décompression échouée : ${e?.message}` }, { status: 400 })
    }

    // Validation JSON du chunk
    let chunkData: Record<string, any>
    try {
      chunkData = JSON.parse(chunkContent)
    } catch (e: any) {
      return NextResponse.json({ error: `JSON invalide après décompression : ${e?.message}` }, { status: 400 })
    }
    if (typeof chunkData !== 'object' || chunkData === null || Array.isArray(chunkData)) {
      return NextResponse.json({ error: 'Le payload doit être un objet JSON' }, { status: 400 })
    }

    const path = `platform/sites/${siteId}/editorial.json`

    // ── Mode overwrite : remplace tout ─────────────────────────────────
    if (mode === 'overwrite') {
      const finalContent = JSON.stringify(chunkData, null, 2)
      const sizeKb = (finalContent.length / 1024).toFixed(0)
      const ok = await putFile(path, finalContent, message || `HUB: Update editorial ${siteId} (${sizeKb} Ko)`)
      if (!ok) return NextResponse.json({ error: 'Erreur GitHub (putFile)' }, { status: 500 })
      return NextResponse.json({ ok: true, mode, keys: Object.keys(chunkData).length, size_kb: Number(sizeKb) })
    }

    // ── Mode merge : lit existant + merge + PUT ────────────────────────
    let existing: Record<string, any> = {}
    const existingFile = await getFile(path)
    if (existingFile?.content) {
      try { existing = JSON.parse(existingFile.content) } catch {
        // Fichier corrompu ou n'existant pas → on repart à vide (chunk = premier)
        existing = {}
      }
    }
    const merged = { ...existing, ...chunkData }
    const finalContent = JSON.stringify(merged, null, 2)
    const sizeKb = (finalContent.length / 1024).toFixed(0)
    const chunkInfo = (chunk_idx !== undefined && total_chunks)
      ? ` [chunk ${Number(chunk_idx) + 1}/${total_chunks}]`
      : ''
    const ok = await putFile(
      path,
      finalContent,
      message || `HUB: Update editorial ${siteId}${chunkInfo} (${Object.keys(chunkData).length} clés, total ${sizeKb} Ko)`
    )
    if (!ok) return NextResponse.json({ error: 'Erreur GitHub (putFile)' }, { status: 500 })
    return NextResponse.json({
      ok: true,
      mode,
      keys_in_chunk: Object.keys(chunkData).length,
      total_keys: Object.keys(merged).length,
      size_kb: Number(sizeKb),
    })
  } catch (e: any) {
    console.error('[editorial-bulk] Exception :', e)
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
