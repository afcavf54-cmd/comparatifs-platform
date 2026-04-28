'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  live:                    { label: 'En ligne',        color: '#00D4AA', bg: 'rgba(0,212,170,0.12)',   icon: '✅' },
  building:                { label: 'En génération',   color: '#F6AD55', bg: 'rgba(246,173,85,0.12)',  icon: '⚙️' },
  pending_generation:      { label: 'En attente nuit', color: '#9F7AEA', bg: 'rgba(159,122,234,0.12)', icon: '🌙' },
  generation_incomplete:   { label: 'Génération partielle', color: '#F6AD55', bg: 'rgba(246,173,85,0.12)', icon: '⏳' },
  deploying:               { label: 'Déploiement',     color: '#63B3ED', bg: 'rgba(99,179,237,0.12)',  icon: '🚀' },
  draft:                   { label: 'Brouillon',       color: '#8B9CB0', bg: 'rgba(139,156,176,0.12)', icon: '📝' },
}

export default function SitesPage() {
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deployingAll, setDeployingAll] = useState(false)
  const [deployAllMsg, setDeployAllMsg] = useState('')
  const [deployProgress, setDeployProgress] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/sites').then(r => r.json()).then(d => {
      setSites(d.sites || [])
      setLoading(false)
    })
    const interval = setInterval(() => {
      fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || []))
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  async function deployAll() {
    setDeployingAll(true)
    setDeployAllMsg('')
    setDeployProgress([])
    const liveSites = sites.filter(s => s.id)
    for (const site of liveSites) {
      setDeployProgress(p => [...p, `⏳ Déploiement de ${site.name}...`])
      try {
        const r = await fetch('/api/deploy', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: site.id, workflowFile: 'generate-scpi.yml', skipEnrich: true })
        })
        const d = await r.json()
        setDeployProgress(p => [...p.slice(0, -1), d.ok ? `✓ ${site.name}` : `✗ ${site.name}: ${d.error}`])
        await fetch(`/api/sites/${site.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'building' }) })
      } catch {
        setDeployProgress(p => [...p.slice(0, -1), `✗ ${site.name}: erreur réseau`])
      }
      await new Promise(res => setTimeout(res, 1500))
    }
    setDeployAllMsg(`✓ ${liveSites.length} site(s) déclenchés`)
    setDeployingAll(false)
  }

  const s = (status: string) => STATUS_CONFIG[status] || { label: status, color: '#8B9CB0', bg: 'rgba(139,156,176,0.12)', icon: '❓' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Mes sites</h1>
          <p style={{ color: '#8B9CB0', fontSize: 13, margin: '4px 0 0' }}>
            {sites.length} site{sites.length > 1 ? 's' : ''} · Actualisation auto toutes les 30s
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={deployAll} disabled={deployingAll || loading || sites.length === 0}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: deployingAll ? '#1E2D3D' : 'linear-gradient(135deg, #F6AD55, #FC8181)', color: deployingAll ? '#4A5568' : '#fff', fontWeight: 600, fontSize: 14, cursor: deployingAll ? 'not-allowed' : 'pointer' }}>
            {deployingAll ? '⏳ Déploiement...' : '🚀 Tout déployer'}
          </button>
          <Link href="/sites/new" style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            + Nouveau site
          </Link>
        </div>
      </div>

      {/* Progression déploiement global */}
      {deployProgress.length > 0 && (
        <div style={{ marginBottom: 20, padding: 16, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#8B9CB0', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progression</div>
          {deployProgress.map((msg, i) => (
            <div key={i} style={{ fontSize: 13, color: msg.startsWith('✓') ? '#00D4AA' : msg.startsWith('✗') ? '#FC8181' : '#F6AD55', padding: '3px 0' }}>{msg}</div>
          ))}
          {deployAllMsg && <div style={{ marginTop: 8, fontSize: 13, color: '#00D4AA', fontWeight: 600 }}>{deployAllMsg}</div>}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 60 }}>Chargement...</div>
      ) : sites.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#4A5568' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🌐</div>
          <div style={{ fontSize: 16, color: '#8B9CB0', marginBottom: 20 }}>Aucun site créé</div>
          <Link href="/sites/new" style={{ padding: '12px 24px', borderRadius: 10, background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', fontWeight: 600, textDecoration: 'none' }}>Créer mon premier site</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sites.map((site: any) => {
            const st = s(site.status)
            const progress = site.generation_progress
            const isGenerating = ['building', 'pending_generation', 'generation_incomplete'].includes(site.status)
            return (
              <Link key={site.id} href={`/sites/${site.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 14, padding: '20px 24px', transition: 'border-color 0.15s', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#00D4AA')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#1E2D3D')}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{site.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, color: st.color, background: st.bg }}>{st.icon} {st.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#4A5568' }}>
                      {site.domain && <span style={{ color: '#00D4AA', marginRight: 12 }}>🌐 {site.domain}</span>}
                      <span>Créé le {new Date(site.created_at).toLocaleDateString('fr')}</span>
                      {site.last_deployed && <span style={{ marginLeft: 12 }}>· Déployé le {new Date(site.last_deployed).toLocaleDateString('fr')}</span>}
                    </div>
                    {isGenerating && progress && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8B9CB0', marginBottom: 4 }}>
                          <span>Génération du contenu IA</span><span>{progress} paires</span>
                        </div>
                        <div style={{ height: 4, background: '#1E2D3D', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #00D4AA, #0090FF)', width: `${(parseInt(progress.split('/')[0]) / parseInt(progress.split('/')[1])) * 100}%`, transition: 'width 0.5s' }} />
                        </div>
                      </div>
                    )}
                    {isGenerating && !progress && (
                      <div style={{ marginTop: 8, fontSize: 11, color: '#9F7AEA' }}>🌙 Génération programmée cette nuit à 1h UTC</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <a href={`/sites/${site.id}/settings`} onClick={e => e.stopPropagation()}
                      style={{ fontSize: 11, color: '#8B9CB0', padding: '4px 10px', borderRadius: 6, border: '1px solid #1E2D3D', textDecoration: 'none' }}>⚙️ SEO</a>
                    <div style={{ color: '#4A5568', fontSize: 18 }}>›</div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 32, padding: 16, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12 }}>
        <div style={{ fontSize: 11, color: '#4A5568', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Statuts</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {Object.entries(STATUS_CONFIG).map(([key, val]) => (
            <span key={key} style={{ fontSize: 11, color: val.color }}>{val.icon} {val.label}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
