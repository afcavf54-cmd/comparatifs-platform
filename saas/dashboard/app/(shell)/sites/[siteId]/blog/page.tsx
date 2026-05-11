'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Post {
  title: string
  slug: string
  date: string
  categorie?: string
  status?: string
  meta_description?: string
  excerpt?: string
}

const STATUS_LABEL: Record<string, string> = {
  published: '✓ Publié',
  scheduled: '⏰ Programmé',
  draft: '✏️ Brouillon',
}

const STATUS_COLOR: Record<string, string> = {
  published: '#00D4AA',
  scheduled: '#F6AD55',
  draft: '#8B9CB0',
}

export default function BlogListPage() {
  const { siteId } = useParams()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  // Configuration sheet de programmation
  const [showSheetConfig, setShowSheetConfig] = useState(false)
  const [sheetUrl, setSheetUrl] = useState('')
  const [sheetUrlOriginal, setSheetUrlOriginal] = useState('')
  const [savingSheet, setSavingSheet] = useState(false)
  const [checkingSheet, setCheckingSheet] = useState(false)
  const [sheetMsg, setSheetMsg] = useState('')

  useEffect(() => { load(); loadConfig() }, [siteId])

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/sites/${siteId}/blog`)
      const data = await r.json()
      setPosts(data.posts || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function loadConfig() {
    try {
      const r = await fetch(`/api/sites/${siteId}/config`)
      const d = await r.json()
      setSheetUrl(d.blog_sheet_csv_url || '')
      setSheetUrlOriginal(d.blog_sheet_csv_url || '')
    } catch (e) { /* ignore */ }
  }

  async function saveSheet() {
    setSavingSheet(true); setSheetMsg('')
    try {
      const r = await fetch(`/api/sites/${siteId}/config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blog_sheet_csv_url: sheetUrl }),
      })
      if (r.ok) { setSheetUrlOriginal(sheetUrl); setSheetMsg('✓ Sheet enregistrée') }
      else setSheetMsg('✗ Erreur sauvegarde')
    } catch (e: any) { setSheetMsg(`✗ ${e.message}`) }
    setSavingSheet(false)
    setTimeout(() => setSheetMsg(''), 3000)
  }

  async function checkSheetNow() {
    setCheckingSheet(true); setSheetMsg('')
    try {
      const r = await fetch(`/api/sites/${siteId}/blog/check-sheet`, { method: 'POST' })
      const d = await r.json()
      if (r.ok) {
        setSheetMsg('✓ Workflow déclenché — la sheet sera traitée dans quelques minutes')
      } else {
        setSheetMsg(`✗ ${d.error || 'Erreur déclenchement'}`)
      }
    } catch (e: any) { setSheetMsg(`✗ ${e.message}`) }
    setCheckingSheet(false)
    setTimeout(() => setSheetMsg(''), 6000)
  }

  async function del(slug: string, title: string) {
    if (!confirm(`Supprimer l'article "${title}" ?`)) return
    const r = await fetch(`/api/sites/${siteId}/blog/${slug}`, { method: 'DELETE' })
    if (r.ok) load()
    else alert('Erreur suppression')
  }

  const categories = Array.from(new Set(posts.map(p => p.categorie).filter(Boolean))) as string[]
  const filtered = posts.filter(p => {
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false
    if (catFilter && p.categorie !== catFilter) return false
    if (statusFilter && (p.status || 'published') !== statusFilter) return false
    return true
  })

  return (
    <div style={{ padding: '32px 5vw', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, fontSize: 13 }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Sites</Link>
        <span style={{ color: '#4A5568' }}>›</span>
        <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none' }}>{siteId}</Link>
        <span style={{ color: '#4A5568' }}>›</span>
        <span style={{ color: '#fff' }}>Blog</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 28px', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 600, margin: 0 }}>📝 Gérer le blog</h1>
          <div style={{ color: '#8B9CB0', fontSize: 14, marginTop: 6 }}>{posts.length} article{posts.length > 1 ? 's' : ''} au total</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowSheetConfig(s => !s)} style={{ padding: '12px 18px', borderRadius: 10, background: '#1E2D3D', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            📊 Config sheet {showSheetConfig ? '▲' : '▼'}
          </button>
          <Link href={`/sites/${siteId}/blog/new`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderRadius: 10, background: '#00D4AA', color: '#0A0E1A', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            ✨ Nouvel article
          </Link>
        </div>
      </div>

      {/* Bloc configuration sheet (collapsible) */}
      {showSheetConfig && (
        <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>📊 Publication programmée via Google Sheet</div>
          <div style={{ color: '#8B9CB0', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
            Indique l'URL d'export CSV publié d'une Google Sheet. Les articles sont publiés automatiquement à la date/heure indiquée, vérifié toutes les heures.
            <br/>Colonnes attendues : <code style={{ color: '#00D4AA' }}>titre</code>, <code style={{ color: '#00D4AA' }}>categorie</code>, <code style={{ color: '#00D4AA' }}>date_publication</code>, <code style={{ color: '#00D4AA' }}>heure_publication</code>, <code style={{ color: '#00D4AA' }}>prompt_custom</code>, <code style={{ color: '#00D4AA' }}>slug</code>, <code style={{ color: '#00D4AA' }}>meta_title</code>, <code style={{ color: '#00D4AA' }}>meta_description</code>.
          </div>
          <label style={{ display: 'block', fontSize: 11, color: '#8B9CB0', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>URL Google Sheet CSV</label>
          <input type="text" value={sheetUrl} onChange={e => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/.../pub?output=csv"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, marginBottom: 12 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={saveSheet} disabled={savingSheet || sheetUrl === sheetUrlOriginal}
              style={{ padding: '10px 18px', borderRadius: 8, background: sheetUrl === sheetUrlOriginal ? '#1E2D3D' : '#00D4AA', color: sheetUrl === sheetUrlOriginal ? '#4A5568' : '#0A0E1A', fontSize: 13, fontWeight: 700, border: 'none', cursor: sheetUrl === sheetUrlOriginal ? 'default' : 'pointer' }}>
              {savingSheet ? '⏳' : '💾 Enregistrer'}
            </button>
            <button onClick={checkSheetNow} disabled={checkingSheet || !sheetUrlOriginal}
              style={{ padding: '10px 18px', borderRadius: 8, background: !sheetUrlOriginal ? '#1E2D3D' : '#F6AD55', color: !sheetUrlOriginal ? '#4A5568' : '#0A0E1A', fontSize: 13, fontWeight: 700, border: 'none', cursor: !sheetUrlOriginal ? 'default' : 'pointer' }}>
              {checkingSheet ? '⏳' : '🔄 Vérifier la sheet maintenant'}
            </button>
            {sheetMsg && <span style={{ fontSize: 12, color: sheetMsg.startsWith('✗') ? '#FC8181' : '#00D4AA' }}>{sheetMsg}</span>}
          </div>
        </div>
      )}

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input type="text" placeholder="🔍 Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 220px', padding: '10px 14px', borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 }} />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 }}>
          <option value="">Toutes catégories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 }}>
          <option value="">Tous statuts</option>
          <option value="published">Publié</option>
          <option value="scheduled">Programmé</option>
          <option value="draft">Brouillon</option>
        </select>
      </div>

      {/* Tableau */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#4A5568' }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#4A5568', background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16 }}>
          {posts.length === 0 ? "Aucun article. Clique sur ✨ Nouvel article pour commencer." : "Aucun résultat avec ces filtres."}
        </div>
      ) : (
        <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0A0E1A', borderBottom: '1px solid #1E2D3D' }}>
                <th style={th}>Titre</th>
                <th style={th}>Catégorie</th>
                <th style={th}>Date</th>
                <th style={th}>Statut</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.slug} style={{ borderBottom: '1px solid #1E2D3D' }}>
                  <td style={td}>
                    <div style={{ color: '#fff', fontSize: 14, fontWeight: 500, marginBottom: 3 }}>{p.title}</div>
                    {p.excerpt && <div style={{ color: '#4A5568', fontSize: 12 }}>{p.excerpt.slice(0, 90)}{p.excerpt.length > 90 ? '…' : ''}</div>}
                  </td>
                  <td style={td}>
                    {p.categorie ? <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 12, background: '#1E2D3D', color: '#00D4AA', fontSize: 11, fontWeight: 600 }}>{p.categorie}</span> : <span style={{ color: '#4A5568' }}>—</span>}
                  </td>
                  <td style={{ ...td, color: '#8B9CB0', fontSize: 13 }}>{formatDate(p.date)}</td>
                  <td style={td}>
                    <span style={{ color: STATUS_COLOR[p.status || 'published'] || '#8B9CB0', fontSize: 12, fontWeight: 600 }}>
                      {STATUS_LABEL[p.status || 'published'] || p.status}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Link href={`/sites/${siteId}/blog/${p.slug}`} style={{ padding: '6px 12px', borderRadius: 6, background: '#1E2D3D', color: '#fff', fontSize: 12, textDecoration: 'none', marginRight: 6 }}>Éditer</Link>
                    <button onClick={() => del(p.slug, p.title)} style={{ padding: '6px 12px', borderRadius: 6, background: 'transparent', border: '1px solid #FC8181', color: '#FC8181', fontSize: 12, cursor: 'pointer' }}>Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatDate(s: string): string {
  if (!s) return '—'
  try {
    const d = new Date(s)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return s }
}

const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', color: '#8B9CB0', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
const td: React.CSSProperties = { padding: '14px 16px', verticalAlign: 'top' }
