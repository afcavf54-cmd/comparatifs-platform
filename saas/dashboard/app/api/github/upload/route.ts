import { NextRequest, NextResponse } from 'next/server'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!
const GITHUB_OWNER = process.env.GITHUB_OWNER!
const GITHUB_REPO = process.env.GITHUB_REPO!

export async function POST(req: NextRequest) {
  try {
    const { path, content, message, sha } = await req.json()
    if (!path || !content) return NextResponse.json({ ok: false, error: 'path and content required' }, { status: 400 })
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`
    const body: any = { message: message || `Upload: ${path}`, content }
    if (sha) body.sha = sha
    const r = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) { const err = await r.json().catch(() => ({})); return NextResponse.json({ ok: false, error: err.message || `HTTP ${r.status}` }, { status: 502 }) }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { path, sha, message } = await req.json()
    if (!path || !sha) return NextResponse.json({ ok: false, error: 'path and sha required' }, { status: 400 })
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`
    const r = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
      body: JSON.stringify({ message: message || `Delete: ${path}`, sha }),
    })
    if (!r.ok) { const err = await r.json().catch(() => ({})); return NextResponse.json({ ok: false, error: err.message || `HTTP ${r.status}` }, { status: 502 }) }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
