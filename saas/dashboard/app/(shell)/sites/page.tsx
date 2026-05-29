'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

// ── Mapping clé groupe → label affiché ───────────────────────────
// Si l'API renvoie un `template` plus précis, on l'affiche tel quel
// (sans extension). Sinon on retombe sur `niche` avec un label sympa.
const GROUP_LABELS: Record<string, { label: string; icon: string }> = {
  // Templates (granulaire)
  'classement-saas':  { label: 'Comparatifs SaaS / logiciels', icon: '💻' },
  'classement-scpi':  { label: 'Comparatifs SCPI',              icon: '🏛' },
  // Niches (fallback)
  'classement':       { label: 'Sites classement',              icon: '📊' },
  'comparatif':       { label: 'Sites comparatif',              icon: '⚖️' },
  'autre':            { label: 'Autres',                         icon: '📁' },
}

function getGroupKey(site: any): string {
  if (site.template) {
    return site.template.replace(/\.html\.j2$/, '')
  }
  if (site.niche) {
    return site.niche
  }
  return 'autre'
}

function getGroupMeta(key: string) {
  return GROUP_LABELS[key] || { label: key, icon: '📁' }
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

  // ── Regrouper les sites par template / niche ─────────────────────
  const groups: Record<string, any[]> = {}
  for (const site of sites) {
    const key = getGroupKey(site)
    if (!groups[key]) groups[key] = []
    groups[key].push(site)
  }
  // Tri : groupes par nombre de sites décroissant (plus gros en premier)
  const sortedGroupKeys = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {sortedGroupKeys.map(groupKey => {
            const groupSites = groups[groupKey]
            const meta = getGroupMeta(groupKey)
            return (
              <section key={groupKey}>
                {/* Titre de section */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid #1E2D3D' }}>
                  <span style={{ fontSize: 16 }}>{meta.icon}</span>
                  <h2 style={{ fontSize: 13, fontWeight: 700, color: '#8B9CB0', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{meta.label}</h2>
                  <span style={{ fontSize: 12, color: '#4A5568' }}>· {groupSites.length} site{groupSites.length > 1 ? 's' : ''}</span>
                </div>

                {/* Grille de cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                  {groupSites.map((site: any) => (
                    <Link key={site.id} href={`/sites/${site.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 14, padding: 18, transition: 'border-color 0.15s, transform 0.15s', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#00D4AA'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#1E2D3D'; e.currentTarget.style.transform = 'translateY(0)' }}>
                        {/* Nom du site */}
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.3, wordBreak: 'break-word' }}>
                          {site.name}
                        </div>

                        {/* Domaine */}
                        {site.domain && (
                          <a href={site.domain.startsWith('http') ? site.domain : `https://${site.domain}`} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ fontSize: 12, color: '#00D4AA', textDecoration: 'none', wordBreak: 'break-all' }}>
                            🌐 {site.domain.replace(/^https?:\/\//, '')}
                          </a>
                        )}

                        {/* Spacer */}
                        <div style={{ flex: 1 }} />

                        {/* Dates */}
                        <div style={{ fontSize: 11, color: '#4A5568', lineHeight: 1.6 }}>
                          <div>Créé le {new Date(site.created_at).toLocaleDateString('fr')}</div>
                          {site.last_deployed && <div>Déployé le {new Date(site.last_deployed).toLocaleDateString('fr')}</div>}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, paddingTop: 12, borderTop: '1px solid #1E2D3D' }}>
                          <a href={`/sites/${site.id}/settings`} onClick={e => e.stopPropagation()}
                            style={{ fontSize: 11, color: '#8B9CB0', padding: '4px 10px', borderRadius: 6, border: '1px solid #1E2D3D', textDecoration: 'none' }}>⚙️ SEO</a>
                          <span style={{ flex: 1 }} />
                          <span style={{ color: '#4A5568', fontSize: 16 }}>›</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
