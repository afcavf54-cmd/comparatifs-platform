'use client'
import { useEffect, useMemo, useState } from 'react'

const C = {
  bg: '#0A0E1A', card: '#0D1117', border: '#1E2D3D', accent: '#00D4AA',
  text: '#fff', dim: '#8B9CB0', faint: '#4A5568', input: '#0A0E1A',
}
const PATH = 'platform/backlink-settings.json'
const DISC_PATH = 'platform/backlink-discovered-brands.json'

type Event = { link_brand: string; contact_brand: string; date: string; amount?: number; notes?: string }
type Settings = {
  enabled: boolean; rotation_days: number; simultaneous: number; anchor?: string;
  excluded_sites?: string[]; excluded_comparatifs?: string[];
  brands: Record<string, string>; events?: Event[];
}

const euro = (n: number) => (n || 0).toLocaleString('fr-FR') + ' €'

export default function BacklinksPage() {
  const [s, setS] = useState<Settings>({ enabled: false, rotation_days: 21, simultaneous: 1, anchor: '', brands: {}, events: [], excluded_sites: [], excluded_comparatifs: [] })
  const [discovered, setDiscovered] = useState<Record<string, Record<string, number>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [newBrand, setNewBrand] = useState('')
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  useEffect(() => {
    (async () => {
      try {
        const [setRes, discRes] = await Promise.all([
          fetch(`/api/github?path=${encodeURIComponent(PATH)}&nocache=1`).then(r => r.json()).catch(() => ({})),
          fetch(`/api/github?path=${encodeURIComponent(DISC_PATH)}&nocache=1`).then(r => r.json()).catch(() => ({})),
        ])
        if (setRes.content) { try { setS({ brands: {}, events: [], ...JSON.parse(setRes.content) }) } catch {} }
        if (discRes.content) { try { const d = JSON.parse(discRes.content); setDiscovered(d && typeof d === 'object' && !Array.isArray(d) ? d : {}) } catch {} }
      } catch (e: any) { flash('✗ ' + (e.message || 'Erreur chargement')) }
      setLoading(false)
    })()
  }, [])

  async function save() {
    setSaving(true)
    try {
      const brands: Record<string, string> = {}
      for (const [k, v] of Object.entries(s.brands)) if (v && v.trim()) brands[k] = v.trim()
      const payload = { ...s, brands }
      const r = await fetch('/api/github', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: PATH, content: JSON.stringify(payload, null, 2), message: 'HUB: backlink settings' }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || d.error) throw new Error(d.error || 'HTTP ' + r.status)
      flash('✓ Enregistré sur GitHub')
    } catch (e: any) { flash('✗ ' + (e.message || 'Erreur sauvegarde')) }
    setSaving(false)
  }

  const setURL = (brand: string, url: string) => setS(x => ({ ...x, brands: { ...x.brands, [brand]: url } }))
  const addEvent = () => setS(x => ({ ...x, events: [...(x.events || []), { link_brand: '', contact_brand: '', date: new Date().toISOString().slice(0, 10), amount: 0, notes: '' }] }))
  const setEvent = (i: number, e: Partial<Event>) => setS(x => ({ ...x, events: (x.events || []).map((ev, j) => j === i ? { ...ev, ...e } : ev) }))
  const delEvent = (i: number) => setS(x => ({ ...x, events: (x.events || []).filter((_, j) => j !== i) }))

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const site of Object.values(discovered)) for (const [b, n] of Object.entries(site || {})) c[b] = (c[b] || 0) + (Number(n) || 0)
    return c
  }, [discovered])
  const brandNames = useMemo(() => Array.from(new Set([...Object.keys(s.brands), ...Object.keys(counts)]))
    .sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || a.localeCompare(b)), [s.brands, counts])
  const allBrands = useMemo(() => {
    let list = brandNames
    if (q.trim()) list = list.filter(n => n.toLowerCase().includes(q.toLowerCase()))
    if (onlyMissing) list = list.filter(n => !(s.brands[n] && s.brands[n].trim()))
    return list
  }, [brandNames, q, onlyMissing, s.brands])
  const withUrl = Object.values(s.brands).filter(v => v && v.trim()).length

  const matrix = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    let total = 0, revenue = 0
    for (const ev of (s.events || [])) {
      if (!ev.link_brand || !ev.contact_brand) continue
      m[ev.link_brand] = m[ev.link_brand] || {}
      m[ev.link_brand][ev.contact_brand] = (m[ev.link_brand][ev.contact_brand] || 0) + 1
      total++; revenue += Number(ev.amount) || 0
    }
    return { m, total, revenue }
  }, [s.events])

  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }
  const inp: React.CSSProperties = { padding: '8px 11px', borderRadius: 8, background: C.input, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }

  if (loading) return <div style={{ color: C.dim, padding: 24 }}>Chargement…</div>

  return (
    <div style={{ maxWidth: 1050, margin: '0 auto', padding: '8px 4px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, color: C.text, margin: 0 }}>🧲 Rotations backlinks</h1>
        <button onClick={save} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: C.accent, color: '#04121C', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{saving ? 'Sauvegarde…' : '💾 Enregistrer'}</button>
      </div>
      <div style={{ fontSize: 13, color: C.faint, marginBottom: 18 }}>Référentiel central : une URL par marque, rotation automatique du lien dofollow sur TOUS les comparatifs où la marque est présente.</div>
      {msg && <div style={{ marginBottom: 14, fontSize: 13, color: msg.startsWith('✓') ? C.accent : '#FC8181' }}>{msg}</div>}

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 14 }}>Réglages globaux</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={s.enabled} onChange={e => setS(x => ({ ...x, enabled: e.target.checked }))} style={{ width: 17, height: 17, accentColor: C.accent }} />
            Rotation activée
          </label>
          <div><div style={lbl}>Rotation (jours)</div><input type="number" value={s.rotation_days} onChange={e => setS(x => ({ ...x, rotation_days: parseInt(e.target.value) || 21 }))} style={{ ...inp, width: '100%' }} /></div>
          <div><div style={lbl}>Marques en //</div><input type="number" min={1} max={2} value={s.simultaneous} onChange={e => setS(x => ({ ...x, simultaneous: Math.max(1, parseInt(e.target.value) || 1) }))} style={{ ...inp, width: '100%' }} /></div>
          <div><div style={lbl}>Ancre (optionnel)</div><input value={s.anchor || ''} onChange={e => setS(x => ({ ...x, anchor: e.target.value }))} placeholder="texte du lien" style={{ ...inp, width: '100%' }} /></div>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
          <div style={{ fontSize: 15, color: C.text, fontWeight: 600 }}>Référentiel marques → URL</div>
          <div style={{ fontSize: 12, color: C.faint }}>{withUrl} active(s) · {brandNames.length} connue(s)</div>
        </div>
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 12 }}>Mets l'URL du <b>site officiel</b> de la marque (pas ton lien d'affiliation). Les marques sans URL sont ignorées. La liste se remplit automatiquement au fil des builds, triée par nombre de comparateurs (les plus fréquentes d'abord).</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 Rechercher une marque…" style={{ ...inp, flex: 1, minWidth: 180 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.dim, cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} style={{ accentColor: C.accent }} /> Sans URL seulement
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input value={newBrand} onChange={e => setNewBrand(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newBrand.trim()) { setURL(newBrand.trim(), ''); setNewBrand('') } }} placeholder="Ajouter une marque manuellement" style={{ ...inp, flex: 1 }} />
          <button onClick={() => { if (newBrand.trim()) { setURL(newBrand.trim(), ''); setNewBrand('') } }} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.accent}`, background: 'transparent', color: C.accent, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>+ Ajouter</button>
        </div>
        {allBrands.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.faint }}>Aucune marque {onlyMissing ? 'sans URL' : ''}. Elles apparaîtront après un build des comparatifs, ou ajoute-les à la main.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
            {allBrands.map(b => {
              const has = !!(s.brands[b] && s.brands[b].trim())
              return (
                <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: has ? C.accent : C.border, flexShrink: 0 }} />
                  <span style={{ width: 150, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b}</span>
                  <span title="comparateurs où la marque apparaît" style={{ width: 42, textAlign: 'center', fontSize: 11.5, color: counts[b] ? C.accent : C.faint, flexShrink: 0 }}>{counts[b] ? `×${counts[b]}` : '—'}</span>
                  <input value={s.brands[b] || ''} onChange={e => setURL(b, e.target.value)} placeholder="https://www.marque.com/" style={{ ...inp, flex: 1 }} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 2 }}>Matrice déclencheurs</div>
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 14 }}>Qui réagit quand un concurrent reçoit le lien. {matrix.total} contact(s) · {euro(matrix.revenue)} générés.</div>
        {Object.keys(matrix.m).length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.faint }}>Aucun contact enregistré. Logue les demandes entrantes ci-dessous.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(matrix.m).sort((a, b) => Object.values(b[1]).reduce((x, n) => x + n, 0) - Object.values(a[1]).reduce((x, n) => x + n, 0)).map(([trigger, reactions]) => (
              <div key={trigger} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
                <span style={{ color: C.accent, fontWeight: 700 }}>{trigger}</span><span style={{ color: C.faint }}>→</span>
                {Object.entries(reactions).sort((a, b) => b[1] - a[1]).map(([react, n]) => (
                  <span key={react} style={{ padding: '3px 10px', borderRadius: 14, background: C.input, border: `1px solid ${C.border}`, color: C.text }}>{react} <span style={{ color: C.faint }}>×{n}</span></span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 12 }}>Demandes entrantes</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 660 }}>
            <thead><tr>{['Lien posé (déclencheur)', 'Marque qui a contacté', 'Date', 'Montant €', 'Note', ''].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {(s.events || []).length === 0 && <tr><td colSpan={6} style={{ ...td, color: C.faint, textAlign: 'center' }}>Aucune demande enregistrée.</td></tr>}
              {(s.events || []).map((ev, i) => (
                <tr key={i}>
                  <td style={td}><input value={ev.link_brand} onChange={e => setEvent(i, { link_brand: e.target.value })} list="bl-brands" style={{ ...inp, width: '100%' }} /></td>
                  <td style={td}><input value={ev.contact_brand} onChange={e => setEvent(i, { contact_brand: e.target.value })} list="bl-brands" style={{ ...inp, width: '100%' }} /></td>
                  <td style={td}><input type="date" value={ev.date} onChange={e => setEvent(i, { date: e.target.value })} style={{ ...inp, width: '100%' }} /></td>
                  <td style={td}><input type="number" value={ev.amount || ''} onChange={e => setEvent(i, { amount: parseFloat(e.target.value) || 0 })} style={{ ...inp, width: '100%', textAlign: 'right' }} /></td>
                  <td style={td}><input value={ev.notes || ''} onChange={e => setEvent(i, { notes: e.target.value })} style={{ ...inp, width: '100%' }} /></td>
                  <td style={{ ...td, textAlign: 'center' }}><span onClick={() => delEvent(i)} style={{ cursor: 'pointer', color: C.faint }}>🗑</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="bl-brands">{brandNames.map(b => <option key={b} value={b} />)}</datalist>
        </div>
        <button onClick={addEvent} style={{ marginTop: 10, padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.dim, fontSize: 12, cursor: 'pointer' }}>+ Demande entrante</button>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }
const th: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #1E2D3D', fontSize: 11, color: '#4A5568', fontWeight: 600 }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #1E2D3D', fontSize: 13, color: '#fff' }
