'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
const NAV = [
  { href: '/sites', icon: '🌐', label: 'Sites' },
  { href: '/sites/new', icon: '➕', label: 'Nouveau site' },
  { href: '/link-sales', icon: '🔗', label: 'Vente de liens' },
  { href: '/templates', icon: '📐', label: 'Modèles de pages' },
  { href: '/deploy', icon: '🚀', label: 'Déploiements' },
]
export default function Sidebar() {
  const path = usePathname()
  return (
    <aside style={{
      width: 220, minHeight: '100vh', background: '#0D1117',
      borderRight: '1px solid #1E2D3D', display: 'flex',
      flexDirection: 'column', position: 'fixed', top: 0, left: 0, zIndex: 100
    }}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #1E2D3D' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #00D4AA, #0090FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>⚡</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', letterSpacing: '-0.01em' }}>Viseoweb</div>
            <div style={{ fontSize: 10, color: '#00D4AA', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>HUB</div>
          </div>
        </div>
      </div>
      <nav style={{ padding: '12px 10px', flex: 1 }}>
        {NAV.map(item => {
          const active = item.href === '/sites'
            ? path === '/sites' || (path.startsWith('/sites/') && path !== '/sites/new')
            : path.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8, marginBottom: 2,
              textDecoration: 'none', fontSize: 13, fontWeight: active ? 600 : 400,
              color: active ? '#fff' : '#8B9CB0',
              background: active ? 'rgba(0, 212, 170, 0.12)' : 'transparent',
              borderLeft: active ? '2px solid #00D4AA' : '2px solid transparent',
              transition: 'all 0.15s'
            }}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div style={{ padding: '16px 20px', borderTop: '1px solid #1E2D3D', fontSize: 11, color: '#4A5568' }}>
        v2.0 · Viseoweb HUB
      </div>
    </aside>
  )
}
