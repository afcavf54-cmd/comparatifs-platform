'use client'
import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'

type Action = {
  id: string; name: string; ticker: string; logo: string
  country: string; currency: string; price: number; dividend: number; active: boolean
}

const C = {
  bg: '#0A0E1A', card: '#0D1117', border: '#1E2D3D', accent: '#00D4AA',
  gold: '#D4A43C', text: '#fff', dim: '#8B9CB0', faint: '#4A5568', input: '#0A0E1A', danger: '#FC8181',
}
const PER_PAGE = 15
const uid = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
const yieldOf = (a: Action) => a.price > 0 ? (a.dividend / a.price) * 100 : 0

export default function DividendesPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const firstLoad = useRef(true)

  useEffect(() => {
    fetch(`/api/sites/${siteId}/dividendes`).then(r => r.json()).then(d => {
      setActions((d.actions || []).map((a: any) => ({
        id: a.id || uid(), name: a.name || '', ticker: a.ticker || '', logo: a.logo || '',
        country: a.country || '', currency: a.currency || 'EUR',
        price: Number(a.price) || 0, dividend: Number(a.dividend) || 0, active: a.active !== false,
      })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [siteId])

  // Auto-save (debounce)
  useEffect(() => {
    if (loading) return
    if (firstLoad.current) { firstLoad.current = false; return }
    const t = setTimeout(save, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions])

  async function save() {
    setSaving(true); setSaveMsg('')
    try {
      const r = await fetch(`/api/sites/${siteId}/dividendes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions }),
      })
      const d = await r.json()
      setSaveMsg(d.ok ? '✓ Enregistré' : '✗ ' + (d.error || 'Erreur'))
    } catch { setSaveMsg('✗ Erreur réseau') }
    setSaving(false)
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const patch = (id: string, field: keyof Action, value: any) =>
    setActions(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a))
  const addAction = () => {
    setActions(prev => [{ id: uid(), name: '', ticker: '', logo: '', country: '', currency: 'EUR', price: 0, dividend: 0, active: true }, ...prev])
    setPage(1); setQuery('')
  }
  const removeAction = (id: string) => {
    const a = actions.find(x => x.id === id)
    if (a && (a.name || a.price) && !confirm(`Supprimer « ${a.name || 'cette action'} » ?`)) return
    setActions(prev => prev.filter(x => x.id !== id))
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return q ? actions.filter(a => a.name.toLowerCase().includes(q) || a.ticker.toLowerCase().includes(q)) : actions
  }, [actions, query])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const pageItems = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const activeCount = actions.filter(a => a.active).length

  if (loading) return <div style={{ color: C.dim }}>Chargement…</div>

  const th: React.CSSProperties = { padding: '10px 10px', textAlign: 'left', fontSize: 11, color: C.dim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '6px 10px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'middle' }
  const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', borderRadius: 7, background: C.input, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }
  const numInp: React.CSSProperties = { ...inp, textAlign: 'right', fontVariantNumeric: 'tabular-nums' as const }

  return (
    <div style={{ maxWidth: 1180 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, color: C.text, margin: 0 }}>💰 Simulation de dividendes — Actions</h1>
          <p style={{ fontSize: 13, color: C.faint, margin: '4px 0 0' }}>{actions.length} action(s) · {activeCount} active(s). Les inactives n'apparaissent pas dans le simulateur public.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saving && <span style={{ fontSize: 12, color: C.dim }}>💾 Enregistrement…</span>}
          {!saving && saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('✓') ? C.accent : C.danger }}>{saveMsg}</span>}
          {!saving && !saveMsg && <span style={{ fontSize: 12, color: C.faint }}>Enregistrement auto</span>}
          <button onClick={addAction} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#00D4AA,#0090FF)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>+ Ajouter une action</button>
        </div>
      </div>

      {/* Recherche */}
      <div style={{ margin: '18px 0 12px' }}>
        <input value={query} onChange={e => { setQuery(e.target.value); setPage(1) }} placeholder="Rechercher une action (nom ou ticker)…"
          style={{ ...inp, maxWidth: 360, padding: '10px 14px' }} />
      </div>

      {/* Tableau */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr>
                <th style={{ ...th, width: '20%' }}>Nom</th>
                <th style={{ ...th, width: 90 }}>Ticker</th>
                <th style={th}>Pays</th>
                <th style={{ ...th, width: 74 }}>Devise</th>
                <th style={{ ...th, width: 110, textAlign: 'right' }}>Prix</th>
                <th style={{ ...th, width: 120, textAlign: 'right' }}>Dividende / an</th>
                <th style={{ ...th, width: 90, textAlign: 'right' }}>Rendement</th>
                <th style={{ ...th, width: 80, textAlign: 'center' }}>Actif</th>
                <th style={{ ...th, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 && (
                <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: C.faint, padding: 28 }}>{query ? 'Aucune action ne correspond.' : 'Aucune action. Cliquez sur « Ajouter une action ».'}</td></tr>
              )}
              {pageItems.map(a => (
                <tr key={a.id} style={{ opacity: a.active ? 1 : 0.5 }}>
                  <td style={td}><input value={a.name} onChange={e => patch(a.id, 'name', e.target.value)} placeholder="Nom" style={inp} /></td>
                  <td style={td}><input value={a.ticker} onChange={e => patch(a.id, 'ticker', e.target.value)} placeholder="—" style={inp} /></td>
                  <td style={td}><input value={a.country} onChange={e => patch(a.id, 'country', e.target.value)} placeholder="—" style={inp} /></td>
                  <td style={td}>
                    <select value={a.currency} onChange={e => patch(a.id, 'currency', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                      <option value="EUR">€ EUR</option><option value="USD">$ USD</option><option value="GBP">£ GBP</option><option value="CHF">CHF</option>
                    </select>
                  </td>
                  <td style={td}><input type="number" step="0.01" min="0" value={a.price || ''} onChange={e => patch(a.id, 'price', Number(e.target.value))} placeholder="0" style={numInp} /></td>
                  <td style={td}><input type="number" step="0.01" min="0" value={a.dividend || ''} onChange={e => patch(a.id, 'dividend', Number(e.target.value))} placeholder="0" style={numInp} /></td>
                  <td style={{ ...td, textAlign: 'right', color: C.accent, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{yieldOf(a).toFixed(2)} %</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span onClick={() => patch(a.id, 'active', !a.active)} title={a.active ? 'Active — cliquer pour désactiver' : 'Inactive — cliquer pour activer'}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', fontSize: 14, fontWeight: 700, userSelect: 'none',
                        background: a.active ? 'rgba(0,212,170,0.15)' : 'rgba(252,129,129,0.12)', color: a.active ? C.accent : C.danger, border: `1px solid ${a.active ? C.accent : C.danger}` }}>
                      {a.active ? '✓' : '✗'}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span onClick={() => removeAction(a.id)} title="Supprimer" style={{ cursor: 'pointer', color: C.faint }}>🗑</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: page === 1 ? C.faint : C.text, cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 13 }}>← Précédent</button>
          <span style={{ fontSize: 13, color: C.dim }}>Page {page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: page === totalPages ? C.faint : C.text, cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 13 }}>Suivant →</button>
        </div>
      )}

      <p style={{ fontSize: 12, color: C.faint, marginTop: 20, lineHeight: 1.6 }}>
        Le rendement se calcule automatiquement (dividende ÷ prix). Les modifications sont enregistrées seules.
        Seules les actions <strong style={{ color: C.accent }}>actives</strong> sont injectées dans le simulateur public au prochain déploiement du site.
      </p>
    </div>
  )
}
