import { NextRequest, NextResponse } from 'next/server'

// ── API : gestion des catégories de sites ─────────────────────────
//
// Stocke les catégories dans hub-categories.json à la racine du repo :
//   {
//     "categories": {
//       "digicube-fr": "Entrepreneuriat",
//       "editions-dp-com": "Entrepreneuriat",
//       "comparateur-scpi": "Immobilier"
//     }
//   }
//
// Une catégorie "existe" dès qu'au moins un site y est assigné — pas
// de catalogue séparé. Catégorie vide / null = site "Sans catégorie".
//
// GET  /api/categories          → { categories: {...} }
// POST /api/categories          → body: { siteId, category }
//                                 (category vide ou null retire l'assignation)

const CATEGORIES_PATH = 'hub-categories.json'

async function loadCategories(baseUrl: string): Promise<Record<string, string>> {
  try {
    const r = await fetch(`${baseUrl}/api/github?path=${encodeURIComponent(CATEGORIES_PATH)}`)
    if (!r.ok) return {}
    const d = await r.json()
    if (!d.content) return {}
    try {
      const parsed = JSON.parse(d.content)
      return (parsed?.categories && typeof parsed.categories === 'object') ? parsed.categories : {}
    } catch {
      return {}
    }
  } catch {
    return {}
  }
}

export async function GET(req: NextRequest) {
  try {
    const baseUrl = req.nextUrl.origin
    const categories = await loadCategories(baseUrl)
    return NextResponse.json({ ok: true, categories })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const siteId: string = (body?.siteId || '').toString().trim()
    const rawCategory = body?.category
    const category: string = rawCategory == null ? '' : rawCategory.toString().trim()

    if (!siteId) {
      return NextResponse.json({ ok: false, error: 'siteId manquant' }, { status: 400 })
    }

    const baseUrl = req.nextUrl.origin

    // 1) Charger les catégories actuelles
    const current = await loadCategories(baseUrl)

    // 2) Pas de no-op : si pas de changement, on ne réécrit pas
    if ((current[siteId] || '') === category) {
      return NextResponse.json({ ok: true, categories: current, noop: true })
    }

    // 3) Appliquer le changement
    if (category) {
      current[siteId] = category
    } else {
      delete current[siteId]
    }

    // 4) Sauvegarder via l'API GitHub interne
    const newContent = JSON.stringify({ categories: current }, null, 2) + '\n'
    const wr = await fetch(`${baseUrl}/api/github`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: CATEGORIES_PATH,
        content: newContent,
        message: category
          ? `HUB: Set category "${category}" for ${siteId}`
          : `HUB: Remove category for ${siteId}`,
      }),
    })
    const wd = await wr.json()

    if (!wd.ok) {
      return NextResponse.json(
        { ok: false, error: wd.error || "Erreur d'écriture sur GitHub" },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, categories: current })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
