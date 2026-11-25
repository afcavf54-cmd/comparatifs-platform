'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import RichEditor from '../../../../../components/RichEditor'

// Newsletter captain-parrainage — même mise en page que la newsletter Monelor
// (Composer + Historique, onglet Abonnés), branchée sur les membres et offres Captain.
const C = {
  bg: '#0A0E1A', card: '#0D1117', border: '#1E2D3D', accent: '#00D4AA',
  text: '#fff', dim: '#8B9CB0', faint: '#4A5568', input: '#0A0E1A', danger: '#FC8181', gold: '#D4A43C',
}
type Member = { id: string; email: string; newsletter_opt_in: boolean; consent_at: string | null; created_at: string }
type Offer = { id: string; marque: string; montant: number | null; actif?: boolean; en_avant?: boolean; couleur?: string | null; sans_depot?: boolean }
type Envoi = { id: string; sujet: string; nb_destinataires: number; parrainage_ids: string[] | null; envoye_le: string }

const eur = (n: number | null) => n == null ? '' : new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' €'

export default function ParrainagesNewsletter() {
  const { siteId } = useParams<{ siteId: string }>()
  const base = `/api/sites/${siteId}/parrainages`
  const [tab, setTab] = useState<'compose' | 'subscribers'>('compose')
  const [members, setMembers] = useState<Member[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [envois, setEnvois] = useState<Envoi[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [selOffers, setSelOffers] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [rm, ro, rn] = await Promise.all([fetch(`${base}/membres`), fetch(base), fetch(`${base}/newsletter`)])
      const dm = await rm.json(), d_o = await ro.json(), dn = await rn.json()
      if (dm.error) throw new Error(dm.error)
      setMembers(dm.members || [])
      setOffers((d_o.offers || []).filter((o: Offer) => o.actif !== false))
      setEnvois(dn.newsletters || [])
    } catch (e: any) { setMsg('✗ ' + (e.message || 'Erreur de chargement')) }
    setLoading(false)
  }
  useEffect(() => { if (siteId === 'captain-parrainage') load() }, [siteId])
  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(''), 4500) }

  const optin = members.filter(m => m.newsletter_opt_in)

  async function doSend(mode: 'test' | 'send') {
    const empty = !content.trim() || content === '<p></p>'
    if (!subject.trim()) return flash('✗ Sujet requis')
    if (empty && selOffers.size === 0) return flash('✗ Écris un message ou coche au moins une offre')
    let test_email = ''
    if (mode === 'test') {
      test_email = prompt('Adresse email de test :', '') || ''
      if (!test_email) return
    } else if (!confirm(`Envoyer à ${optin.length} membre(s) inscrit(s) ?`)) return
    setSending(true)
    try {
      const r = await fetch(`${base}/newsletter`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, subject, html: empty ? '' : content, offerIds: Array.from(selOffers), test_email }),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      if (mode === 'test') flash('✓ Email de test envoyé')
      else { flash(`✓ Envoyée : ${d.sent} ok${d.failed ? `, ${d.failed} échec(s)` : ''}`); setSubject(''); setContent(''); setSelOffers(new Set()) }
      load()
    } catch (e: any) { flash('✗ ' + (e.message || 'Erreur envoi')) }
    setSending(false)
  }

  async function toggleOptin(m: Member) {
    const v = !m.newsletter_opt_in
    const r = await fetch(`${base}/membres`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, newsletter_opt_in: v }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d.error) return flash('✗ ' + (d.error || 'Erreur'))
    setMembers(members.map(x => x.id === m.id ? { ...x, newsletter_opt_in: v } : x))
  }

  if (siteId !== 'captain-parrainage') return <div style={{ padding: 24, color: C.dim }}>Cet onglet est réservé à captain-parrainage.</div>

  const filtered = members.filter(m => !search || (m.email || '').toLowerCase().includes(search.toLowerCase()))
  const offerName = (id: string) => offers.find(o => o.id === id)?.marque
  const tabBtn = (k: typeof tab, label: string) => (
    <button onClick={() => setTab(k)} style={{ padding: '9px 18px', borderRadius: 9, border: 0, cursor: 'pointer', fontWeight: 700, fontSize: 13, background: tab === k ? C.accent : C.card, color: tab === k ? '#04121C' : C.dim }}>{label}</button>
  )

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '8px 4px', color: C.text }}>
      <Link href={`/sites/${siteId}`} style={{ color: C.dim, textDecoration: 'none', fontSize: 13 }}>← Retour au site</Link>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '10px 0 2px' }}>✉️ Newsletter parrainage</h1>
      <p style={{ color: C.dim, fontSize: 14, margin: '0 0 16px' }}>{loading ? 'Chargement…' : `${optin.length} membre(s) inscrit(s) à la newsletter sur ${members.length}`}</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>{tabBtn('compose', '📝 Composer')}{tabBtn('subscribers', `👥 Abonnés (${members.length})`)}</div>
      {msg && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: msg.startsWith('✓') ? 'rgba(0,212,170,.12)' : 'rgba(252,129,129,.12)', color: msg.startsWith('✓') ? C.accent : C.danger, fontSize: 13 }}>{msg}</div>}

      {tab === 'compose' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Nouvelle newsletter</div>
            <div style={{ color: C.dim, fontSize: 13, marginBottom: 18 }}>Composez et envoyez aux membres inscrits.</div>

            <label style={lbl}>Sujet</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex : Les nouvelles offres de parrainage" style={inp} />

            <label style={{ ...lbl, marginTop: 16 }}>Contenu</label>
            <div style={{ marginTop: 6 }}>
              <RichEditor value={content} onChange={setContent} placeholder="Écrivez votre message ici…" height={300} />
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 18 }}>
              <label style={{ ...lbl, marginBottom: 0 }}>Offres à ajouter sous le message (optionnel)</label>
              {offers.length > 0 && (
                <button onClick={() => setSelOffers(selOffers.size === offers.length ? new Set() : new Set(offers.map(o => o.id)))}
                  style={{ background: 'none', border: 0, color: C.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {selOffers.size === offers.length ? 'Tout décocher' : 'Tout cocher'}
                </button>
              )}
            </div>
            <div style={{ color: C.faint, fontSize: 12, margin: '6px 0 8px' }}>Chaque offre cochée apparaît avec son montant et un bouton « Voir l'offre ».</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {offers.map(o => {
                const on = selOffers.has(o.id)
                const col = o.couleur && /^#/.test(o.couleur) ? o.couleur : C.accent
                return (
                  <button key={o.id} onClick={() => setSelOffers(p => { const n = new Set(p); on ? n.delete(o.id) : n.add(o.id); return n })}
                    style={{ padding: '6px 12px', borderRadius: 999, border: on ? `2px solid ${col}` : '2px solid transparent', background: on ? col : '#0A0E1A', color: on ? '#fff' : C.dim, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    {o.marque}{o.montant != null ? ` · ${eur(o.montant)}` : ''}
                  </button>
                )
              })}
              {!loading && offers.length === 0 && <span style={{ color: C.faint, fontSize: 13 }}>Aucune offre active.</span>}
            </div>

            <div style={{ marginTop: 16, padding: '12px 16px', background: '#0A0E1A', border: `1px solid ${C.border}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              👥 <strong>{optin.length}</strong> membre(s) ciblé(s) (inscrits à la newsletter)
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => doSend('test')} disabled={sending} style={{ padding: '11px 18px', borderRadius: 9, background: C.border, color: '#fff', border: 0, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>✈ Tester</button>
              <button onClick={() => doSend('send')} disabled={sending} style={btnSend}>{sending ? 'Envoi…' : `➤ Envoyer à ${optin.length} membres`}</button>
            </div>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Historique</div>
            <div style={{ color: C.dim, fontSize: 13, marginBottom: 16 }}>Dernières newsletters</div>
            {envois.length === 0 && <div style={{ color: C.faint, fontSize: 13 }}>Aucun envoi pour l'instant.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {envois.map(n => {
                const names = (n.parrainage_ids || []).map(offerName).filter(Boolean)
                return (
                  <div key={n.id} style={{ padding: '12px 14px', background: '#0A0E1A', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.35 }}>{n.sujet}</div>
                      <span style={{ padding: '3px 9px', borderRadius: 999, background: 'rgba(0,212,170,.15)', color: C.accent, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>✓ Envoyée</span>
                    </div>
                    <div style={{ color: C.faint, fontSize: 12, marginTop: 6 }}>
                      {new Date(n.envoye_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · {n.nb_destinataires} envoyé(s)
                    </div>
                    {names.length > 0 && <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>Offres : {names.join(', ')}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'subscribers' && (
        <div>
          <div style={{ color: C.faint, fontSize: 12, marginBottom: 12 }}>Les membres s'inscrivent depuis le site (espace membre). Clique sur le statut pour activer ou couper la newsletter d'un membre.</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un email…" style={inp} />
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#0A0E1A' }}>{['Email', 'Newsletter', 'Inscrit le'].map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '11px 14px', color: C.dim, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.length === 0 && !loading && <tr><td colSpan={3} style={{ padding: 30, textAlign: 'center', color: C.faint }}>Aucun membre.</td></tr>}
                {filtered.map(m => (
                  <tr key={m.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 14px' }}>{m.email}</td>
                    <td style={{ padding: '10px 14px' }}><button onClick={() => toggleOptin(m)} style={{ padding: '3px 10px', borderRadius: 999, border: 0, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: m.newsletter_opt_in ? 'rgba(0,212,170,.15)' : 'rgba(252,129,129,.15)', color: m.newsletter_opt_in ? C.accent : C.danger }}>{m.newsletter_opt_in ? '✓ Inscrit' : '✗ Désinscrit'}</button></td>
                    <td style={{ padding: '10px 14px', color: C.faint, fontSize: 12 }}>{new Date(m.created_at).toLocaleDateString('fr-FR')}</td>
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
