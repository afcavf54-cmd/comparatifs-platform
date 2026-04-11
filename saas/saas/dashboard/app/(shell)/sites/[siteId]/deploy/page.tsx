'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function DeployPage() {
  const { siteId } = useParams()
  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deploying, setDeploying] = useState(false)
  const [msg, setMsg] = useState('')
  const [site, setSite] = useState<any>(null)

  useEffect(() => {
    fetch(`/api/sites/${siteId}`).then(r => r.json()).then(setSite)
    loadRuns()
  }, [siteId])

  async function loadRuns() {
    setLoading(true)
    const r = await fetch('/api/deploy')
    const d = await r.json()
    if (Array.isArray(d)) setRuns(d)
    setLoading(false)
  }

  async function deploy() {
    setDeploying(true)
    setMsg('')
    const r = await fetch('/api/deploy', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, workflowFile: 'generate-scpi.yml' })
    })
    const d = await r.json()
    if (d.ok) {
      setMsg('✓ Workflow déclenché — déploiement en cours (~3 min)')
      await fetch(`/api/sites/${siteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'building', last_deployed: new Date().toISOString() }) })
      setTimeout(loadRuns, 3000)
    } else {
      setMsg('✗ ' + (d.error || 'Erreur'))
    }
    setDeploying(false)
  }

  const STATUS = (run: any) => {
    if (run.status === 'in_progress') return { label: 'En cours', color: '#F6AD55', bg: 'rgba(246,173,85,0.12)' }
    if (run.conclusion === 'success') return { label: 'Succès', color: '#00D4AA', bg: 'rgba(0,212,170,0.12)' }
    if (run.conclusion === 'failure') return { label: 'Échec', color: '#FC8181', bg: 'rgba(252,129,129,0.12)' }
    return { label: run.status, color: '#8B9CB0', bg: 'rgba(139,156,176,0.12)' }
  }

  const duration = (run: any) => {
    if (!run.updated_at || !run.created_at) return ''
    const s = Math.round((new Date(run.updated_at).getTime() - new Date(run.created_at).getTime()) / 1000)
    return s > 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
  }

  return (
    <div>
      <div style={{ marginBottom: 24, fontSize: 13, color: '#8B9CB0' }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Sites</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none' }}>{siteId}</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: '#fff' }}>Déploiement</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Déploiement</h1>
          <p style={{ color: '#8B9CB0', fontSize: 13, margin: '4px 0 0' }}>
            {site?.domain && <a href={`https://${site.domain}`} target="_blank" rel="noopener noreferrer" style={{ color: '#00D4AA', textDecoration: 'none' }}>{site.domain} ↗</a>}
          </p>
        </div>
        <button onClick={deploy} disabled={deploying} style={{
          padding: '12px 28px', borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 15,
          background: deploying ? '#1E2D3D' : 'linear-gradient(135deg, #00D4AA, #0090FF)',
          color: deploying ? '#4A5568' : '#fff', cursor: deploying ? 'not-allowed' : 'pointer',
          boxShadow: deploying ? 'none' : '0 4px 20px rgba(0,212,170,0.3)'
        }}>
          {deploying ? '⏳ Déploiement...' : '🚀 Déployer maintenant'}
        </button>
      </div>

      {msg && (
        <div style={{ marginBottom: 24, padding: '12px 16px', borderRadius: 10, background: msg.startsWith('✓') ? 'rgba(0,212,170,0.1)' : 'rgba(252,129,129,0.1)', border: `1px solid ${msg.startsWith('✓') ? 'rgba(0,212,170,0.3)' : 'rgba(252,129,129,0.3)'}`, color: msg.startsWith('✓') ? '#00D4AA' : '#FC8181', fontSize: 13 }}>
          {msg}
        </div>
      )}

      {/* Info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Dernier déploiement', value: site?.last_deployed ? new Date(site.last_deployed).toLocaleString('fr') : 'Jamais', icon: '🕐' },
          { label: 'Statut actuel', value: site?.status || '—', icon: '📡' },
          { label: 'Total déploiements', value: runs.length, icon: '🔄' },
        ].map(stat => (
          <div key={stat.label} style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>{stat.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: '#4A5568', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Runs history */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1E2D3D', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: '#fff', margin: 0, fontSize: 15, fontWeight: 600 }}>Historique des déploiements</h3>
          <button onClick={loadRuns} style={{ background: 'none', border: 'none', color: '#8B9CB0', cursor: 'pointer', fontSize: 13 }}>↻ Rafraîchir</button>
        </div>
        {loading ? (
          <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 40 }}>Chargement...</div>
        ) : runs.length === 0 ? (
          <div style={{ color: '#4A5568', textAlign: 'center', padding: 40 }}>Aucun déploiement</div>
        ) : (
          runs.map((run, i) => {
            const s = STATUS(run)
            return (
              <a key={run.id} href={run.html_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <div style={{
                  padding: '14px 20px', borderBottom: i < runs.length - 1 ? '1px solid #1E2D3D' : 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#0A0E1A')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#fff', marginBottom: 4, fontWeight: 500 }}>
                      {run.head_commit?.message || run.name || 'Déploiement'}
                    </div>
                    <div style={{ fontSize: 11, color: '#4A5568' }}>
                      {new Date(run.created_at).toLocaleString('fr')}
                      {duration(run) && ` · ${duration(run)}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
