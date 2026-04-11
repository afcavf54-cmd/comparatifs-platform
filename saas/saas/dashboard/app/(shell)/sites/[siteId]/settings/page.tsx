'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SettingsPage() {
  const { siteId } = useParams()
  const router = useRouter()
  const [site, setSite] = useState<any>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirmDelete, setConfirmDelete] = useState('')

  useEffect(() => {
    fetch(`/api/sites/${siteId}`).then(r => r.json()).then(d => {
      setSite(d)
      setForm({ name: d.name, domain: d.domain, cloudflare_project: d.cloudflare_project, description: d.description || '', status: d.status, sheet_csv_url: d.sheet_csv_url || '' })
    })
  }, [siteId])

  async function save() {
    setSaving(true)
    setMsg('')
    const r = await fetch(`/api/sites/${siteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const d = await r.json()
    setMsg(d.id ? '✓ Paramètres sauvegardés' : '✗ Erreur')
    setSaving(false)
  }

  async function deleteSite() {
    if (confirmDelete !== site?.name) return
    setDeleting(true)
    const r = await fetch(`/api/sites/${siteId}`, { method: 'DELETE' })
    const d = await r.json()
    if (d.ok) router.push('/sites')
    else { setMsg('✗ Erreur suppression'); setDeleting(false) }
  }

  const inp = (label: string, key: string, type = 'text') => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <input type={type} value={form[key] || ''} onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
        style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
    </div>
  )

  if (!site) return <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 60 }}>Chargement...</div>

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 24, fontSize: 13, color: '#8B9CB0' }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Sites</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none' }}>{siteId}</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: '#fff' }}>Paramètres</span>
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 28 }}>Paramètres</h1>

      {/* General */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h3 style={{ color: '#fff', margin: '0 0 20px', fontSize: 15, fontWeight: 600 }}>Informations générales</h3>
        {inp('Nom du site', 'name')}
        {inp('Domaine', 'domain')}
        {inp('Projet Cloudflare Pages', 'cloudflare_project')}
        {inp('URL Google Sheet CSV', 'sheet_csv_url')}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Description</div>
          <textarea value={form.description || ''} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} rows={3}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Statut</div>
          <select value={form.status || 'draft'} onChange={e => setForm((f: any) => ({ ...f, status: e.target.value }))}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none' }}>
            <option value="draft">Draft</option>
            <option value="live">Live</option>
            <option value="building">Building</option>
          </select>
        </div>
        {msg && <div style={{ fontSize: 13, color: msg.startsWith('✓') ? '#00D4AA' : '#FC8181', marginBottom: 12 }}>{msg}</div>}
        <button onClick={save} disabled={saving} style={{ padding: '11px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          {saving ? 'Sauvegarde...' : '💾 Sauvegarder'}
        </button>
      </div>

      {/* Danger zone */}
      <div style={{ background: '#0D1117', border: '1px solid rgba(252,129,129,0.3)', borderRadius: 16, padding: 24 }}>
        <h3 style={{ color: '#FC8181', margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>⚠️ Zone dangereuse</h3>
        <p style={{ color: '#8B9CB0', fontSize: 13, marginBottom: 16 }}>
          Supprimer ce site le retire du HUB. Les fichiers GitHub et le site Cloudflare ne sont pas supprimés automatiquement.
        </p>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#8B9CB0', marginBottom: 6 }}>Tapez <strong style={{ color: '#fff' }}>{site.name}</strong> pour confirmer</div>
          <input value={confirmDelete} onChange={e => setConfirmDelete(e.target.value)} placeholder={site.name}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid rgba(252,129,129,0.3)', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <button onClick={deleteSite} disabled={deleting || confirmDelete !== site.name} style={{
          padding: '10px 20px', borderRadius: 10, border: 'none', fontWeight: 600, fontSize: 13,
          background: confirmDelete === site.name ? '#FC8181' : '#1E2D3D',
          color: confirmDelete === site.name ? '#fff' : '#4A5568',
          cursor: confirmDelete === site.name ? 'pointer' : 'not-allowed'
        }}>
          {deleting ? 'Suppression...' : '🗑 Supprimer ce site'}
        </button>
      </div>
    </div>
  )
}
