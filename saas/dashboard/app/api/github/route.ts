import { NextRequest, NextResponse } from 'next/server'
import { putFile } from '../../../lib/github'

const BASE = 'https://api.github.com'
const headers = {
  'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

export async function POST(req: NextRequest) {
  const { path, content, message } = await req.json()
  if (!path || !content) return NextResponse.json({ error: 'path et content requis' }, { status: 400 })
  // putFile dans lib/github.ts gère lui-même la bascule Git Data API au-delà
  // de 900 KB (l'API Contents PUT plafonne à 1 MB).
  const ok = await putFile(path, content, message || `HUB: Update ${path}`)
  if (!ok) return NextResponse.json({ error: 'Erreur GitHub' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const path = url.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path requis' }, { status: 400 })

  const repo = `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`

  // 1) Premier appel : API Contents (rapide, 1 seul HTTP call dans 99% des cas)
  const res = await fetch(`${BASE}/repos/${repo}/contents/${path}`, { headers, cache: 'no-store' })
  if (!res.ok) {
    console.error(`[/api/github GET] ${path} → HTTP ${res.status}`)
    return NextResponse.json({ error: 'Fichier non trouvé' }, { status: 404 })
  }
  const data = await res.json()

  // 2) Tableau = dossier → on retourne tel quel
  if (Array.isArray(data)) return NextResponse.json(data)

  // 3) Fichier <= 1 MB : content base64 inline, décodage direct
  if (data.content && data.encoding === 'base64') {
    return NextResponse.json({
      content: Buffer.from(data.content, 'base64').toString('utf-8'),
      sha: data.sha,
      name: data.name,
      path: data.path,
    })
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
        return NextResponse.json({
          content: Buffer.from(blob.content, 'base64').toString('utf-8'),
          sha: data.sha,
          name: data.name,
          path: data.path,
        })
      }
      console.error(`[/api/github GET blob] ${path} sha=${data.sha} → contenu vide`)
    } else {
      console.error(`[/api/github GET blob] ${path} sha=${data.sha} → HTTP ${blobRes.status}`)
    }
  }

  // 5) Tout a échoué : on signale explicitement la troncature au front.
  //    Le patch défensif de page.tsx (classements) lit ce flag pour bloquer
  //    les sauvegardes destructives.
  return NextResponse.json({
    error: 'Lecture impossible (fichier trop volumineux et fallback Blob en échec)',
    truncated: true,
  }, { status: 500 })
}
