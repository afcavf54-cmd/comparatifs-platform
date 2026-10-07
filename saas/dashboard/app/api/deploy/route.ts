import { NextRequest, NextResponse } from 'next/server'
import { triggerWorkflow, getWorkflowRuns } from '../../../lib/github'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { siteId, workflowFile } = body
  // Accepter snake_case ET camelCase
  const skipEnrich = body.skipEnrich ?? body.skip_enrich ?? false
  const skipExisting = body.skipExisting ?? body.skip_existing ?? false
  // Comparateurs : mode "rythme" (ne rédige que comparators_per_day au hasard)
  // au lieu de tout le Sheet. Utilisé par le bouton "générer les comparateurs".
  const comparatorsDaily = body.comparatorsDaily ?? body.comparators_daily ?? false
  if (!siteId) return NextResponse.json({ error: 'siteId requis' }, { status: 400 })
  const wf = workflowFile || 'generate-scpi.yml'
  const ok = await triggerWorkflow(wf, {
    site: siteId,
    skip_enrich: skipEnrich === true ? 'true' : 'false',
    skip_existing: skipExisting === true ? 'true' : 'false',
    comparators_daily: comparatorsDaily === true ? 'true' : 'false',
  })
  if (!ok) return NextResponse.json({ error: 'Erreur déclenchement workflow' }, { status: 500 })
  return NextResponse.json({ ok: true, message: `Workflow ${wf} déclenché pour ${siteId}` })
}

export async function GET() {
  const runs = await getWorkflowRuns(20)
  return NextResponse.json(runs)
}
