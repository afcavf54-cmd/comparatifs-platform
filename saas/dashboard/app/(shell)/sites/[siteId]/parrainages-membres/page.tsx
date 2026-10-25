'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type Member = { email: string; newsletter_opt_in: boolean; consent_at?: string | null; created_at: string }

const card = { background: '#0F1724', border: '1px solid #1E2D3D', borderRadius: 12, padding: 18 }
const btn = (bg: string) => ({ padding: '9px 16px', borderRadius: 8, background: bg, color: '#fff', border: 0, fontSize: 13, fontWeight: 600, cursor: 'pointer' } as const)

function fmt(d?: string | null) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return d }
}

export default function MembresPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const [members, setMembers] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [optin, setOptin] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')

  async function load() {
    setLoading(true); setErr('')
    const r = await fetch(`/api/sites/${siteId}/parrainages/membres`)
    const d = await r.json()
    if (!r.ok) { setErr(d.error || 'Erreur de chargement'); setMembers([]) }
    else { setMembers(d.members || []); setTotal(d.total || 0); setOptin(d.optin || 0) }
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [siteId])

  function exportCsv() {
    const rows = [['email', 'newsletter', 'inscrit_le']].concat(
      members.map(m => [m.email, m.newsletter_opt_in ? 'oui' : 'non', m.created_at])
    )
    const csv = rows.map(r => r.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'membres-captain-parrainage.csv'; a.click(); URL.revokeObjectURL(url)
  }

  if (siteId !== 'captain-parrainage') return <div style={{ padding: 24, color: '#8B9CB0' }}>Cet onglet est réservé à captain-parrainage.</div>

  const filtered = q ? members.filter(m => (m.email || '').toLowerCase().includes(q.toLowerCase())) : members

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px', color: '#fff' }}>
      <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none', fontSize: 13 }}>← {siteId}</Link>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 20px', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>👤 Membres inscrits</h1>
        <button onClick={exportCsv} style={btn('#1E2D3D')} disabled={!members.length}>⬇ Exporter CSV</button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ ...card, flex: '1 1 160px' }}><div style={{ fontSize: 28, fontWeight: 700 }}>{total}</div><div style={{ fontSize: 12, color: '#8B9CB0' }}>Membres inscrits</div></div>
        <div style={{ ...card, flex: '1 1 160px' }}><div style={{ fontSize: 28, fontWeight: 700, color: '#00D4AA' }}>{optin}</div><div style={{ fontSize: 12, color: '#8B9CB0' }}>Abonnés newsletter</div></div>
      </div>

      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un email…" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 14, marginBottom: 14 }} />

      {err && <div style={{ ...card, borderColor: '#5c2b2e', color: '#ff8a80', marginBottom: 16 }}>{err}</div>}
      {loading ? <div style={{ color: '#8B9CB0' }}>Chargement…</div> : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 180px', gap: 0, padding: '12px 18px', fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1E2D3D' }}>
            <div>Email</div><div>Newsletter</div><div>Inscrit le</div>
          </div>
          {filtered.length === 0 && <div style={{ padding: 18, color: '#8B9CB0' }}>Aucun membre {q ? 'pour cette recherche' : 'inscrit pour le moment'}.</div>}
          {filtered.map((m, i) => (
            <div key={m.email + i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 180px', gap: 0, padding: '12px 18px', fontSize: 13, borderBottom: '1px solid #141C2A', alignItems: 'center' }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</div>
              <div>{m.newsletter_opt_in ? <span style={{ color: '#00D4AA' }}>✓ Oui</span> : <span style={{ color: '#8B9CB0' }}>Non</span>}</div>
              <div style={{ color: '#8B9CB0' }}>{fmt(m.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
