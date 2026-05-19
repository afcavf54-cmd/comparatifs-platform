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

// ── Seuil de bascule Contents API → Git Data API ─────────────────────────
// L'API Contents de GitHub plafonne à 1 MB EN LECTURE (renvoie content="" si
// le fichier dépasse) ET EN ÉCRITURE (le PUT échoue avec 422 au-dessus de 1 MB).
// On bascule sur la Git Data API (Blob/Tree/Commit/Ref) pour les fichiers gros.
// Marge de sécurité : 900 KB pour éviter les effets de bord du base64 encoding.
// Limite réelle de l'API Blob : 100 MB.
const LARGE_FILE_THRESHOLD = 900 * 1024  // 900 KB

export async function getFile(path: string): Promise<{ content: string; sha: string } | null> {
  try {
    // 1) Première tentative : API Contents (rapide, 1 seul appel HTTP)
    const res = await fetch(
      `${BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
      { headers, cache: 'no-store' }
    )
    if (!res.ok) {
      console.error(`[github.getFile] ${path} → HTTP ${res.status}`)
      return null
    }
    const data = await res.json()

    // 2) Cas standard : fichier <= 1 MB → content base64 inline
    if (data.content && data.encoding === 'base64') {
      return {
        content: Buffer.from(data.content, 'base64').toString('utf-8'),
        sha: data.sha,
      }
    }

    // 3) Cas gros fichier : GitHub renvoie content:"" et encoding:"none".
    //    On bascule sur l'API Blob qui supporte jusqu'à 100 MB.
    if (!data.sha) {
      console.error(`[github.getFile] ${path} → pas de sha, abandon`)
      return null
    }
    const blobRes = await fetch(
      `${BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/blobs/${data.sha}`,
      { headers, cache: 'no-store' }
    )
    if (!blobRes.ok) {
      console.error(`[github.getFile blob] ${path} sha=${data.sha} → HTTP ${blobRes.status}`)
      return null
    }
    const blobData = await blobRes.json()
    if (!blobData.content) {
      console.error(`[github.getFile blob] ${path} sha=${data.sha} → contenu vide`)
      return null
    }
    return {
      content: Buffer.from(blobData.content, 'base64').toString('utf-8'),
      sha: data.sha,
    }
  } catch (e) {
    console.error(`[github.getFile] ${path} → exception`, e)
    return null
  }
}

export async function putFile(path: string, content: string, message: string): Promise<boolean> {
  const contentBytes = Buffer.byteLength(content, 'utf-8')
  if (contentBytes < LARGE_FILE_THRESHOLD) {
    // Petits fichiers (cas général) : API Contents en 1 appel.
    return await putFileViaContentsApi(path, content, message)
  }
  // Gros fichiers : Git Data API (6 appels mais supporte jusqu'à 100 MB).
  return await putFileViaGitDataApi(path, content, message)
}

async function putFileViaContentsApi(path: string, content: string, message: string): Promise<boolean> {
  try {
    const existing = await getFile(path)
    const body: Record<string, string> = {
      message,
      content: Buffer.from(content).toString('base64'),
    }
    if (existing) body.sha = existing.sha
    const res = await fetch(
      `${BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
      { method: 'PUT', headers, body: JSON.stringify(body) }
    )
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.error(`[github.putFile contents] ${path} → HTTP ${res.status}`, txt.slice(0, 300))
    }
    return res.ok
  } catch (e) {
    console.error(`[github.putFile contents] ${path} → exception`, e)
    return false
  }
}

async function putFileViaGitDataApi(path: string, content: string, message: string): Promise<boolean> {
  try {
    const branch = 'main'

    // 1) Récupérer le SHA du commit HEAD de la branche
    const refRes = await fetch(
      `${BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${branch}`,
      { headers, cache: 'no-store' }
    )
    if (!refRes.ok) {
      console.error(`[github.putFile blob] ref → HTTP ${refRes.status}`)
      return false
    }
    const refData = await refRes.json()
    const parentSha: string = refData.object.sha

    // 2) Récupérer le tree du commit parent (pour base_tree)
    const commitRes = await fetch(
      `${BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits/${parentSha}`,
      { headers, cache: 'no-store' }
    )
    if (!commitRes.ok) {
      console.error(`[github.putFile blob] commit → HTTP ${commitRes.status}`)
      return false
    }
    const commitData = await commitRes.json()
    const baseTreeSha: string = commitData.tree.sha

    // 3) Créer un blob avec le nouveau contenu (encoding utf-8, pas besoin de base64)
    const blobRes = await fetch(
      `${BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/blobs`,
      { method: 'POST', headers, body: JSON.stringify({ content, encoding: 'utf-8' }) }
    )
    if (!blobRes.ok) {
      const txt = await blobRes.text().catch(() => '')
      console.error(`[github.putFile blob] blob create → HTTP ${blobRes.status}`, txt.slice(0, 300))
      return false
    }
    const blobData = await blobRes.json()
    const blobSha: string = blobData.sha

    // 4) Créer un nouvel arbre basé sur l'ancien, avec notre fichier modifié
    const treeRes = await fetch(
      `${BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: [{ path, mode: '100644', type: 'blob', sha: blobSha }],
        }),
      }
    )
    if (!treeRes.ok) {
      const txt = await treeRes.text().catch(() => '')
      console.error(`[github.putFile blob] tree create → HTTP ${treeRes.status}`, txt.slice(0, 300))
      return false
    }
    const treeData = await treeRes.json()
    const newTreeSha: string = treeData.sha

    // 5) Créer un commit pointant vers ce nouvel arbre
    const newCommitRes = await fetch(
      `${BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, tree: newTreeSha, parents: [parentSha] }),
      }
    )
    if (!newCommitRes.ok) {
      const txt = await newCommitRes.text().catch(() => '')
      console.error(`[github.putFile blob] commit create → HTTP ${newCommitRes.status}`, txt.slice(0, 300))
      return false
    }
    const newCommitData = await newCommitRes.json()
    const newCommitSha: string = newCommitData.sha

    // 6) Avancer la branche sur ce nouveau commit
    const patchRes = await fetch(
      `${BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${branch}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ sha: newCommitSha }),
      }
    )
    if (!patchRes.ok) {
      const txt = await patchRes.text().catch(() => '')
      console.error(`[github.putFile blob] ref patch → HTTP ${patchRes.status}`, txt.slice(0, 300))
      return false
    }
    return true
  } catch (e) {
    console.error(`[github.putFile blob] ${path} → exception`, e)
    return false
  }
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
