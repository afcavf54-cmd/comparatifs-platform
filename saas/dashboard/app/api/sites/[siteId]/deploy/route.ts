import { NextRequest, NextResponse } from 'next/server'
import { triggerWorkflow } from '../../../../../lib/github'

type Params = { params: Promise<{ siteId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { siteId } = await params
  const body = await req.json()
  const skip_enrich = body.skip_enrich ?? true

  const ok = await triggerWorkflow('generate-scpi.yml', {
    site: siteId,
    skip_enrich: skip_enrich.toString(),
    schedule: ''
  })

  if (ok) return NextResponse.json({ success: true })
  return NextResponse.json({ error: 'Erreur déclenchement workflow' }, { status: 500 })
}
