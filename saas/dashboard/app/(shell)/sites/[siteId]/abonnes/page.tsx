'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

// ────────────────────────────────────────────────────────────────────────
// Abonnés du simulateur mon-credit-facile + envoi de newsletter.
// - Les leads (type de crédit, montant, situation pro) viennent de la Supabase
//   DÉDIÉE mcf (/api/sites/[siteId]/leads).
// - Les tags / le statut viennent de la newsletter CENTRALE (HUB), rapprochés
//   par email (/api/sites/[siteId]/newsletter/subscribers).
// - L'envoi réutilise la newsletter centrale (filtrage par tag), même principe
//   que monelor (/api/sites/[siteId]/newsletter).
// ────────────────────────────────────────────────────────────────────────

type Lead = { id: string; email: string; project?: string | null; amount?: number | null; situation?: string | null; duration?: string | null; optin?: boolean; n_simulations?: number; created_at: string }
type Tag = { id: string; name: string; color?: string; count?: number }
type Sub = { id: string; email: string; status: string; tags: Tag[] }

const PROJECT_LABEL: Record<string, string> = {
  'sans-justificatif': 'Crédit sans justificatif', personnel: 'Prêt personnel', etudiant: 'Prêt étudiant',
  auto: 'Crédit auto', moto: 'Crédit moto', travaux: 'Crédit travaux', autre: 'Autre projet', regroupement: 'Regroupement de crédits',
}
const SITUATION_LABEL: Record<string, string> = {
  cdi: 'CDI / Titulaire', cdd: 'CDD / Intérim', indep: 'Indépendant', retraite: 'Retraité', autre: 'Autre',
}

const wrap = { maxWidth: 1100, margin: '0 auto', padding: '20px 24px', color: '#fff' }
const card = { background: '#0F1724', border: '1px solid #1E2D3D', borderRadius: 12, padding: 18 } as const
const input = { width: '100%', padding: '9px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 } as const
const label = { display: 'block', fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }
const btn = (bg: string) => ({ padding: '9px 16px', borderRadius: 8, background: bg, color: '#fff', border: 0, fontSize: 13, fontWeight: 600, cursor: 'pointer' } as const)
const th = { textAlign: 'left' as const, fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em', padding: '8px 10px', borderBottom: '1px solid #1E2D3D', whiteSpace: 'nowrap' as const }
const td = { fontSize: 13, padding: '9px 10px', borderBottom: '1px solid #141E2C', verticalAlign: 'top' as const }

function fmtEur(n?: number | null) { return n == null ? '—' : Math.round(n).toLocaleString('fr-FR') + ' €' }
function fmtDate(s: string) { try { return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) } catch { return s } }

export default function AbonnesAdmin() {
  const { siteId } = useParams<{ siteId: string }>()
  const [leads, setLeads] = useState<Lead[]>([])
  const [subs, setSubs] = useState<Sub[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  // Composeur
  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('')
  const [selTags, setSelTags] = useState<string[]>([])
  const [testEmail, setTestEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')

  // Édition en ligne d'une ligne
  const [editing, setEditing] = useState<string | null>(null)
  const [dEmail, setDEmail] = useState('')
  const [dTags, setDTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [rowBusy, setRowBusy] = useState(false)

  async function load() {
    setLoading(true); setErr('')
    try {
      const [rl, rs, rt] = await Promise.all([
        fetch(`/api/sites/${siteId}/leads`),
        fetch(`/api/sites/${siteId}/newsletter/subscribers`),
        fetch(`/api/sites/${siteId}/newsletter/tags`),
      ])
      const dl = await rl.json(); const ds = await rs.json(); const dt = await rt.json()
      if (!rl.ok) setErr(dl.error || 'Erreur de chargement des leads')
      setLeads(dl.leads || [])
      setSubs(ds.subscribers || [])
      setTags(dt.tags || [])
    } catch (e: any) { setErr(e.message || 'Erreur réseau') }
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [siteId])

  // Rapproche leads ↔ abonnés centraux par email
  const subByEmail = useMemo(() => {
    const m: Record<string, Sub> = {}
    subs.forEach(s => { m[s.email.toLowerCase()] = s })
    return m
  }, [subs])

  const rows = useMemo(() => leads.map(l => {
    const s = subByEmail[l.email.toLowerCase()]
    return { ...l, tags: s?.tags || [], status: s?.status || '—' }
  }), [leads, subByEmail])

  const activeCount = rows.filter(r => r.status === 'active').length
  const optinCount = rows.filter(r => r.optin).length

  // Estimation des destinataires pour la sélection de tags (actifs)
  const recipientEstimate = useMemo(() => {
    if (!selTags.length) return subs.filter(s => s.status === 'active').length
    const set = new Set(selTags)
    return subs.filter(s => s.status === 'active' && s.tags.some(t => set.has(t.id))).length
  }, [selTags, subs])

  function toggleTag(id: string) { setSelTags(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]) }

  function exportCsv() {
    const head = ['email', 'statut', 'tags', 'type_credit', 'montant', 'situation', 'duree', 'optin', 'nb_simulations', 'date']
    const esc = (v: any) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
    const lines = rows.map(r => [
      r.email, r.status, r.tags.map(t => t.name).join(' | '),
      PROJECT_LABEL[r.project || ''] || r.project || '', r.amount ?? '',
      SITUATION_LABEL[r.situation || ''] || r.situation || '', r.duration || '',
      r.optin ? 'oui' : 'non', r.n_simulations ?? 1, fmtDate(r.created_at),
    ].map(esc).join(','))
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `abonnes-mon-credit-facile-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  }

  async function send(mode: 'test' | 'send') {
    setMsg('')
    if (!subject.trim() || !html.trim()) { setMsg('Sujet et contenu requis.'); return }
    if (mode === 'test' && !testEmail.trim()) { setMsg('Indique un email de test.'); return }
    if (mode === 'send' && !confirm(`Envoyer « ${subject} » à ${recipientEstimate} abonné(s) actif(s) ${selTags.length ? 'du/des tag(s) sélectionné(s)' : '(tous)'} ?`)) return
    setSending(true)
    try {
      const r = await fetch(`/api/sites/${siteId}/newsletter`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, subject, html, target_tags: selTags, test_email: testEmail }),
      })
      const d = await r.json()
      if (!r.ok) setMsg('❌ ' + (d.error || 'Erreur'))
      else if (mode === 'test') setMsg('✅ Test envoyé à ' + testEmail)
      else setMsg(`✅ Envoyé : ${d.sent} / ${d.recipient_count} destinataire(s)` + (d.failed ? ` (${d.failed} échec)` : ''))
    } catch (e: any) { setMsg('❌ ' + (e.message || 'Erreur réseau')) }
    setSending(false)
  }

  function startEdit(r: { id: string; email: string; tags: Tag[] }) {
    setEditing(r.id); setDEmail(r.email); setDTags(r.tags.map(t => t.id)); setNewTag('')
  }
  function toggleDraftTag(id: string) { setDTags(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]) }
  async function createTag() {
    const name = newTag.trim(); if (!name) return
    const r = await fetch(`/api/sites/${siteId}/newsletter/tags`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    const d = await r.json(); if (!r.ok) { alert(d.error || 'Erreur'); return }
    setTags(p => [...p, d.tag]); setDTags(p => [...p, d.tag.id]); setNewTag('')
  }
  async function patchManage(payload: any) {
    const r = await fetch(`/api/sites/${siteId}/leads/manage`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const d = await r.json().catch(() => ({})); return { ok: r.ok, d }
  }
  async function saveRow(origEmail: string) {
    setRowBusy(true)
    try {
      const em = dEmail.trim().toLowerCase()
      if (em && em !== origEmail) {
        const { ok, d } = await patchManage({ action: 'email', email: origEmail, newEmail: em })
        if (!ok) { alert(d.error || 'Erreur sur l’email'); setRowBusy(false); return }
      }
      const { ok, d } = await patchManage({ action: 'tags', email: em || origEmail, tagIds: dTags })
      if (!ok) { alert(d.error || 'Erreur sur les tags'); setRowBusy(false); return }
      setEditing(null); await load()
    } catch { alert('Erreur réseau') }
    setRowBusy(false)
  }
  async function setStatus(email: string, status: 'active' | 'unsubscribed') {
    await patchManage({ action: 'status', email, status }); load()
  }
  async function delRow(email: string) {
    if (!confirm('Supprimer cet inscrit (abonné central + lead) ?')) return
    await patchManage({ action: 'delete', email }); load()
  }

  if (siteId !== 'mon-credit-facile-fr') return <div style={{ padding: 24, color: '#8B9CB0' }}>Cet onglet est réservé à mon-credit-facile.</div>

  return (
    <div style={wrap}>
      <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none', fontSize: 13 }}>← {siteId}</Link>
      <h1 style={{ fontSize: 22, margin: '8px 0 2px' }}>✉️ Abonnés du simulateur & newsletter</h1>
      <p style={{ color: '#8B9CB0', fontSize: 13, margin: '0 0 18px' }}>
        Les inscrits du simulateur avec leur projet, montant et situation. Envoi de newsletter via le système central (filtrable par tag).
      </p>

      {err && <div style={{ ...card, borderColor: '#5A2230', background: '#2A1620', marginBottom: 16 }}>{err}</div>}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 16 }}>
        {[['Inscrits', rows.length], ['Abonnés actifs', activeCount], ['Opt-in marketing', optinCount]].map(([l, v]) => (
          <div key={l as string} style={card}>
            <div style={{ fontSize: 11, color: '#8B9CB0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{loading ? '…' : v}</div>
          </div>
        ))}
      </div>

      {/* Composeur newsletter */}
      <div style={{ ...card, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Envoyer une newsletter</h2>
          <span style={{ fontSize: 12, color: '#8B9CB0' }}>≈ {recipientEstimate} destinataire(s) actif(s)</span>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={label}>Cibler des tags (aucun = tous les abonnés actifs)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tags.length === 0 && <span style={{ fontSize: 12, color: '#8B9CB0' }}>Aucun tag pour le moment.</span>}
            {tags.map(t => {
              const on = selTags.includes(t.id)
              return (
                <button key={t.id} type="button" onClick={() => toggleTag(t.id)}
                  style={{ ...btn(on ? (t.color || '#3b82f6') : '#1E2D3D'), fontSize: 12, padding: '6px 12px', opacity: on ? 1 : 0.8 }}>
                  {on ? '✓ ' : ''}{t.name}{typeof t.count === 'number' ? ` (${t.count})` : ''}
                </button>
              )
            })}
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={label}>Sujet</label>
          <input style={input} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex. Vos meilleures offres de crédit ce mois-ci" />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={label}>Contenu (HTML autorisé)</label>
          <textarea style={{ ...input, minHeight: 160, fontFamily: 'ui-monospace,monospace' }} value={html} onChange={e => setHtml(e.target.value)} placeholder="<h2>Bonjour,</h2><p>…</p>" />
          <p style={{ fontSize: 11, color: '#8B9CB0', margin: '6px 0 0' }}>L'en-tête, le pied de page et le lien de désinscription sont ajoutés automatiquement. Expéditeur : newsletter centrale (Monelor) pendant la phase de test.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 240px' }}>
            <label style={label}>Email de test</label>
            <input style={input} value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="vous@exemple.fr" />
          </div>
          <button type="button" disabled={sending} style={btn('#1E2D3D')} onClick={() => send('test')}>Envoyer un test</button>
          <button type="button" disabled={sending} style={btn('#FF8A3D')} onClick={() => send('send')}>{sending ? 'Envoi…' : `Envoyer à la sélection (${recipientEstimate})`}</button>
        </div>
        {msg && <div style={{ marginTop: 12, fontSize: 13 }}>{msg}</div>}
      </div>

      {/* Tableau des inscrits */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Inscrits ({rows.length})</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={btn('#1E2D3D')} onClick={load}>Rafraîchir</button>
          <button type="button" style={btn('#1E2D3D')} onClick={exportCsv} disabled={!rows.length}>Exporter CSV</button>
        </div>
      </div>
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={th}>Email</th><th style={th}>Tags</th><th style={th}>Type de crédit</th>
              <th style={th}>Montant</th><th style={th}>Situation pro</th><th style={th}>Durée</th>
              <th style={th}>Opt-in</th><th style={th}>Date</th><th style={th}>Statut</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td style={td} colSpan={10}>Chargement…</td></tr>}
            {!loading && rows.length === 0 && <tr><td style={{ ...td, color: '#8B9CB0' }} colSpan={10}>Aucun inscrit pour le moment. Les emails saisis dans le simulateur apparaîtront ici.</td></tr>}
            {rows.map(r => (
              <Fragment key={r.id}>
              <tr>
                <td style={td}>{r.email}</td>
                <td style={td}>
                  {r.tags.length === 0 ? <span style={{ color: '#55657A' }}>—</span> : r.tags.map(t => (
                    <span key={t.id} style={{ display: 'inline-block', background: (t.color || '#3b82f6') + '22', color: t.color || '#9DB4D6', border: `1px solid ${t.color || '#3b82f6'}55`, borderRadius: 6, padding: '1px 7px', fontSize: 11, marginRight: 4, marginBottom: 2 }}>{t.name}</span>
                  ))}
                </td>
                <td style={td}>{PROJECT_LABEL[r.project || ''] || r.project || '—'}</td>
                <td style={{ ...td, fontWeight: 600 }}>{fmtEur(r.amount)}</td>
                <td style={td}>{SITUATION_LABEL[r.situation || ''] || r.situation || '—'}</td>
                <td style={td}>{r.duration || '—'}</td>
                <td style={td}>{r.optin ? '✅ oui' : '—'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                <td style={td}>{r.status === 'active' ? <span style={{ color: '#4ADE80' }}>actif</span> : r.status === 'unsubscribed' ? <span style={{ color: '#F87171' }}>désinscrit</span> : <span style={{ color: '#8B9CB0' }}>{r.status}</span>}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <button type="button" style={{ ...btn('#1E2D3D'), padding: '5px 10px', fontSize: 12 }} onClick={() => editing === r.id ? setEditing(null) : startEdit(r)}>{editing === r.id ? 'Fermer' : 'Éditer'}</button>
                </td>
              </tr>
              {editing === r.id && (
                <tr>
                  <td style={{ ...td, background: '#0A0E1A' }} colSpan={10}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
                      <div style={{ flex: '1 1 260px' }}>
                        <label style={label}>Adresse email</label>
                        <input style={input} value={dEmail} onChange={e => setDEmail(e.target.value)} />
                        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {r.status === 'active'
                            ? <button type="button" style={{ ...btn('#1E2D3D'), fontSize: 12 }} onClick={() => setStatus(r.email, 'unsubscribed')}>Désinscrire</button>
                            : <button type="button" style={{ ...btn('#1E2D3D'), fontSize: 12 }} onClick={() => setStatus(r.email, 'active')}>Réactiver</button>}
                          <button type="button" style={{ ...btn('#7A2230'), fontSize: 12 }} onClick={() => delRow(r.email)}>Supprimer</button>
                        </div>
                      </div>
                      <div style={{ flex: '2 1 340px' }}>
                        <label style={label}>Tags</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {tags.map(t => {
                            const on = dTags.includes(t.id)
                            return <button key={t.id} type="button" onClick={() => toggleDraftTag(t.id)} style={{ ...btn(on ? (t.color || '#3b82f6') : '#1E2D3D'), fontSize: 12, padding: '5px 10px', opacity: on ? 1 : 0.8 }}>{on ? '✓ ' : ''}{t.name}</button>
                          })}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                          <input style={{ ...input, flex: 1 }} value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="Créer un tag…" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createTag() } }} />
                          <button type="button" style={{ ...btn('#1E2D3D'), fontSize: 12 }} onClick={createTag}>+ Ajouter</button>
                        </div>
                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                          <button type="button" disabled={rowBusy} style={btn('#FF8A3D')} onClick={() => saveRow(r.email)}>{rowBusy ? 'Enregistrement…' : 'Enregistrer'}</button>
                          <button type="button" style={btn('#1E2D3D')} onClick={() => setEditing(null)}>Annuler</button>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
