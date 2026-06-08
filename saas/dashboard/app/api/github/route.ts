import { NextRequest, NextResponse } from 'next/server'
import { putFile } from '../../../lib/github'

const BASE = 'https://api.github.com'
const headers = {
  'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

// ─────────────────────────────────────────────────────────────────────
// Cache mémoire 60s pour les GET sur /api/github.
//
// Justification : ouvrir 10 onglets d'édition d'articles ou recharger
// plusieurs fois la même page produit autant d'appels GitHub identiques,
// ce qui touche rapidement le secondary rate limit GitHub (~60 req/min).
// Avec un cache 60s en mémoire, les fetchs répétés sur le même path sont
// servis instantanément sans toucher l'API GitHub.
//
// Le cache est invalidé après chaque POST sur le même path (write-through)
// pour ne jamais servir une version périmée immédiatement après écriture.
//
// Limites :
//   - Mémoire process-local : entre deux instances Vercel (cold start ou
//     régions différentes), le cache repart à zéro. Acceptable car on
//     parle d'une optimisation, pas d'une source de vérité.
//   - TTL 60s : si on modifie le repo DIRECTEMENT sur GitHub (pas via le
//     HUB), le dashboard verra le changement avec ~60s de retard.
//
// Désactivation : passer ?nocache=1 sur l'URL pour bypass le cache (utile
// pour un refresh forcé côté front).
// ─────────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 60 * 1000  // 60s

type CacheEntry = { data: any; expiresAt: number }
const cache = new Map<string, CacheEntry>()

function cacheGet(key: string): any | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function cacheSet(key: string, data: any): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  // Garbage collection léger : si le cache dépasse 500 entrées, on purge les
  // 100 plus anciennes (LRU approximatif). Évite la fuite mémoire sur
  // process Vercel longue durée.
  if (cache.size > 500) {
    const sortedKeys = [...cache.entries()]
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
      .slice(0, 100)
      .map(([k]) => k)
    for (const k of sortedKeys) cache.delete(k)
  }
}

function cacheInvalidate(path: string): void {
  cache.delete(path)
  // Aussi invalider les listings parents : si on a écrit dans foo/bar/baz.md,
  // un éventuel listing en cache de foo/bar/ doit être ré-interrogé.
  const lastSlash = path.lastIndexOf('/')
  if (lastSlash > 0) {
    cache.delete(path.slice(0, lastSlash))
  }
}

export async function POST(req: NextRequest) {
  const { path, content, message } = await req.json()
  if (!path || !content) return NextResponse.json({ error: 'path et content requis' }, { status: 400 })
  const ok = await putFile(path, content, message || `HUB: Update ${path}`)
  if (!ok) return NextResponse.json({ error: 'Erreur GitHub' }, { status: 500 })
  // Write-through : on invalide les entrées en cache touchées par ce write
  // pour que le prochain GET récupère bien la version fraîche depuis GitHub.
  cacheInvalidate(path)
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const path = url.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path requis' }, { status: 400 })

  // Bypass cache si ?nocache=1 (utile pour un refresh forcé côté front)
  const noCache = url.searchParams.get('nocache') === '1'
  if (!noCache) {
    const cached = cacheGet(path)
    if (cached !== null) {
      return NextResponse.json(cached, { headers: { 'X-Cache': 'HIT' } })
    }
  }

  const repo = `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`
  // 1) Premier appel : API Contents (rapide, 1 seul HTTP call dans 99% des cas)
  const res = await fetch(`${BASE}/repos/${repo}/contents/${path}`, { headers, cache: 'no-store' })
  if (!res.ok) {
    console.error(`[/api/github GET] ${path} → HTTP ${res.status}`)
    return NextResponse.json({ error: 'Fichier non trouvé' }, { status: 404 })
  }
  const data = await res.json()
  // 2) Tableau = dossier → on retourne tel quel
  if (Array.isArray(data)) {
    cacheSet(path, data)
    return NextResponse.json(data, { headers: { 'X-Cache': 'MISS' } })
  }
  // 3) Fichier <= 1 MB : content base64 inline, décodage direct
  if (data.content && data.encoding === 'base64') {
    const result = {
      content: Buffer.from(data.content, 'base64').toString('utf-8'),
      sha: data.sha,
      name: data.name,
      path: data.path,
    }
    cacheSet(path, result)
    return NextResponse.json(result, { headers: { 'X-Cache': 'MISS' } })
  }
  // 4) Fichier > 1 MB : GitHub renvoie content:"" et encoding:"none".
  //    On bascule sur l'API Blob (/git/blobs/{sha}) qui supporte jusqu'à 100 MB.
  if (data.sha) {
    const blobRes = await fetch(
      `${BASE}/repos/${repo}/git/blobs/${data.sha}`,
      { headers, cache: 'no-store' }
    )
    if (blobRes.ok) {
      const blob = await blobRes.json()
      if (blob.content) {
        const result = {
          content: Buffer.from(blob.content, 'base64').toString('utf-8'),
          sha: data.sha,
          name: data.name,
          path: data.path,
        }
        cacheSet(path, result)
        return NextResponse.json(result, { headers: { 'X-Cache': 'MISS' } })
      }
      console.error(`[/api/github GET blob] ${path} sha=${data.sha} → contenu vide`)
    } else {
      console.error(`[/api/github GET blob] ${path} sha=${data.sha} → HTTP ${blobRes.status}`)
    }
  }
  // 5) Tout a échoué : on signale explicitement la troncature au front.
  return NextResponse.json({
    error: 'Lecture impossible (fichier trop volumineux et fallback Blob en échec)',
    truncated: true,
  }, { status: 500 })
}
