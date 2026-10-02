'use client'
import { useEffect, useMemo, useState } from 'react'

const C = {
  bg: '#0A0E1A', card: '#0D1117', border: '#1E2D3D', accent: '#00D4AA',
  text: '#fff', dim: '#8B9CB0', faint: '#4A5568', input: '#0A0E1A',
}
const PATH = 'platform/backlink-rotations.json'

type Brand = { name: string; url: string }
type Event = { link_brand: string; contact_brand: string; date: string; amount?: number; notes?: string }
type Rotation = {
  id: string; site: string; comparatif_slug: string; brands: Brand[];
  rotation_days: number; simultaneous: number; started_at: string;
  active: boolean; anchor?: string; events?: Event[]
}

const uid = () => Math.random().toString(36).slice(2, 9)
const euro = (n: number) => (n || 0).toLocaleString('fr-FR') + ' €'

// Marque(s) active(s) maintenant — même logique que generate.py
function activeBrands(rot: Rotation): Brand[] {
  const brands = (rot.brands || []).filter(b => b.url && b.name)
  if (!brands.length || !rot.active) return []
  const days = parseInt(String(rot.rotation_days)) || 21
  const sim = Math.max(1, parseInt(String(rot.simultaneous)) || 1)
  const start = new Date(rot.started_at || Date.now())
  const elapsed = Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000))
  const period = Math.floor(elapsed / days)
  const n = brands.length
  const idx = (period * sim) % n
  return Array.from({ length: Math.min(sim, n) }, (_, i) => brands[(idx + i) % n])
}
// Jours restants avant la prochaine bascule
function daysLeft(rot: Rotation): number {
  const days = parseInt(String(rot.rotation_days)) || 21
  const start = new Date(rot.started_at || Date.now())
  const elapsed = Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000))
  return days - (elapsed % days)
}

export default function BacklinksPage() {
  const [rotations, setRotations] = useState<Rotation[]>([])
  const [sites, setSites] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  useEffect(() => {
    (async () => {
      try {
        const [rotRes, sitesRes] = await Promise.all([
          fetch(`/api/github?path=${encodeURIComponent(PATH)}&nocache=1`).then(r => r.json()).catch(() => ({})),
          fetch('/api/sites').then(r => r.json()).catch(() => ({ sites: [] })),
        ])
        if (rotRes.content) {
          try { setRotations((JSON.parse(rotRes.content).rotations || []).map((r: any) => ({ id: r.id || uid(), events: [], ...r }))) } catch {}
        }
        setSites((sitesRes.sites || []).map((s: any) => s.id || s).filter(Boolean))
      } catch (e: any) { flash('✗ ' + (e.message || 'Erreur chargement')) }
      setLoading(false)
    })()
  }, [])

  async function save() {
    setSaving(true)
    try {
      const body = JSON.stringify({ rotations }, null, 2)
      const r = await fetch('/api/github', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: PATH, content: body, message: 'HUB: backlink rotations' }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || d.error) throw new Error(d.error || 'HTTP ' + r.status)
      flash('✓ Enregistré sur GitHub')
    } catch (e: any) { flash('✗ ' + (e.message || 'Erreur sauvegarde')) }
    setSaving(false)
  }

  function addRotation() {
    const r: Rotation = { id: uid(), site: sites[0] || '', comparatif_slug: '', brands: [{ name: '', url: '' }], rotation_days: 21, simultaneous: 1, started_at: new Date().toISOString().slice(0, 10), active: true, anchor: '', events: [] }
    setRotations(x => [...x, r]); setExpanded(e => ({ ...e, [r.id]: true }))
  }
  function patch(id: string, p: Partial<Rotation>) { setRotations(x => x.map(r => r.id === id ? { ...r, ...p } : r)) }
  function delRotation(id: string) { if (confirm('Supprimer cette rotation ?')) setRotations(x => x.filter(r => r.id !== id)) }
  function setBrand(id: string, i: number, b: Partial<Brand>) {
    setRotations(x => x.map(r => r.id === id ? { ...r, brands: r.brands.map((br, j) => j === i ? { ...br, ...b } : br) } : r))
  }
  function addBrand(id: string) { setRotations(x => x.map(r => r.id === id ? { ...r, brands: [...r.brands, { name: '', url: '' }] } : r)) }
  function delBrand(id: string, i: number) { setRotations(x => x.map(r => r.id === id ? { ...r, brands: r.brands.filter((_, j) => j !== i) } : r)) }
  function addEvent(id: string) {
    setRotations(x => x.map(r => r.id === id ? { ...r, events: [...(r.events || []), { link_brand: activeBrands(r)[0]?.name || '', contact_brand: '', date: new Date().toISOString().slice(0, 10), amount: 0, notes: '' }] } : r))
  }
  function setEvent(id: string, i: number, e: Partial<Event>) {
    setRotations(x => x.map(r => r.id === id ? { ...r, events: (r.events || []).map((ev, j) => j === i ? { ...ev, ...e } : ev) } : r))
  }
  function delEvent(id: string, i: number) {
    setRotations(x => x.map(r => r.id === id ? { ...r, events: (r.events || []).filter((_, j) => j !== i) } : r))
  }

  // ── Matrice déclencheurs : lien posé (link_brand) → marque qui a contacté ──
  const matrix = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    let total = 0, revenue = 0
    for (const r of rotations) for (const ev of (r.events || [])) {
      if (!ev.link_brand || !ev.contact_brand) continue
      m[ev.link_brand] = m[ev.link_brand] || {}
      m[ev.link_brand][ev.contact_brand] = (m[ev.link_brand][ev.contact_brand] || 0) + 1
      total++; revenue += Number(ev.amount) || 0
    }
    return { m, total, revenue }
  }, [rotations])

  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }
  const inp: React.CSSProperties = { padding: '8px 11px', borderRadius: 8, background: C.input, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }

  if (loading) return <div style={{ color: C.dim, padding: 24 }}>Chargement…</div>

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 4px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, color: C.text, margin: 0 }}>🔗 Rotations de backlinks</h1>
        <button onClick={save} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: C.accent, color: '#04121C', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{saving ? 'Sauvegarde…' : '💾 Enregistrer'}</button>
      </div>
      <div style={{ fontSize: 13, color: C.faint, marginBottom: 18 }}>Lien dofollow tournant en bas des comparatifs pour provoquer des demandes entrantes. Le build hebdomadaire applique la rotation.</div>
      {msg && <div style={{ marginBottom: 14, fontSize: 13, color: msg.startsWith('✓') ? C.accent : '#FC8181' }}>{msg}</div>}

      {/* Matrice déclencheurs */}
      <div style={{ ...card, marginBottom: 18 }}>
        <div style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 2 }}>Matrice déclencheurs</div>
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 14 }}>Qui réagit quand un concurrent reçoit le lien. {matrix.total} contact(s) · {euro(matrix.revenue)} générés.</div>
        {Object.keys(matrix.m).length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.faint }}>Aucun contact enregistré. Logue les demandes entrantes dans chaque rotation ci-dessous.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(matrix.m).sort((a, b) => Object.values(b[1]).reduce((s, n) => s + n, 0) - Object.values(a[1]).reduce((s, n) => s + n, 0)).map(([trigger, reactions]) => (
              <div key={trigger} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
                <span style={{ color: C.accent, fontWeight: 700 }}>{trigger}</span>
                <span style={{ color: C.faint }}>→</span>
                {Object.entries(reactions).sort((a, b) => b[1] - a[1]).map(([react, n]) => (
                  <span key={react} style={{ padding: '3px 10px', borderRadius: 14, background: C.input, border: `1px solid ${C.border}`, color: C.text }}>{react} <span style={{ color: C.faint }}>×{n}</span></span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rotations */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 15, color: C.text, fontWeight: 600 }}>Rotations ({rotations.length})</div>
        <button onClick={addRotation} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.accent}`, background: 'transparent', color: C.accent, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>+ Nouvelle rotation</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rotations.length === 0 && <div style={{ ...card, color: C.faint, fontSize: 13 }}>Aucune rotation. Clique « + Nouvelle rotation ».</div>}
        {rotations.map(r => {
          const act = activeBrands(r)
          const open = expanded[r.id]
          return (
            <div key={r.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => setExpanded(e => ({ ...e, [r.id]: !open }))}>
                <span style={{ fontSize: 13, color: C.dim }}>{open ? '▼' : '▶'}</span>
                <span style={{ fontSize: 13.5, color: C.text, fontWeight: 600 }}>{r.site || '(site ?)'} <span style={{ color: C.faint, fontWeight: 400 }}>/ {r.comparatif_slug || '(slug ?)'}</span></span>
                {act.length > 0
                  ? <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 14, background: 'rgba(0,212,170,.15)', color: C.accent, fontWeight: 600 }}>🔗 {act.map(b => b.name).join(' + ')} · {daysLeft(r)}j restants</span>
                  : <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 14, background: C.input, color: C.faint }}>{r.active ? 'aucune marque' : 'inactive'}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: C.faint }}>{r.brands.filter(b => b.url).length} marque(s) · {(r.events || []).length} contact(s)</span>
              </div>

              {open && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                  {/* Config */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
                    <div><div style={lbl}>Site</div>
                      <select value={r.site} onChange={e => patch(r.id, { site: e.target.value })} style={{ ...inp, width: '100%' }}>
                        <option value="">—</option>{sites.map(s => <option key={s} value={s}>{s}</option>)}
                      </select></div>
                    <div><div style={lbl}>Comparatif (slug)</div><input value={r.comparatif_slug} onChange={e => patch(r.id, { comparatif_slug: e.target.value })} placeholder="logiciel-de-comptabilite" style={{ ...inp, width: '100%' }} /></div>
                    <div><div style={lbl}>Rotation (jours)</div><input type="number" value={r.rotation_days} onChange={e => patch(r.id, { rotation_days: parseInt(e.target.value) || 21 })} style={{ ...inp, width: '100%' }} /></div>
                    <div><div style={lbl}>Marques en //</div><input type="number" min={1} max={2} value={r.simultaneous} onChange={e => patch(r.id, { simultaneous: Math.max(1, parseInt(e.target.value) || 1) })} style={{ ...inp, width: '100%' }} /></div>
                    <div><div style={lbl}>Démarrage</div><input type="date" value={r.started_at} onChange={e => patch(r.id, { started_at: e.target.value })} style={{ ...inp, width: '100%' }} /></div>
                    <div><div style={lbl}>Ancre (optionnel)</div><input value={r.anchor || ''} onChange={e => patch(r.id, { anchor: e.target.value })} placeholder="texte du lien" style={{ ...inp, width: '100%' }} /></div>
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.dim, marginBottom: 14, cursor: 'pointer' }}>
                    <input type="checkbox" checked={r.active} onChange={e => patch(r.id, { active: e.target.checked })} style={{ width: 15, height: 15, accentColor: C.accent }} /> Rotation active
                  </label>

                  {/* Marques */}
                  <div style={lbl}>Marques (ordre = ordre de rotation)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, margin: '6px 0 14px' }}>
                    {r.brands.map((b, i) => (
                      <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: act.some(a => a.name === b.name && b.name) ? C.accent : C.faint, width: 18 }}>{i + 1}</span>
                        <input value={b.name} onChange={e => setBrand(r.id, i, { name: e.target.value })} placeholder="Marque" style={{ ...inp, flex: 1 }} />
                        <input value={b.url} onChange={e => setBrand(r.id, i, { url: e.target.value })} placeholder="https://…" style={{ ...inp, flex: 2 }} />
                        <span onClick={() => delBrand(r.id, i)} style={{ cursor: 'pointer', color: C.faint, padding: '0 4px' }}>✕</span>
                      </div>
                    ))}
                    <button onClick={() => addBrand(r.id)} style={{ alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.dim, fontSize: 12, cursor: 'pointer' }}>+ Marque</button>
                  </div>

                  {/* Suivi des demandes entrantes */}
                  <div style={lbl}>Demandes entrantes (suivi)</div>
                  <div style={{ overflowX: 'auto', margin: '6px 0 10px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                      <thead><tr>{['Lien posé (déclencheur)', 'Marque qui a contacté', 'Date', 'Montant €', 'Note', ''].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {(r.events || []).length === 0 && <tr><td colSpan={6} style={{ ...td, color: C.faint, textAlign: 'center' }}>Aucune demande. Ajoute-en une quand une marque te contacte.</td></tr>}
                        {(r.events || []).map((ev, i) => (
                          <tr key={i}>
                            <td style={td}><input value={ev.link_brand} onChange={e => setEvent(r.id, i, { link_brand: e.target.value })} list={`br-${r.id}`} style={{ ...inp, width: '100%' }} /></td>
                            <td style={td}><input value={ev.contact_brand} onChange={e => setEvent(r.id, i, { contact_brand: e.target.value })} list={`br-${r.id}`} style={{ ...inp, width: '100%' }} /></td>
                            <td style={td}><input type="date" value={ev.date} onChange={e => setEvent(r.id, i, { date: e.target.value })} style={{ ...inp, width: '100%' }} /></td>
                            <td style={td}><input type="number" value={ev.amount || ''} onChange={e => setEvent(r.id, i, { amount: parseFloat(e.target.value) || 0 })} style={{ ...inp, width: '100%', textAlign: 'right' }} /></td>
                            <td style={td}><input value={ev.notes || ''} onChange={e => setEvent(r.id, i, { notes: e.target.value })} style={{ ...inp, width: '100%' }} /></td>
                            <td style={{ ...td, textAlign: 'center' }}><span onClick={() => delEvent(r.id, i)} style={{ cursor: 'pointer', color: C.faint }}>🗑</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <datalist id={`br-${r.id}`}>{r.brands.filter(b => b.name).map(b => <option key={b.name} value={b.name} />)}</datalist>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button onClick={() => addEvent(r.id)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.dim, fontSize: 12, cursor: 'pointer' }}>+ Demande entrante</button>
                    <button onClick={() => delRotation(r.id)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #FC8181', background: 'transparent', color: '#FC8181', fontSize: 12, cursor: 'pointer' }}>🗑 Supprimer la rotation</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }
const th: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #1E2D3D', fontSize: 11, color: '#4A5568', fontWeight: 600 }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #1E2D3D', fontSize: 13, color: '#fff' }
