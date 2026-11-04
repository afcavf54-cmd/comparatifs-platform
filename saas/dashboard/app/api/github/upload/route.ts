import { NextRequest, NextResponse } from 'next/server'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!
const GITHUB_OWNER = process.env.GITHUB_OWNER!
const GITHUB_REPO = process.env.GITHUB_REPO!

const ghHeaders = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  'Content-Type': 'application/json',
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}
const contentsUrl = (path: string) =>
  `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Récupère le SHA actuel du fichier (undefined si absent). Toujours no-store :
// on veut la valeur fraîche, pas une version mise en cache.
async function currentSha(path: string): Promise<string | undefined> {
  try {
    const r = await fetch(contentsUrl(path), { headers: ghHeaders, cache: 'no-store' })
    if (!r.ok) return undefined
    const d = await r.json().catch(() => null)
    return d && typeof d.sha === 'string' ? d.sha : undefined
  } catch { return undefined }
}

const isConflict = (status: number, msg: string) =>
  status === 409 || /expected|does not match|fast forward|conflict/i.test(msg)

export async function POST(req: NextRequest) {
  try {
    const { path, content, message } = await req.json()
    if (!path || !content) return NextResponse.json({ ok: false, error: 'path and content required' }, { status: 400 })

    // Le workflow de génération commit aussi sur `main` : la branche peut bouger
    // entre la lecture du SHA et l'écriture. On (re)lit le SHA à jour côté serveur
    // juste avant chaque PUT et on réessaie en cas de conflit de SHA.
    let lastErr = ''
    for (let attempt = 0; attempt < 4; attempt++) {
      const sha = await currentSha(path) // fraîche à chaque tentative
      const body: Record<string, string> = { message: message || `Upload: ${path}`, content }
      if (sha) body.sha = sha
      const r = await fetch(contentsUrl(path), { method: 'PUT', headers: ghHeaders, body: JSON.stringify(body) })
      if (r.ok) return NextResponse.json({ ok: true })
      const err = await r.json().catch(() => ({} as any))
      lastErr = err.message || `HTTP ${r.status}`
      if (isConflict(r.status, lastErr)) { await sleep(350 * (attempt + 1)); continue }
      return NextResponse.json({ ok: false, error: lastErr }, { status: 502 })
    }
    return NextResponse.json({ ok: false, error: `Conflit persistant : ${lastErr}` }, { status: 409 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { path, message } = await req.json()
    if (!path) return NextResponse.json({ ok: false, error: 'path required' }, { status: 400 })

    let lastErr = ''
    for (let attempt = 0; attempt < 4; attempt++) {
      const sha = await currentSha(path)
      if (!sha) return NextResponse.json({ ok: true }) // déjà absent → rien à supprimer
      const r = await fetch(contentsUrl(path), {
        method: 'DELETE',
        headers: ghHeaders,
        body: JSON.stringify({ message: message || `Delete: ${path}`, sha }),
      })
      if (r.ok) return NextResponse.json({ ok: true })
      const err = await r.json().catch(() => ({} as any))
      lastErr = err.message || `HTTP ${r.status}`
      if (isConflict(r.status, lastErr)) { await sleep(350 * (attempt + 1)); continue }
      return NextResponse.json({ ok: false, error: lastErr }, { status: 502 })
    }
    return NextResponse.json({ ok: false, error: `Conflit persistant : ${lastErr}` }, { status: 409 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
