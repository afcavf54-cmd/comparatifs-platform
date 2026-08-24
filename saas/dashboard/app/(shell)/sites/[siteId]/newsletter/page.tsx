'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Papa from 'papaparse'
import RichEditor from '../../../../../components/RichEditor'

const C = {
  bg: '#0A0E1A', card: '#0D1117', border: '#1E2D3D', accent: '#00D4AA',
  text: '#fff', dim: '#8B9CB0', faint: '#4A5568', input: '#0A0E1A', danger: '#FC8181', gold: '#D4A43C',
}
type Tag = { id: string; name: string; color: string; count: number }
type Sub = { id: string; email: string; name: string; status: string; source: string; created_at: string; tags: { id: string; name: string; color: string }[] }
type NL = { id: string; subject: string; status: string; recipient_count: number; sent_count: number; fail_count: number; scheduled_at: string | null; sent_at: string | null; created_at: string }

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  sent: { label: '✓ Envoyée', bg: 'rgba(0,212,170,.15)', fg: '#00D4AA' },
  sending: { label: '⏱ En cours', bg: 'rgba(212,164,60,.18)', fg: '#D4A43C' },
  scheduled: { label: '📅 Programmée', bg: 'rgba(139,156,176,.18)', fg: '#8B9CB0' },
  failed: { label: '⚠ Échec', bg: 'rgba(252,129,129,.15)', fg: '#FC8181' },
  draft: { label: 'Brouillon', bg: 'rgba(139,156,176,.12)', fg: '#8B9CB0' },
}

export default function NewsletterPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const base = `/api/sites/${siteId}/newsletter`
  const [tab, setTab] = useState<'compose' | 'subscribers'>('compose')
  const [subs, setSubs] = useState<Sub[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [active, setActive] = useState(0)
  const [nls, setNls] = useState<NL[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // Composer
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [selTags, setSelTags] = useState<Set<string>>(new Set())
  const [schedOn, setSchedOn] = useState(false)
  const [schedAt, setSchedAt] = useState('')
  const [sending, setSending] = useState(false)

  // Abonnés
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3b82f6')
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    try {
      const [rs, rt, rn] = await Promise.all([fetch(`${base}/subscribers`), fetch(`${base}/tags`), fetch(base)])
      const ds = await rs.json(), dt = await rt.json(), dn = await rn.json()
      if (ds.error) throw new Error(ds.error)
      setSubs(ds.subscribers || []); setActive(ds.active || 0)
      setTags(dt.tags || []); setNls(dn.newsletters || [])
    } catch (e: any) { setMsg('✗ ' + (e.message || 'Erreur de chargement')) }
    setLoading(false)
  }
  useEffect(() => { load() }, [siteId])
  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(''), 4500) }

  // destinataires ciblés (actifs, filtrés par tags sélectionnés)
  const targetSubs = subs.filter(s => s.status === 'active' && (selTags.size === 0 || s.tags.some(t => selTags.has(t.id))))

  async function doSend(mode: 'test' | 'send' | 'schedule') {
    if (!subject.trim()) return flash('✗ Sujet requis')
    if (!content.trim() || content === '<p></p>') return flash('✗ Contenu requis')
    if (mode === 'send' && !confirm(`Envoyer à ${targetSubs.length} abonné(s) ?`)) return
    if (mode === 'schedule' && !schedAt) return flash('✗ Choisis une date de programmation')
    let test_email = ''
    if (mode === 'test') {
      test_email = prompt('Adresse email de test :', 'info@monelor.com') || ''
      if (!test_email) return
    }
    setSending(true)
    try {
      const r = await fetch(base, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, subject, html: content, target_tags: [...selTags], test_email, scheduled_at: schedOn ? schedAt : undefined }),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      if (mode === 'test') flash('✓ Email de test envoyé')
      else if (mode === 'schedule') { flash(`✓ Programmée pour ${targetSubs.length} abonné(s)`); setSubject(''); setContent(''); }
      else { flash(`✓ Envoyée : ${d.sent} ok${d.failed ? `, ${d.failed} échec(s)` : ''}`); setSubject(''); setContent(''); }
      load()
    } catch (e: any) { flash('✗ ' + (e.message || 'Erreur envoi')) }
    setSending(false)
  }

  // ─── Import CSV ──
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
          const prenom = low['prénom'] || low['prenom'] || low['first name'] || ''
          const nomcol = low['nom'] || low['name'] || low['last name'] || low['full name'] || ''
          const name = [prenom, nomcol].map((x: any) => String(x || '').trim()).filter((x: string) => x && x !== '-').join(' ')
          const tg = low['tags'] || low['tag'] || low['segment'] || low['liste'] || ''
          const st = String(low['statut'] || low['status'] || '').trim().toLowerCase()
          const status = (st === '' || ['actif', 'active', 'oui', 'yes', '1'].includes(st)) ? 'active' : 'unsubscribed'
          const insc = String(low['inscrit le'] || low['inscrit'] || low['date'] || '').trim()
          const m = insc.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
          const created_at = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00Z` : ''
          return { email, name, tags: tg, status, created_at }
        }).filter(r => r.email)
        if (!rows.length) { flash('✗ Aucun email trouvé'); setImporting(false); if (fileRef.current) fileRef.current.value = ''; return }
        try {
          const r = await fetch(`${base}/subscribers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscribers: rows }) })
          const d = await r.json(); if (d.error) throw new Error(d.error)
          flash(`✓ ${d.imported} importé(s), ${d.skipped} déjà présent(s)`); await load()
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
      setTags([...tags, d.tag].sort((a, b) => a.name.localeCompare(b.name))); setNewTag('')
    } catch (e: any) { flash('✗ ' + (e.message || 'Erreur')) }
  }
  async function deleteTag(id: string) {
    if (!confirm('Supprimer ce tag ?')) return
    await fetch(`${base}/tags`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setTags(tags.filter(t => t.id !== id)); setSelTags(p => { const n = new Set(p); n.delete(id); return n }); load()
  }
  async function delSub(id: string) {
    if (!confirm('Supprimer cet abonné ?')) return
    await fetch(`${base}/subscribers`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setSubs(subs.filter(s => s.id !== id))
  }
  async function toggleStatus(s: Sub) {
    const status = s.status === 'active' ? 'unsubscribed' : 'active'
    await fetch(`${base}/subscribers`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, status }) })
    setSubs(subs.map(x => x.id === s.id ? { ...x, status } : x)); setActive(a => status === 'active' ? a + 1 : a - 1)
  }

  const filtered = subs.filter(s => !search || s.email.toLowerCase().includes(search.toLowerCase()) || (s.name || '').toLowerCase().includes(search.toLowerCase()))
  const tabBtn = (k: typeof tab, label: string) => (
    <button onClick={() => setTab(k)} style={{ padding: '9px 18px', borderRadius: 9, border: 0, cursor: 'pointer', fontWeight: 700, fontSize: 13, background: tab === k ? C.accent : C.card, color: tab === k ? '#04121C' : C.dim }}>{label}</button>
  )

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '8px 4px', color: C.text }}>
      <Link href={`/sites/${siteId}`} style={{ color: C.dim, textDecoration: 'none', fontSize: 13 }}>← Retour au site</Link>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '10px 0 2px' }}>✉️ Newsletter</h1>
      <p style={{ color: C.dim, fontSize: 14, margin: '0 0 16px' }}>{loading ? 'Chargement…' : `${active} abonné(s) actif(s) sur ${subs.length}`}</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>{tabBtn('compose', '📝 Composer')}{tabBtn('subscribers', `👥 Abonnés (${subs.length})`)}</div>
      {msg && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: msg.startsWith('✓') ? 'rgba(0,212,170,.12)' : 'rgba(252,129,129,.12)', color: msg.startsWith('✓') ? C.accent : C.danger, fontSize: 13 }}>{msg}</div>}

      {tab === 'compose' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
          {/* Composer */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Nouvelle newsletter</div>
            <div style={{ color: C.dim, fontSize: 13, marginBottom: 18 }}>Composez et envoyez à vos abonnés.</div>

            <label style={lbl}>Sujet</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex : Les nouveautés du mois" style={inp} />

            <label style={{ ...lbl, marginTop: 16 }}>Cibler par tags (optionnel)</label>
            <div style={{ color: C.faint, fontSize: 12, marginBottom: 8 }}>Sans sélection, tous les abonnés actifs reçoivent la newsletter.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {tags.map(t => {
                const on = selTags.has(t.id)
                return (
                  <button key={t.id} onClick={() => setSelTags(p => { const n = new Set(p); on ? n.delete(t.id) : n.add(t.id); return n })}
                    style={{ padding: '6px 12px', borderRadius: 999, border: on ? `2px solid ${t.color}` : '2px solid transparent', background: on ? t.color : '#0A0E1A', color: on ? '#fff' : C.dim, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    {t.name}
                  </button>
                )
              })}
              {tags.length === 0 && <span style={{ color: C.faint, fontSize: 13 }}>Aucun tag — va dans l'onglet Abonnés pour en créer.</span>}
            </div>

            <label style={lbl}>Contenu</label>
            <div style={{ marginTop: 6 }}>
              <RichEditor value={content} onChange={setContent} placeholder="Écrivez votre message ici…" height={340} />
            </div>

            <div style={{ marginTop: 16, padding: '12px 16px', background: '#0A0E1A', border: `1px solid ${C.border}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              👥 <strong>{targetSubs.length}</strong> abonné(s) ciblé(s) {selTags.size === 0 ? '(tous les actifs)' : ''}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={schedOn} onChange={e => setSchedOn(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.accent }} />
              📅 Programmer l'envoi
            </label>
            {schedOn && <input type="datetime-local" value={schedAt} onChange={e => setSchedAt(e.target.value)} style={{ ...inp, marginTop: 10 }} />}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => doSend('test')} disabled={sending} style={{ padding: '11px 18px', borderRadius: 9, background: C.border, color: '#fff', border: 0, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>✈ Tester</button>
              {schedOn
                ? <button onClick={() => doSend('schedule')} disabled={sending} style={btnSend}>📅 Programmer l'envoi</button>
                : <button onClick={() => doSend('send')} disabled={sending} style={btnSend}>{sending ? 'Envoi…' : `➤ Envoyer à ${targetSubs.length} abonnés`}</button>}
            </div>
          </div>

          {/* Historique */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Historique</div>
            <div style={{ color: C.dim, fontSize: 13, marginBottom: 16 }}>Dernières newsletters</div>
            {nls.length === 0 && <div style={{ color: C.faint, fontSize: 13 }}>Aucun envoi pour l'instant.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {nls.map(n => {
                const st = STATUS[n.status] || STATUS.draft
                const d = n.sent_at || n.scheduled_at || n.created_at
                return (
                  <div key={n.id} style={{ padding: '12px 14px', background: '#0A0E1A', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.35 }}>{n.subject}</div>
                      <span style={{ padding: '3px 9px', borderRadius: 999, background: st.bg, color: st.fg, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{st.label}</span>
                    </div>
                    <div style={{ color: C.faint, fontSize: 12, marginTop: 6 }}>
                      {d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                      {n.status === 'sent' && ` · ${n.sent_count}/${n.recipient_count} envoyés`}
                      {n.status === 'scheduled' && ` · ${n.recipient_count} destinataires`}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'subscribers' && (
        <div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            <button onClick={() => fileRef.current?.click()} disabled={importing} style={{ padding: '10px 18px', borderRadius: 9, background: C.accent, color: '#04121C', border: 0, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{importing ? 'Import…' : '⇪ Importer un CSV'}</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
            <span style={{ fontSize: 12, color: C.faint, alignSelf: 'center' }}>Colonnes : email, prénom/nom, tags, statut, inscrit le</span>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Tags / segments</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {tags.length === 0 && <span style={{ color: C.faint, fontSize: 13 }}>Aucun tag.</span>}
              {tags.map(t => (
                <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 999, background: t.color, color: '#fff', fontSize: 12.5, fontWeight: 700 }}>
                  {t.name} <span style={{ opacity: .85, fontWeight: 500 }}>{t.count}</span>
                  <button onClick={() => deleteTag(t.id)} style={{ background: 'rgba(255,255,255,.25)', border: 0, color: '#fff', width: 16, height: 16, borderRadius: '50%', cursor: 'pointer', fontSize: 11, lineHeight: 1 }}>×</button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createTag() }} placeholder="Nouveau tag…" style={{ ...inp, flex: '0 0 200px', margin: 0 }} />
              <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)} style={{ width: 40, height: 36, padding: 2, background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer' }} />
              <button onClick={createTag} style={{ padding: '8px 16px', borderRadius: 8, background: C.border, color: '#fff', border: 0, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>+ Ajouter</button>
            </div>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher (email, nom)…" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#0A0E1A' }}>{['Email', 'Nom', 'Tags', 'Statut', 'Source', ''].map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '11px 14px', color: C.dim, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.length === 0 && !loading && <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: C.faint }}>Aucun abonné.</td></tr>}
                {filtered.map(s => (
                  <tr key={s.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 14px' }}>{s.email}</td>
                    <td style={{ padding: '10px 14px', color: C.dim }}>{s.name || '—'}</td>
                    <td style={{ padding: '10px 14px' }}><span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{s.tags.map(t => <span key={t.id} style={{ padding: '2px 8px', borderRadius: 999, background: t.color, color: '#fff', fontSize: 11, fontWeight: 600 }}>{t.name}</span>)}{s.tags.length === 0 && <span style={{ color: C.faint }}>—</span>}</span></td>
                    <td style={{ padding: '10px 14px' }}><button onClick={() => toggleStatus(s)} style={{ padding: '3px 10px', borderRadius: 999, border: 0, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: s.status === 'active' ? 'rgba(0,212,170,.15)' : 'rgba(252,129,129,.15)', color: s.status === 'active' ? C.accent : C.danger }}>{s.status === 'active' ? '✓ Actif' : '✗ Désabonné'}</button></td>
                    <td style={{ padding: '10px 14px', color: C.faint, fontSize: 12 }}>{s.source}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}><button onClick={() => delSub(s.id)} style={{ background: 'none', border: 0, color: C.faint, cursor: 'pointer', fontSize: 15 }}>🗑</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: '#8B9CB0', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6, fontWeight: 600 }
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 9, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const btnSend: React.CSSProperties = { flex: 1, padding: '11px 18px', borderRadius: 9, background: '#00D4AA', color: '#04121C', border: 0, fontWeight: 800, fontSize: 14, cursor: 'pointer' }
