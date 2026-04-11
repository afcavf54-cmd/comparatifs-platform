'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Site {
  id: string; name: string; niche: string; domain: string
  status: string; created_at: string; last_deployed?: string
  pages_count?: number; products_count?: number; description?: string
}

const STATUS_COLORS: Record<string, string> = {
  live: '#00D4AA', draft: '#8B9CB0', building: '#F6AD55', error: '#FC8181'
}
const STATUS_BG: Record<string, string> = {
  live: 'rgba(0,212,170,0.12)', draft: 'rgba(139,156,176,0.12)', building: 'rgba(246,173,85,0.12)', error: 'rgba(252,129,129,0.12)'
}
const NICHE_ICONS: Record<string, string> = { comparatif: '⚖️', classement: '🏆', autre: '📄' }

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/sites').then(r => r.json()).then(d => {
      setSites(d.sites || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filtered = sites.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.domain.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Sites</h1>
          <p style={{ color: '#8B9CB0', marginTop: 6, fontSize: 14 }}>{sites.length} site{sites.length > 1 ? 's' : ''} géré{sites.length > 1 ? 's' : ''}</p>
        </div>
        <Link href="/sites/new" style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 20px', borderRadius: 10,
          background: 'linear-gradient(135deg, #00D4AA, #0090FF)',
          color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 14
        }}>
          ➕ Nouveau site
        </Link>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total sites', value: sites.length, icon: '🌐', color: '#00D4AA' },
          { label: 'Live', value: sites.filter(s => s.status === 'live').length, icon: '✅', color: '#00D4AA' },
          { label: 'En draft', value: sites.filter(s => s.status === 'draft').length, icon: '📝', color: '#8B9CB0' },
          { label: 'Pages générées', value: sites.reduce((a, s) => a + (s.pages_count || 0), 0), icon: '📄', color: '#0090FF' },
        ].map(stat => (
          <div key={stat.label} style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{stat.icon}</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{stat.value}</span>
            </div>
            <div style={{ fontSize: 12, color: '#8B9CB0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Rechercher un site..."
        style={{
          width: '100%', padding: '10px 16px', borderRadius: 10, marginBottom: 20,
          background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff',
          fontSize: 14, outline: 'none', boxSizing: 'border-box'
        }}
      />

      {/* Sites grid */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#8B9CB0', padding: 60 }}>Chargement...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#8B9CB0', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🌐</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Aucun site pour l'instant</div>
          <div style={{ marginBottom: 24 }}>Créez votre premier site comparatif</div>
          <Link href="/sites/new" style={{ padding: '10px 24px', borderRadius: 10, background: '#00D4AA', color: '#0A0E1A', fontWeight: 600, textDecoration: 'none' }}>
            Créer un site
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {filtered.map(site => (
            <Link key={site.id} href={`/sites/${site.id}`} style={{ textDecoration: 'none' }}>
              <div style={{
                background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16,
                padding: 24, cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#00D4AA')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#1E2D3D')}
              >
                {/* Top */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: 'linear-gradient(135deg, #1E2D3D, #2D3F54)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
                    }}>{NICHE_ICONS[site.niche] || '📄'}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>{site.name}</div>
                      <div style={{ fontSize: 12, color: '#8B9CB0', marginTop: 2 }}>{site.domain}</div>
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    color: STATUS_COLORS[site.status] || '#8B9CB0',
                    background: STATUS_BG[site.status] || 'rgba(139,156,176,0.12)',
                  }}>● {site.status}</span>
                </div>

                {/* Description */}
                {site.description && (
                  <div style={{ fontSize: 13, color: '#8B9CB0', marginBottom: 16, lineHeight: 1.5 }}>
                    {site.description}
                  </div>
                )}

                {/* Metrics */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{site.pages_count || 0}</div>
                    <div style={{ fontSize: 11, color: '#8B9CB0' }}>Pages</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{site.products_count || 0}</div>
                    <div style={{ fontSize: 11, color: '#8B9CB0' }}>Produits</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: site.last_deployed ? '#00D4AA' : '#8B9CB0' }}>
                      {site.last_deployed ? new Date(site.last_deployed).toLocaleDateString('fr') : 'Jamais'}
                    </div>
                    <div style={{ fontSize: 11, color: '#8B9CB0' }}>Déployé</div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', gap: 8, paddingTop: 16, borderTop: '1px solid #1E2D3D' }}>
                  <span style={{ fontSize: 11, background: '#1E2D3D', color: '#8B9CB0', padding: '3px 8px', borderRadius: 6 }}>{site.niche}</span>
                  <span style={{ fontSize: 11, color: '#4A5568', marginLeft: 'auto' }}>
                    {new Date(site.created_at).toLocaleDateString('fr')}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
