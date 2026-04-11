const GITHUB_TOKEN = process.env.GITHUB_TOKEN!
const GITHUB_OWNER = process.env.GITHUB_OWNER!
const GITHUB_REPO = process.env.GITHUB_REPO!
const BASE = 'https://api.github.com'

const headers = {
  'Authorization': `Bearer ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
}

export async function getFile(path: string): Promise<{ content: string; sha: string } | null> {
  try {
    const res = await fetch(`${BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, { headers, cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    return { content: Buffer.from(data.content, 'base64').toString('utf-8'), sha: data.sha }
  } catch { return null }
}

export async function putFile(path: string, content: string, message: string): Promise<boolean> {
  try {
    const existing = await getFile(path)
    const body: Record<string, string> = {
      message, content: Buffer.from(content).toString('base64'),
    }
    if (existing) body.sha = existing.sha
    const res = await fetch(`${BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
      method: 'PUT', headers, body: JSON.stringify(body)
    })
    return res.ok
  } catch { return false }
}

export async function listDir(path: string): Promise<Array<{ name: string; type: string; path: string }>> {
  try {
    const res = await fetch(`${BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, { headers, cache: 'no-store' })
    if (!res.ok) return []
    return await res.json()
  } catch { return [] }
}

export async function triggerWorkflow(workflowFile: string, inputs: Record<string, string> = {}): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${workflowFile}/dispatches`, {
      method: 'POST', headers,
      body: JSON.stringify({ ref: 'main', inputs })
    })
    return res.ok
  } catch { return false }
}

export async function getWorkflowRuns(limit = 10): Promise<Array<{
  id: number; name: string; status: string; conclusion: string | null;
  created_at: string; updated_at: string; html_url: string;
  head_commit: { message: string }
}>> {
  try {
    const res = await fetch(`${BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?per_page=${limit}`, { headers, cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    return data.workflow_runs || []
  } catch { return [] }
}
