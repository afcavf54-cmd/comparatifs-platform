import { NextRequest, NextResponse } from 'next/server'
import { triggerWorkflow, getWorkflowRuns } from '../../../lib/github'

export async function POST(req: NextRequest) {
  const { siteId, workflowFile, skipEnrich } = await req.json()
  if (!siteId) return NextResponse.json({ error: 'siteId requis' }, { status: 400 })
  const wf = workflowFile || 'generate-scpi.yml'
  const ok = await triggerWorkflow(wf, {
    site: siteId,
    skip_enrich: skipEnrich === true ? 'true' : 'false',
  })
  if (!ok) return NextResponse.json({ error: 'Erreur déclenchement workflow' }, { status: 500 })
  return NextResponse.json({ ok: true, message: `Workflow ${wf} déclenché pour ${siteId}` })
}

export async function GET() {
  const runs = await getWorkflowRuns(20)
  return NextResponse.json(runs)
}
