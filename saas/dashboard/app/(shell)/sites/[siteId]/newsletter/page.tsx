'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Papa from 'papaparse'

const C = {
  bg: '#0A0E1A', card: '#0D1117', border: '#1E2D3D', accent: '#00D4AA',
  text: '#fff', dim: '#8B9CB0', faint: '#4A5568', input: '#0A0E1A', danger: '#FC8181',
}
type Tag = { id: string; name: string; color: string; count: number }
type Sub = { id: string; email: string; name: string; status: string; source: string; created_at: string; tags: { id: string; name: string; color: string }[] }

export default function NewsletterPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const [subs, setSubs] = useState<Sub[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3b82f6')
  const fileRef = useRef<HTMLInputElement>(null)

  const base = `/api/sites/${siteId}/newsletter`

  async function load() {
    setLoading(true)
    try {
      const [rs, rt] = await Promise.all([fetch(`${base}/subscribers`), fetch(`${base}/tags`)])
      const ds = await rs.json(); const dt = await rt.json()
      if (ds.error) throw new Error(ds.error)
      setSubs(ds.subscribers || []); setActive(ds.active || 0)
      setTags(dt.tags || [])
    } catch (e: any) { setMsg('✗ ' + (e.message || 'Erreur de chargement')) }
    setLoading(false)
  }
  useEffect(() => { load() }, [siteId])

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  // ─── Import CSV ───────────────────────────────────────────────────────
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImporting(true)
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        const rows = (res.data as any[]).map(r => {
          const low: Record<string, any> = {}
          Object.keys(r).forEach(k => { low[k.trim().toLowerCase()] = r[k] })
          const email = String(low['email'] || low['e-mail'] || low['mail'] || low['adresse email'] || '').trim()
          // Nom = Prénom + Nom (en ignorant les "-" et valeurs vides)
          const prenom = low['prénom'] || low['prenom'] || low['first name'] || ''
          const nomcol = low['nom'] || low['name'] || low['last name'] || low['full name'] || ''
          const name = [prenom, nomcol].map((x: any) => String(x || '').trim()).filter((x: string) => x && x !== '-').join(' ')
          const tg = low['tags'] || low['tag'] || low['segment'] || low['liste'] || ''
          // Statut : "Actif"/"active"/vide => active, sinon désabonné
          const st = String(low['statut'] || low['status'] || '').trim().toLowerCase()
          const status = (st === '' || ['actif', 'active', 'oui', 'yes', '1'].includes(st)) ? 'active' : 'unsubscribed'
          // Date d'inscription (JJ/MM/AAAA) => created_at ISO
          const insc = String(low['inscrit le'] || low['inscrit'] || low['date'] || '').trim()
          const m = insc.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
          const created_at = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00Z` : ''
          return { email, name, tags: tg, status, created_at }
        }).filter(r => r.email)
        if (!rows.length) { flash('✗ Aucun email trouvé (colonne "email" attendue)'); setImporting(false); if (fileRef.current) fileRef.current.value = ''; return }
        try {
          const r = await fetch(`${base}/subscribers`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscribers: rows }),
          })
          const d = await r.json()
          if (d.error) throw new Error(d.error)
          flash(`✓ ${d.imported} importé(s), ${d.skipped} déjà présent(s)`)
          await load()
        } catch (e: any) { flash('✗ ' + (e.message || 'Erreur import')) }
        setImporting(false); if (fileRef.current) fileRef.current.value = ''
      },
      error: () => { flash('✗ CSV illisible'); setImporting(false) },
    })
  }

  async function createTag() {
    const nm = newTag.trim(); if (!nm) return
    try {
      const r = await fetch(`${base}/tags`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nm, color: newTagColor }) })
      const d = await r.json(); if (d.error) throw new Error(d.error)
      setTags([...tags, d.tag].sort((a, b) => a.name.localeCompare(b.name)))
      setNewTag('')
    } catch (e: any) { flash('✗ ' + (e.message || 'Erreur')) }
  }
  async function deleteTag(id: string) {
    if (!confirm('Supprimer ce tag ? (les abonnés ne sont pas supprimés)')) return
    await fetch(`${base}/tags`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setTags(tags.filter(t => t.id !== id)); load()
  }
  async function delSub(id: string) {
    if (!confirm('Supprimer cet abonné ?')) return
    await fetch(`${base}/subscribers`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setSubs(subs.filter(s => s.id !== id))
  }
  async function toggleStatus(s: Sub) {
    const status = s.status === 'active' ? 'unsubscribed' : 'active'
    await fetch(`${base}/subscribers`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, status }) })
    setSubs(subs.map(x => x.id === s.id ? { ...x, status } : x))
  }

  const filtered = subs.filter(s => !search || s.email.toLowerCase().includes(search.toLowerCase()) || (s.name || '').toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 4px', color: C.text }}>
      <Link href={`/sites/${siteId}`} style={{ color: C.dim, textDecoration: 'none', fontSize: 13 }}>← Retour au site</Link>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '10px 0 2px' }}>✉️ Newsletter — Abonnés</h1>
      <p style={{ color: C.dim, fontSize: 14, margin: '0 0 20px' }}>
        {loading ? 'Chargement…' : `${subs.length} abonné(s) · ${active} actif(s)`}
      </p>
      {msg && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: msg.startsWith('✓') ? 'rgba(0,212,170,.12)' : 'rgba(252,129,129,.12)', color: msg.startsWith('✓') ? C.accent : C.danger, fontSize: 13 }}>{msg}</div>}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <button onClick={() => fileRef.current?.click()} disabled={importing}
          style={{ padding: '10px 18px', borderRadius: 9, background: C.accent, color: '#04121C', border: 0, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          {importing ? 'Import en cours…' : '⇪ Importer un CSV'}
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
        <span style={{ fontSize: 12, color: C.faint, alignSelf: 'center' }}>Colonnes reconnues : email, nom, tags (séparés par , ; ou |)</span>
      </div>

      {/* Tags */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Tags / segments</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {tags.length === 0 && <span style={{ color: C.faint, fontSize: 13 }}>Aucun tag pour l'instant.</span>}
          {tags.map(t => (
            <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 999, background: t.color, color: '#fff', fontSize: 12.5, fontWeight: 700 }}>
              {t.name} <span style={{ opacity: .85, fontWeight: 500 }}>{t.count}</span>
              <button onClick={() => deleteTag(t.id)} title="Supprimer" style={{ background: 'rgba(255,255,255,.25)', border: 0, color: '#fff', width: 16, height: 16, borderRadius: '50%', cursor: 'pointer', fontSize: 11, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createTag() }}
            placeholder="Nouveau tag…" style={{ flex: '0 0 200px', padding: '8px 10px', background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, outline: 'none' }} />
          <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)} style={{ width: 40, height: 36, padding: 2, background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer' }} />
          <button onClick={createTag} style={{ padding: '8px 16px', borderRadius: 8, background: C.border, color: '#fff', border: 0, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>+ Ajouter</button>
        </div>
      </div>

      {/* Recherche */}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un abonné (email, nom)…"
        style={{ width: '100%', padding: '10px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, color: C.text, fontSize: 14, outline: 'none', marginBottom: 14, boxSizing: 'border-box' }} />

      {/* Liste */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0A0E1A' }}>
              {['Email', 'Nom', 'Tags', 'Statut', 'Source', ''].map((h, i) => (
                <th key={i} style={{ textAlign: 'left', padding: '11px 14px', color: C.dim, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: C.faint }}>Aucun abonné. Importe un CSV pour commencer.</td></tr>
            )}
            {filtered.map(s => (
              <tr key={s.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: '10px 14px' }}>{s.email}</td>
                <td style={{ padding: '10px 14px', color: C.dim }}>{s.name || '—'}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {s.tags.map(t => <span key={t.id} style={{ padding: '2px 8px', borderRadius: 999, background: t.color, color: '#fff', fontSize: 11, fontWeight: 600 }}>{t.name}</span>)}
                    {s.tags.length === 0 && <span style={{ color: C.faint }}>—</span>}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button onClick={() => toggleStatus(s)} style={{ padding: '3px 10px', borderRadius: 999, border: 0, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    background: s.status === 'active' ? 'rgba(0,212,170,.15)' : 'rgba(252,129,129,.15)', color: s.status === 'active' ? C.accent : C.danger }}>
                    {s.status === 'active' ? '✓ Actif' : '✗ Désabonné'}
                  </button>
                </td>
                <td style={{ padding: '10px 14px', color: C.faint, fontSize: 12 }}>{s.source}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <button onClick={() => delSub(s.id)} title="Supprimer" style={{ background: 'none', border: 0, color: C.faint, cursor: 'pointer', fontSize: 15 }}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
