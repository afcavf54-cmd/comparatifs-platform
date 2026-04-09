// app/api/sites/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('sites')
    .select(`
      *,
      products:products(count),
      builds:builds(status, created_at)
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const { data, error } = await supabase
    .from('sites')
    .insert({
      slug:          body.slug,
      name:          body.name,
      domain:        body.domain,
      base_path:     body.base_path,
      accent:        body.accent      || '#E8410A',
      accent2:       body.accent2     || '#FF6B3D',
      bg:            body.bg          || '#F7F4EF',
      ink:           body.ink         || '#1A1714',
      font_title:    body.font_title  || 'DM Serif Display',
      font_body:     body.font_body   || 'Outfit',
      sheet_csv_url: body.sheet_csv_url || null,
      seo_year:      body.seo_year    || new Date().getFullYear(),
      status:        'draft',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
