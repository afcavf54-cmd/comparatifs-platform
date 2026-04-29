'use client'
import { useState } from 'react'
import { useParams, usePathname } from 'next/navigation'
import Sidebar from '../components/Sidebar'

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const pathname = usePathname()
  const siteId = params?.siteId as string
  const [deploying, setDeploying] = useState(false)
  const [msg, setMsg] = useState('')

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

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ marginLeft: 220, flex: 1, minHeight: '100vh', background: '#0A0E1A' }}>
        {/* Topbar avec bouton déployer */}
        {siteId && (
          <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#0A0E1A', borderBottom: '1px solid #1E2D3D', padding: '10px 32px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
            {msg && <span style={{ fontSize: 12, color: msg.startsWith('✓') ? '#00D4AA' : '#FC8181' }}>{msg}</span>}
            <button onClick={quickDeploy} disabled={deploying}
              style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: deploying ? '#1E2D3D' : 'linear-gradient(135deg, #00D4AA, #0090FF)', color: deploying ? '#4A5568' : '#fff', fontWeight: 600, fontSize: 13, cursor: deploying ? 'not-allowed' : 'pointer' }}>
              {deploying ? '⏳ En cours...' : '🚀 Déployer'}
            </button>
          </div>
        )}
        <div style={{ padding: '32px' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
