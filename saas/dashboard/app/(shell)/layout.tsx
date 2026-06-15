'use client'
import { useState, useEffect } from 'react'
import { useParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const pathname = usePathname()
  const siteId = params?.siteId as string
  const [deploying, setDeploying] = useState(false)
  const [msg, setMsg] = useState('')
  const [pageTypes, setPageTypes] = useState<Record<string, string>>({})
  const [siteDomain, setSiteDomain] = useState<string | null>(null)

  // Charger page_types et domain
  useEffect(() => {
    if (!siteId) return
    fetch(`/api/sites/${siteId}/config`).then(r => r.json()).then(d => {
      if (d.page_types) setPageTypes(d.page_types)
    }).catch(() => {})
    fetch(`/api/sites/${siteId}`).then(r => r.json()).then(d => {
      if (d.domain) setSiteDomain(d.domain)
    }).catch(() => {})
  }, [siteId])

  async function quickDeploy() {
    if (!siteId) return
    setDeploying(true); setMsg('')
    try {
      const r = await fetch('/api/deploy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, workflowFile: 'generate-scpi.yml', skipEnrich: true })
      })
      const d = await r.json()
      setMsg(d.ok ? '✓ Déploiement lancé' : '✗ ' + (d.error || 'Erreur'))
      if (d.ok) await fetch(`/api/sites/${siteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'building' }) })
    } catch { setMsg('✗ Erreur réseau') }
    setDeploying(false)
    setTimeout(() => setMsg(''), 4000)
  }

  const tabs = siteId ? [
    { id: 'overview', label: "📊 Vue d'ensemble", href: `/sites/${siteId}` },
    { id: 'data', label: '🗂 Données', href: `/sites/${siteId}/data` },
    { id: 'blog', label: '📝 Blog', href: `/sites/${siteId}/blog` },
    { id: 'avis', label: '⭐ Avis', href: `/sites/${siteId}/avis` },
    { id: 'codes-promo', label: '🏷️ Codes promo', href: `/sites/${siteId}/codes-promo` },
    ...(pageTypes.classement ? [{ id: 'classements', label: '📊 Classements', href: `/sites/${siteId}/classements` }] : []),
    { id: 'outils', label: '🧰 Outils', href: `/sites/${siteId}/outils` },
    { id: 'deploy', label: '🚀 Déploiement', href: `/sites/${siteId}/deploy` },
    { id: 'indexation', label: '🔍 Indexation', href: `/sites/${siteId}/indexation` },
    { id: 'settings', label: '⚙️ Paramètres', href: `/sites/${siteId}/settings` },
  ] : []

  const activeTab = tabs.find(t => {
    if (t.id === 'overview') return pathname === `/sites/${siteId}`
    return pathname?.startsWith(t.href)
  })?.id

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ marginLeft: 220, flex: 1, minHeight: '100vh', background: '#0A0E1A' }}>
        {/* Topbar */}
        {siteId && (
          <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#0A0E1A', borderBottom: '1px solid #1E2D3D' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 32px' }}>
              {/* Onglets */}
              <div style={{ display: 'flex', gap: 2 }}>
                {tabs.map(tab => (
                  <Link key={tab.id} href={tab.href} style={{
                    padding: '14px 14px', fontSize: 13,
                    fontWeight: activeTab === tab.id ? 600 : 400,
                    color: activeTab === tab.id ? '#fff' : '#8B9CB0',
                    textDecoration: 'none',
                    borderBottom: activeTab === tab.id ? '2px solid #00D4AA' : '2px solid transparent',
                    whiteSpace: 'nowrap'
                  }}>{tab.label}</Link>
                ))}
              </div>
              {/* Bouton déployer */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16 }}>
                {msg && <span style={{ fontSize: 12, color: msg.startsWith('✓') ? '#00D4AA' : '#FC8181' }}>{msg}</span>}
                {siteDomain && (
                  <a href={siteDomain.startsWith('http') ? siteDomain : `https://${siteDomain}`} target="_blank" rel="noopener noreferrer"
                    style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #1E2D3D', background: 'transparent', color: '#8B9CB0', fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    🌐 Voir le site
                  </a>
                )}
                <button onClick={quickDeploy} disabled={deploying}
                  style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: deploying ? '#1E2D3D' : 'linear-gradient(135deg, #00D4AA, #0090FF)', color: deploying ? '#4A5568' : '#fff', fontWeight: 600, fontSize: 13, cursor: deploying ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                  {deploying ? '⏳...' : '🚀 Déployer'}
                </button>
              </div>
            </div>
          </div>
        )}
        <div style={{ padding: '32px' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
