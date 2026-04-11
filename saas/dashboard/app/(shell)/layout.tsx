import Sidebar from '../components/Sidebar'

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ marginLeft: 220, flex: 1, padding: '32px', minHeight: '100vh', background: '#0A0E1A' }}>
        {children}
      </main>
    </div>
  )
}
