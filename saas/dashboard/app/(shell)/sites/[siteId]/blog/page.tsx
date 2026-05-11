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

  useEffect(() => { load() }, [siteId])

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
        <Link href={`/sites/${siteId}/blog/new`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderRadius: 10, background: '#00D4AA', color: '#0A0E1A', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
          ✨ Nouvel article
        </Link>
      </div>

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
