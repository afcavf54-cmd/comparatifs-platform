'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface UrlEntry {
  url: string
  first_submitted_at?: string
  last_submitted_at?: string
  last_response_code?: number
  last_sitemap_lastmod?: string | null
  submitted_count?: number
  status?: 'submitted' | 'error'
}

interface IndexationState {
  site: string
  endpoint?: string
  key_location?: string
  last_submitted_at?: string
  last_run_at?: string
  last_response_code?: number
  last_run_mode?: string
  last_run_submitted_count?: number
  total_urls_in_sitemap?: number
  urls: Record<string, Omit<UrlEntry, 'url'>>
}

type StatusFilter = 'all' | 'submitted' | 'error'

function shortDate(iso: string | undefined | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('fr', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function relPath(url: string, host: string | null): string {
  if (!host) return url
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    return url
  }
}

export default function IndexationPage() {
  const { siteId } = useParams()
  const [state, setState] = useState<IndexationState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!siteId) return
    const path = `platform/sites/${siteId}/indexation.json`
    fetch(`/api/github?path=${encodeURIComponent(path)}`)
      .then(r => r.json())
      .then(d => {
        if (d.content) {
          try {
            setState(JSON.parse(d.content))
          } catch {
            setError("Format JSON invalide dans indexation.json")
          }
        } else {
          setError("Aucune indexation pour ce site — déploie le site une fois pour générer indexation.json")
        }
        setLoading(false)
      })
      .catch(() => { setError('Erreur de chargement'); setLoading(false) })
  }, [siteId])

  if (loading) {
    return (
      <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 60, fontSize: 14 }}>
        Chargement de l'état d'indexation...
      </div>
    )
  }

  if (error || !state) {
    return (
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Indexation IndexNow</div>
        <div style={{ color: '#8B9CB0', fontSize: 13 }}>{error || 'Aucune donnée'}</div>
      </div>
    )
  }

  // Préparer les données
  const allUrls: UrlEntry[] = Object.entries(state.urls || {}).map(([url, data]) => ({ url, ...data }))
  const total = allUrls.length
  const nbOk = allUrls.filter(u => u.last_response_code === 200 || u.last_response_code === 202).length
  const nbErr = allUrls.filter(u => u.status === 'error' || (u.last_response_code && u.last_response_code !== 200 && u.last_response_code !== 202)).length

  // Filtrage
  const filtered = allUrls.filter(u => {
    if (filter === 'submitted' && u.status !== 'submitted') return false
    if (filter === 'error' && u.status !== 'error') return false
    if (query && !u.url.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })
  // Tri : erreurs en premier, puis par URL
  filtered.sort((a, b) => {
    if (a.status === 'error' && b.status !== 'error') return -1
    if (b.status === 'error' && a.status !== 'error') return 1
    return a.url < b.url ? -1 : 1
  })

  const host = state.key_location ? new URL(state.key_location).host : null

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>🔍 Indexation</h1>
      <div style={{ color: '#8B9CB0', fontSize: 13, marginBottom: 24 }}>
        Suivi des soumissions <strong style={{ color: '#fff' }}>IndexNow</strong> (Bing, Yandex, Naver, Seznam) pour ce site.
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'URLs trackées', value: total, icon: '📄', color: '#0090FF' },
          { label: 'Soumises avec succès', value: nbOk, icon: '✅', color: '#00D4AA' },
          { label: 'En erreur', value: nbErr, icon: '⚠️', color: '#FC8181' },
          { label: 'Dernier run', value: shortDate(state.last_run_at || state.last_submitted_at), icon: '🕐', color: '#8B9CB0' },
        ].map(stat => (
          <div key={stat.label} style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{stat.icon}</span>
              <span style={{ fontSize: typeof stat.value === 'number' ? 22 : 13, fontWeight: 700, color: stat.color }}>
                {stat.value}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#4A5568', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Métadonnées */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, padding: '16px 20px', marginBottom: 20, fontSize: 12, color: '#8B9CB0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <strong style={{ color: '#fff', display: 'block', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Endpoint</strong>
            <code style={{ color: '#00D4AA' }}>{state.endpoint || '—'}</code>
          </div>
          <div>
            <strong style={{ color: '#fff', display: 'block', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mode du dernier run</strong>
            <span>{state.last_run_mode || '—'}</span>
            {state.last_run_submitted_count !== undefined && (
              <span style={{ color: '#4A5568' }}> ({state.last_run_submitted_count} URLs)</span>
            )}
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <strong style={{ color: '#fff', display: 'block', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fichier de vérification (publique)</strong>
            {state.key_location ? (
              <a href={state.key_location} target="_blank" rel="noopener noreferrer" style={{ color: '#0090FF', textDecoration: 'none', fontSize: 12, wordBreak: 'break-all' }}>
                {state.key_location} ↗
              </a>
            ) : '—'}
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {([
            { id: 'all' as StatusFilter, label: `Toutes (${total})` },
            { id: 'submitted' as StatusFilter, label: `✓ OK (${nbOk})` },
            { id: 'error' as StatusFilter, label: `⚠ Erreurs (${nbErr})` },
          ]).map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{
                padding: '7px 14px', borderRadius: 8, border: '1px solid #1E2D3D',
                background: filter === f.id ? '#1E2D3D' : 'transparent',
                color: filter === f.id ? '#fff' : '#8B9CB0',
                fontSize: 12, fontWeight: 600, cursor: 'pointer'
              }}>
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filtrer par URL…"
          style={{
            flex: 1, padding: '8px 14px', borderRadius: 8,
            background: '#0A0E1A', border: '1px solid #1E2D3D',
            color: '#fff', fontSize: 13, outline: 'none'
          }} />
      </div>

      {/* Tableau */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#0A0E1A' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8B9CB0', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1E2D3D' }}>URL</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#8B9CB0', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1E2D3D', whiteSpace: 'nowrap' }}>Statut</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#8B9CB0', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1E2D3D' }}>HTTP</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#8B9CB0', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1E2D3D' }}>Nb</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8B9CB0', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1E2D3D', whiteSpace: 'nowrap' }}>Dernière soumission</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: '#4A5568', fontSize: 13 }}>
                    Aucune URL ne correspond à ce filtre.
                  </td>
                </tr>
              ) : filtered.map((u, idx) => {
                const ok = u.last_response_code === 200 || u.last_response_code === 202
                const statusColor = ok ? '#00D4AA' : '#FC8181'
                const statusBg = ok ? 'rgba(0,212,170,0.12)' : 'rgba(252,129,129,0.12)'
                const statusLabel = ok ? '✓ Indexée' : '⚠ Erreur'
                return (
                  <tr key={u.url} style={{ borderBottom: idx === filtered.length - 1 ? 'none' : '1px solid #1E2D3D' }}>
                    <td style={{ padding: '10px 16px', color: '#fff', maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <a href={u.url} target="_blank" rel="noopener noreferrer" style={{ color: '#fff', textDecoration: 'none' }}
                        title={u.url}>
                        <span style={{ color: '#4A5568' }}>{host}</span>
                        <span>{relPath(u.url, host)}</span>
                      </a>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, color: statusColor, background: statusBg }}>
                        {statusLabel}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center', color: statusColor, fontWeight: 600 }}>
                      {u.last_response_code || '—'}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center', color: '#8B9CB0' }}>
                      {u.submitted_count || 0}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: '#8B9CB0', whiteSpace: 'nowrap' }}>
                      {shortDate(u.last_submitted_at)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: '#4A5568', lineHeight: 1.6 }}>
        💡 IndexNow ne garantit pas l'indexation immédiate — Bing/Yandex traitent les soumissions sous quelques heures à quelques jours. Le statut <strong>✓ Indexée</strong> signifie uniquement que la soumission a été acceptée. Pour vérifier l'indexation réelle, utilise Bing Webmaster Tools.
      </div>
    </div>
  )
}
