'use client'
import { useEffect, useState } from 'react'

export default function DeployHistoryPage() {
  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const r = await fetch('/api/deploy')
    const d = await r.json()
    if (Array.isArray(d)) setRuns(d)
    setLoading(false)
  }

  const STATUS = (run: any) => {
    if (run.status === 'in_progress') return { label: 'En cours', color: '#F6AD55', bg: 'rgba(246,173,85,0.12)' }
    if (run.conclusion === 'success') return { label: 'Succès', color: '#00D4AA', bg: 'rgba(0,212,170,0.12)' }
    if (run.conclusion === 'failure') return { label: 'Échec', color: '#FC8181', bg: 'rgba(252,129,129,0.12)' }
    return { label: run.status, color: '#8B9CB0', bg: 'rgba(139,156,176,0.12)' }
  }

  const success = runs.filter(r => r.conclusion === 'success').length
  const failed = runs.filter(r => r.conclusion === 'failure').length
  const inProgress = runs.filter(r => r.status === 'in_progress').length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Déploiements</h1>
          <p style={{ color: '#8B9CB0', marginTop: 6, fontSize: 14 }}>Historique de tous les workflows GitHub Actions</p>
        </div>
        <button onClick={load} style={{ padding: '9px 18px', borderRadius: 10, background: '#1E2D3D', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          ↻ Rafraîchir
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total', value: runs.length, color: '#fff', icon: '🔄' },
          { label: 'Succès', value: success, color: '#00D4AA', icon: '✅' },
          { label: 'Échecs', value: failed, color: '#FC8181', icon: '❌' },
          { label: 'En cours', value: inProgress, color: '#F6AD55', icon: '⏳' },
        ].map(s => (
          <div key={s.label} style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{s.icon}</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</span>
            </div>
            <div style={{ fontSize: 11, color: '#4A5568', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Runs */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1E2D3D' }}>
          <h3 style={{ color: '#fff', margin: 0, fontSize: 15, fontWeight: 600 }}>Tous les déploiements</h3>
        </div>
        {loading ? (
          <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 60 }}>Chargement...</div>
        ) : runs.length === 0 ? (
          <div style={{ color: '#4A5568', textAlign: 'center', padding: 60 }}>Aucun déploiement</div>
        ) : (
          runs.map((run, i) => {
            const s = STATUS(run)
            const dur = (() => {
              if (!run.updated_at || !run.created_at) return ''
              const sec = Math.round((new Date(run.updated_at).getTime() - new Date(run.created_at).getTime()) / 1000)
              return sec > 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`
            })()
            return (
              <a key={run.id} href={run.html_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <div style={{
                  padding: '14px 20px', borderBottom: i < runs.length - 1 ? '1px solid #1E2D3D' : 'none',
                  display: 'flex', alignItems: 'center', gap: 16, transition: 'background 0.15s'
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#0A0E1A')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 500, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {run.head_commit?.message || run.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#4A5568' }}>
                      {run.name} · {new Date(run.created_at).toLocaleString('fr')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    {dur && <span style={{ fontSize: 11, color: '#4A5568' }}>{dur}</span>}
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, color: s.color, background: s.bg }}>
                      {s.label}
                    </span>
                    <span style={{ color: '#4A5568', fontSize: 12 }}>↗</span>
                  </div>
                </div>
              </a>
            )
          })
        )}
      </div>
    </div>
  )
}
