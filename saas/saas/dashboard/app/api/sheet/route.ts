import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'url requis' }, { status: 400 })
  try {
    const res = await fetch(url + '&t=' + Date.now())
    if (!res.ok) return NextResponse.json({ error: 'Sheet inaccessible' }, { status: 400 })
    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return NextResponse.json({ error: 'Sheet vide' }, { status: 400 })
    const headers = lines[0].split(',').map((h: string) => h.trim().replace(/^"|"$/g, ''))
    const rows = lines.slice(1).map(line => {
      const cols: string[] = []
      let cur = '', inQ = false
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ }
        else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
        else { cur += ch }
      }
      cols.push(cur.trim())
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = (cols[i] || '').replace(/^"|"$/g, '').trim() })
      return obj
    }).filter(r => r[headers[0]])
    return NextResponse.json({ headers, rows, count: rows.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
