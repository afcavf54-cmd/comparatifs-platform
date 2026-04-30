import { NextResponse } from 'next/server'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!
const OWNER = process.env.GITHUB_OWNER || 'afcavf54-cmd'
const REPO = process.env.GITHUB_REPO || 'comparatifs-platform'

async function getFile(path: string) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
  })
  if (!res.ok) return null
  const data = await res.json()
  return { content: Buffer.from(data.content, 'base64').toString('utf-8'), sha: data.sha }
}

async function putFile(path: string, content: string, sha: string, message: string) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), sha })
  })
  return res.ok
}

// GET — lire le schema
export async function GET(req: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  const file = await getFile(`platform/schemas/${templateId}.json`)
  if (!file) return NextResponse.json({ error: 'Schema introuvable' }, { status: 404 })
  return NextResponse.json(JSON.parse(file.content))
}

// PATCH — mettre à jour un champ (ex: global_prompt)
export async function PATCH(req: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  const body = await req.json()

  const file = await getFile(`platform/schemas/${templateId}.json`)
  if (!file) return NextResponse.json({ error: 'Schema introuvable' }, { status: 404 })

  const schema = JSON.parse(file.content)

  // Mettre à jour les champs
  if (body.global_prompt !== undefined) schema.global_prompt = body.global_prompt
  if (body.default_prompts !== undefined) schema.default_prompts = body.default_prompts

  const saved = await putFile(
    `platform/schemas/${templateId}.json`,
    JSON.stringify(schema, null, 2),
    file.sha,
    `HUB: Update ${templateId} global settings`
  )

  if (!saved) return NextResponse.json({ error: 'Erreur GitHub' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
