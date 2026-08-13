import { NextRequest, NextResponse } from 'next/server'
import { triggerWorkflow } from '../../../../../../lib/github'

// Déclenche la synchro des prix (workflow GitHub Actions, exécution serveur).
// L'API financière n'est JAMAIS appelée depuis le navigateur : le bouton du
// dashboard appelle cette route, qui lance le workflow `sync-dividend-prices.yml`.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const ok = await triggerWorkflow('sync-dividend-prices.yml', { site: siteId })
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "Déclenchement impossible (secret FMP_API_KEY / permissions workflow ?)" },
      { status: 502 },
    )
  }
  return NextResponse.json({ ok: true })
}
