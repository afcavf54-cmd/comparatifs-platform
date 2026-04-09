// app/api/generate/route.ts
// POST /api/generate — déclenche la GitHub Action via repository_dispatch

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const GH_TOKEN  = process.env.GITHUB_TOKEN!
const GH_OWNER  = process.env.GITHUB_OWNER!   // ton username GitHub
const GH_REPO   = process.env.GITHUB_REPO!    // nom du repo

export async function POST(req: NextRequest) {
  const { site_slug, site_id, trigger = 'manual' } = await req.json()

  if (!site_slug) {
    return NextResponse.json({ error: 'site_slug requis' }, { status: 400 })
  }

  // 1. Créer un enregistrement build en base
  const { data: build, error: buildError } = await supabase
    .from('builds')
    .insert({
      site_id,
      status: 'pending',
      trigger,
    })
    .select()
    .single()

  if (buildError) {
    return NextResponse.json({ error: buildError.message }, { status: 500 })
  }

  // 2. Déclencher la GitHub Action via repository_dispatch
  const ghRes = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'generate',
        client_payload: {
          site: site_slug,
          site_id,
          build_id: build.id,
          trigger,
        },
      }),
    }
  )

  if (!ghRes.ok) {
    const err = await ghRes.text()
    await supabase.from('builds').update({ status: 'error', log: err }).eq('id', build.id)
    return NextResponse.json({ error: 'GitHub dispatch failed', detail: err }, { status: 500 })
  }

  // 3. Mettre à jour le statut du build
  await supabase.from('builds').update({ status: 'running' }).eq('id', build.id)

  return NextResponse.json({ ok: true, build_id: build.id })
}
