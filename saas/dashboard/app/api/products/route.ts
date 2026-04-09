// app/api/products/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const site_id = searchParams.get('site_id')
  const format  = searchParams.get('format')   // ?format=yaml pour export

  if (!site_id) return NextResponse.json({ error: 'site_id requis' }, { status: 400 })

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('site_id', site_id)
    .eq('active', true)
    .order('nom')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Export YAML pour le générateur Python
  if (format === 'yaml') {
    const yaml = toYaml(data)
    return new NextResponse(yaml, {
      headers: { 'Content-Type': 'text/yaml' }
    })
  }

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const { data, error } = await supabase
    .from('products')
    .upsert(body, { onConflict: 'site_id,slug' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const { error } = await supabase
    .from('products')
    .update({ active: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── YAML export ───────────────────────────────────────────────
function toYaml(products: any[]): string {
  const lines = ['products:\n']
  for (const p of products) {
    lines.push(`  - slug: ${p.slug}`)
    lines.push(`    nom: "${p.nom}"`)
    lines.push(`    marque: "${p.marque}"`)
    lines.push(`    type: ${p.type}`)
    lines.push(`    prix: ${p.prix}`)
    lines.push(`    poids: ${p.poids}`)
    lines.push(`    age: "${p.age || 'Naissance–4 ans'}"`)
    lines.push(`    note_manip: ${p.note_manip}`)
    lines.push(`    note_confort: ${p.note_confort}`)
    lines.push(`    note_pliage: ${p.note_pliage}`)
    lines.push(`    siege_auto: ${p.siege_auto}`)
    lines.push(`    note_amazon: "${p.note_amazon}"`)
    if (p.description) {
      lines.push(`    description: >`)
      lines.push(`      ${p.description.replace(/\n/g, '\n      ')}`)
    }
    if (p.points_forts?.length) {
      lines.push(`    points_forts:`)
      p.points_forts.forEach((f: string) => lines.push(`      - "${f}"`))
    }
    if (p.points_faibles?.length) {
      lines.push(`    points_faibles:`)
      p.points_faibles.forEach((f: string) => lines.push(`      - "${f}"`))
    }
    if (p.verdict_si?.length) {
      lines.push(`    verdict_si:`)
      p.verdict_si.forEach((f: string) => lines.push(`      - "${f}"`))
    }
    lines.push('')
  }
  return lines.join('\n')
}
