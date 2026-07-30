'use client'
import { useEffect, useState, useMemo } from 'react'

type Site = { id: string; name: string; domain?: string }
type Sale = { id: string; site: string; platform: string; price_ht: number; date: string; note?: string }

const C = {
  bg: '#0A0E1A', card: '#0D1117', border: '#1E2D3D', accent: '#00D4AA',
  text: '#fff', dim: '#8B9CB0', faint: '#4A5568', input: '#0A0E1A',
}
const euro = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €'
const uid = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8)

export default function LinkSalesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [platforms, setPlatforms] = useState<string[]>([])
  const [removedSites, setRemovedSites] = useState<string[]>([])
  const [registrations, setRegistrations] = useState<Record<string, Record<string, boolean>>>({})
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [saving, setSaving] = useState(false)

  // Nouvelle plateforme
  const [newPlatform, setNewPlatform] = useState('')
  // Nouvelle vente
  const [saleSite, setSaleSite] = useState('')
  const [salePlatform, setSalePlatform] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10))
  const [saleNote, setSaleNote] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/sites').then(r => r.json()).catch(() => ({ sites: [] })),
      fetch('/api/link-sales').then(r => r.json()).catch(() => ({})),
    ]).then(([sitesData, ls]) => {
      setSites((sitesData.sites || []).map((s: any) => ({ id: s.id, name: s.name, domain: s.domain })))
      setPlatforms(ls.platforms || [])
      setRemovedSites(ls.removed_sites || [])
      setRegistrations(ls.registrations || {})
      setSales(ls.sales || [])
      setLoading(false)
    })
  }, [])

  const activeSites = useMemo(() => sites.filter(s => !removedSites.includes(s.id)), [sites, removedSites])
  const removed = useMemo(() => sites.filter(s => removedSites.includes(s.id)), [sites, removedSites])
  const siteName = (id: string) => sites.find(s => s.id === id)?.name || id

  // ── Totaux CA ─────────────────────────────────────────────────────────────
  const caBySite: Record<string, number> = {}
  const caByPlatform: Record<string, number> = {}
  const caMatrix: Record<string, Record<string, number>> = {}
  let caTotal = 0
  for (const s of sales) {
    caBySite[s.site] = (caBySite[s.site] || 0) + s.price_ht
    caByPlatform[s.platform] = (caByPlatform[s.platform] || 0) + s.price_ht
    caMatrix[s.site] = caMatrix[s.site] || {}
    caMatrix[s.site][s.platform] = (caMatrix[s.site][s.platform] || 0) + s.price_ht
    caTotal += s.price_ht
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  const mark = () => setDirty(true)
  const addPlatform = () => {
    const p = newPlatform.trim()
    if (!p || platforms.includes(p)) { setNewPlatform(''); return }
    setPlatforms([...platforms, p]); setNewPlatform(''); mark()
  }
  const removePlatform = (p: string) => {
    if (!confirm(`Retirer la colonne « ${p} » ? (les ventes déjà enregistrées restent comptées dans le CA)`)) return
    setPlatforms(platforms.filter(x => x !== p)); mark()
  }
  const toggleReg = (siteId: string, p: string) => {
    setRegistrations(prev => ({ ...prev, [siteId]: { ...(prev[siteId] || {}), [p]: !(prev[siteId]?.[p]) } })); mark()
  }
  const removeSite = (id: string) => { setRemovedSites([...removedSites, id]); mark() }
  const restoreSite = (id: string) => { setRemovedSites(removedSites.filter(x => x !== id)); mark() }

  const addSale = () => {
    if (!saleSite || !salePlatform || !salePrice) { alert('Site, plateforme et prix HT sont requis.'); return }
    const price = parseFloat(salePrice.replace(',', '.'))
    if (isNaN(price)) { alert('Prix HT invalide.'); return }
    setSales([{ id: uid(), site: saleSite, platform: salePlatform, price_ht: price, date: saleDate, note: saleNote.trim() }, ...sales])
    setSalePrice(''); setSaleNote(''); mark()
  }
  const deleteSale = (id: string) => { setSales(sales.filter(s => s.id !== id)); mark() }

  async function save() {
    setSaving(true); setSaveMsg('')
    const r = await fetch('/api/link-sales', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platforms, removed_sites: removedSites, registrations, sales }),
    })
    const d = await r.json()
    setSaving(false)
    if (d.ok) { setDirty(false); setSaveMsg('✓ Enregistré') } else { setSaveMsg('✗ ' + (d.error || 'Erreur')) }
    setTimeout(() => setSaveMsg(''), 3500)
  }

  if (loading) return <div style={{ color: C.dim }}>Chargement…</div>

  const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, color: C.dim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}` }
  const inputStyle: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, background: C.input, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, color: C.text, margin: 0 }}>🔗 Vente de liens</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('✓') ? C.accent : '#FC8181' }}>{saveMsg}</span>}
          {dirty && !saveMsg && <span style={{ fontSize: 12, color: '#F6AD55' }}>Modifications non enregistrées</span>}
          <button onClick={save} disabled={saving || !dirty}
            style={{ padding: '9px 20px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 13,
              background: (saving || !dirty) ? C.border : 'linear-gradient(135deg, #00D4AA, #0090FF)',
              color: (saving || !dirty) ? C.faint : '#fff', cursor: (saving || !dirty) ? 'not-allowed' : 'pointer' }}>
            {saving ? '⏳…' : '💾 Enregistrer'}
          </button>
        </div>
      </div>
      <p style={{ fontSize: 13, color: C.faint, marginTop: 0, marginBottom: 24, lineHeight: 1.5 }}>
        Suivi de tes inscriptions sur les plateformes de vente de liens et du chiffre d'affaires par site et par plateforme.
      </p>

      {/* ── Matrice inscriptions ─────────────────────────────────────────── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 4 }}>Inscriptions par plateforme</div>
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 16 }}>Coche une case quand le site est inscrit sur la plateforme. Ajoute tes plateformes manuellement.</div>

        {/* Ajout plateforme */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input value={newPlatform} onChange={e => setNewPlatform(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPlatform()}
            placeholder="Nom d'une plateforme (ex: Linkavista, Rocketlink…)" style={{ ...inputStyle, flex: 1, maxWidth: 340 }} />
          <button onClick={addPlatform} style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${C.accent}`, background: 'transparent', color: C.accent, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>+ Ajouter une colonne</button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, position: 'sticky', left: 0, background: C.card }}>Site</th>
                {platforms.map(p => (
                  <th key={p} style={{ ...th, textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      {p}
                      <span onClick={() => removePlatform(p)} title="Retirer la colonne" style={{ cursor: 'pointer', color: C.faint, fontSize: 13 }}>✕</span>
                    </div>
                  </th>
                ))}
                {platforms.length === 0 && <th style={{ ...th, color: C.faint, fontStyle: 'italic' }}>Ajoute une plateforme →</th>}
                <th style={{ ...th, textAlign: 'center' }}>CA site</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {activeSites.map(s => (
                <tr key={s.id}>
                  <td style={{ ...td, position: 'sticky', left: 0, background: C.card, fontWeight: 500 }}>{s.name}</td>
                  {platforms.map(p => (
                    <td key={p} style={{ ...td, textAlign: 'center' }}>
                      <input type="checkbox" checked={!!registrations[s.id]?.[p]} onChange={() => toggleReg(s.id, p)}
                        style={{ width: 17, height: 17, accentColor: C.accent, cursor: 'pointer' }} />
                    </td>
                  ))}
                  {platforms.length === 0 && <td style={td}></td>}
                  <td style={{ ...td, textAlign: 'center', color: caBySite[s.id] ? C.accent : C.faint, fontWeight: 600 }}>{euro(caBySite[s.id] || 0)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span onClick={() => removeSite(s.id)} title="Retirer ce site du tableau" style={{ cursor: 'pointer', color: C.faint, fontSize: 14 }}>🗑</span>
                  </td>
                </tr>
              ))}
              {activeSites.length === 0 && (
                <tr><td colSpan={platforms.length + 3} style={{ ...td, color: C.faint, textAlign: 'center', padding: 20 }}>Aucun site dans le tableau.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Sites retirés */}
        {removed.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sites retirés (sans vente de liens)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {removed.map(s => (
                <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 20, background: C.input, border: `1px solid ${C.border}`, fontSize: 12, color: C.dim }}>
                  {s.name}
                  <span onClick={() => restoreSite(s.id)} title="Remettre dans le tableau" style={{ cursor: 'pointer', color: C.accent }}>↩ remettre</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Suivi CA ─────────────────────────────────────────────────────── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 4 }}>Enregistrer une vente</div>
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 16 }}>Indique chaque vente de lien avec son prix HT.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={saleSite} onChange={e => setSaleSite(e.target.value)} style={{ ...inputStyle, minWidth: 180 }}>
            <option value="">Site…</option>
            {activeSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={salePlatform} onChange={e => setSalePlatform(e.target.value)} style={{ ...inputStyle, minWidth: 150 }}>
            <option value="">Plateforme…</option>
            {platforms.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input value={salePrice} onChange={e => setSalePrice(e.target.value)} placeholder="Prix HT" inputMode="decimal" style={{ ...inputStyle, width: 110 }} />
          <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} style={{ ...inputStyle, width: 150 }} />
          <input value={saleNote} onChange={e => setSaleNote(e.target.value)} placeholder="Note (optionnel)" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
          <button onClick={addSale} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>+ Ajouter</button>
        </div>
      </div>

      {/* Récap CA */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(0,212,170,0.12), rgba(0,144,255,0.08))', border: `1px solid ${C.accent}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em' }}>CA total (HT)</div>
          <div style={{ fontSize: 24, color: C.text, fontWeight: 700, marginTop: 4 }}>{euro(caTotal)}</div>
        </div>
        {platforms.map(p => (
          <div key={p} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p}</div>
            <div style={{ fontSize: 20, color: C.text, fontWeight: 700, marginTop: 4 }}>{euro(caByPlatform[p] || 0)}</div>
          </div>
        ))}
      </div>

      {/* Historique des ventes */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 16 }}>Ventes enregistrées ({sales.length})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Date</th><th style={th}>Site</th><th style={th}>Plateforme</th>
                <th style={{ ...th, textAlign: 'right' }}>Prix HT</th><th style={th}>Note</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 && <tr><td colSpan={6} style={{ ...td, color: C.faint, textAlign: 'center', padding: 20 }}>Aucune vente enregistrée.</td></tr>}
              {sales.map(s => (
                <tr key={s.id}>
                  <td style={{ ...td, color: C.dim, whiteSpace: 'nowrap' }}>{s.date}</td>
                  <td style={td}>{siteName(s.site)}</td>
                  <td style={td}>{s.platform}</td>
                  <td style={{ ...td, textAlign: 'right', color: C.accent, fontWeight: 600, whiteSpace: 'nowrap' }}>{euro(s.price_ht)}</td>
                  <td style={{ ...td, color: C.dim }}>{s.note}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span onClick={() => deleteSale(s.id)} title="Supprimer" style={{ cursor: 'pointer', color: C.faint }}>🗑</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
