'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

const card = { background: '#0F1724', border: '1px solid #1E2D3D', borderRadius: 12, padding: 18 }
const input = { width: '100%', padding: '9px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 } as const
const label = { display: 'block', fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }
const btn = (bg: string) => ({ padding: '9px 16px', borderRadius: 8, background: bg, color: '#fff', border: 0, fontSize: 13, fontWeight: 600, cursor: 'pointer' } as const)

export default function ParrainagesNewsletter() {
  const { siteId } = useParams<{ siteId: string }>()
  const [subject, setSubject] = useState('Les nouvelles offres de parrainage')
  const [intro, setIntro] = useState('')
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)

  async function send() {
    if (!confirm('Envoyer la newsletter à tous les membres inscrits ?')) return
    setSending(true); setStatus('Envoi en cours…')
    try {
      const r = await fetch(`/api/sites/${siteId}/parrainages/newsletter`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, intro }),
      })
      const d = await r.json()
      setStatus(r.ok ? `✅ Envoyée à ${d.sent} membre(s) (${d.failed} échec(s))` : `❌ ${d.error || 'Erreur'}`)
    } catch { setStatus('❌ Erreur réseau') }
    finally { setSending(false) }
  }

  if (siteId !== 'captain-parrainage') return <div style={{ padding: 24, color: '#8B9CB0' }}>Cet onglet est réservé à captain-parrainage.</div>

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 24px', color: '#fff' }}>
      <Link href={`/sites/${siteId}/parrainages`} style={{ color: '#8B9CB0', textDecoration: 'none', fontSize: 13 }}>← Offres de parrainage</Link>
      <h1 style={{ fontSize: 22, margin: '12px 0 20px' }}>✉️ Newsletter parrainage</h1>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Envoyer les offres aux membres</div>
        <div style={{ marginBottom: 12 }}><label style={label}>Sujet</label><input style={input} value={subject} onChange={e => setSubject(e.target.value)} /></div>
        <div style={{ marginBottom: 12 }}><label style={label}>Intro (optionnel)</label><textarea style={{ ...input, minHeight: 80 }} value={intro} onChange={e => setIntro(e.target.value)} placeholder="Un petit mot avant la liste des offres…" /></div>
        <div style={{ fontSize: 12, color: '#8B9CB0', marginBottom: 14 }}>Toutes les offres actives seront incluses. L'envoi part vers les membres ayant accepté la newsletter.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={send} style={btn('#F59E0B')} disabled={sending}>{sending ? 'Envoi…' : 'Envoyer maintenant'}</button>
          <span style={{ fontSize: 13, color: '#8B9CB0' }}>{status}</span>
        </div>
      </div>
    </div>
  )
}
