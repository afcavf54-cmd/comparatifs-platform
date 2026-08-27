'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const C = {
  bg: '#0A0E1A', card: '#0D1117', border: '#1E2D3D', accent: '#00D4AA',
  text: '#fff', dim: '#8B9CB0', faint: '#4A5568', input: '#0A0E1A',
}
type Revenue = { id: string; category: string; brand: string; amount: number; month: string; note?: string }
type Brand = { id: string; name: string }

const CATS: { key: string; label: string; color: string }[] = [
  { key: 'adsense', label: 'AdSense', color: '#4C9AFF' },
  { key: 'affiliation', label: 'Affiliation', color: '#00D4AA' },
  { key: 'sponsoring', label: 'Sponsoring', color: '#F5820A' },
]
const catOf = (k: string) => CATS.find(c => c.key === k)
const euro = (n: number) => (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €'
const MONTHS_FR = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc']
const fmtMonth = (m: string) => { const [y, mo] = m.split('-'); return `${MONTHS_FR[parseInt(mo, 10) - 1]} ${y.slice(2)}` }
const thisMonth = () => new Date().toISOString().slice(0, 7)

export default function RevenuesPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const base = `/api/sites/${siteId}/revenues`

  const [revenues, setRevenues] = useState<Revenue[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // formulaire d'ajout
  const [category, setCategory] = useState('adsense')
  const [brand, setBrand] = useState('')
  const [amount, setAmount] = useState('')
  const [month, setMonth] = useState(thisMonth())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [newBrand, setNewBrand] = useState('')

  // édition d'une ligne
  const [editId, setEditId] = useState<string | null>(null)
  const [ed, setEd] = useState({ category: 'adsense', brand: '', amount: '', month: '', note: '' })

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3500) }

  async function load() {
    setLoading(true)
    try {
      const d = await fetch(base).then(r => r.json())
      if (d.error) throw new Error(d.error)
      setRevenues(d.revenues || [])
      setBrands(d.brands || [])
    } catch (e: any) { flash('✗ ' + (e.message || 'Erreur chargement')) }
    setLoading(false)
  }
  useEffect(() => { load() }, [siteId])

  async function addRevenue() {
    if (!amount || isNaN(Number(amount))) return flash('✗ Montant invalide')
    setSaving(true)
    try {
      const d = await fetch(base, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, brand: category === 'affiliation' ? brand : '', amount: Number(amount), month, note }),
      }).then(r => r.json())
      if (d.error) throw new Error(d.error)
      flash('✓ Revenu ajouté'); setAmount(''); setNote('')
      load()
    } catch (e: any) { flash('✗ ' + (e.message || 'Erreur')) }
    setSaving(false)
  }
  async function delRevenue(id: string) {
    if (!confirm('Supprimer ce revenu ?')) return
    await fetch(`${base}?id=${id}`, { method: 'DELETE' })
    load()
  }
  function startEdit(r: Revenue) {
    setEditId(r.id)
    setEd({ category: r.category, brand: r.brand || '', amount: String(r.amount), month: r.month, note: r.note || '' })
  }
  async function saveEdit() {
    if (!editId) return
    if (!ed.amount || isNaN(Number(ed.amount))) return flash('✗ Montant invalide')
    try {
      const d = await fetch(base, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, category: ed.category, brand: ed.category === 'affiliation' ? ed.brand : '', amount: Number(ed.amount), month: ed.month, note: ed.note }),
      }).then(r => r.json())
      if (d.error) throw new Error(d.error)
      flash('✓ Revenu modifié'); setEditId(null); load()
    } catch (e: any) { flash('✗ ' + (e.message || 'Erreur')) }
  }
  async function addBrand() {
    const name = newBrand.trim()
    if (!name) return
    const d = await fetch(`${base}/brands`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then(r => r.json())
    if (d.error) return flash('✗ ' + d.error)
    setNewBrand(''); load()
  }
  async function delBrand(id: string) {
    await fetch(`${base}/brands?id=${id}`, { method: 'DELETE' })
    load()
  }

  // ── Statistiques ───────────────────────────────────────────────────────
  const global = revenues.reduce((s, r) => s + (r.amount || 0), 0)
  const cur = thisMonth()
  const curTotal = revenues.filter(r => r.month === cur).reduce((s, r) => s + r.amount, 0)

  const byMonth: Record<string, number> = {}
  const byMonthCat: Record<string, Record<string, number>> = {}
  for (const r of revenues) {
    byMonth[r.month] = (byMonth[r.month] || 0) + r.amount
    byMonthCat[r.month] = byMonthCat[r.month] || {}
    byMonthCat[r.month][r.category] = (byMonthCat[r.month][r.category] || 0) + r.amount
  }
  const months = Object.keys(byMonth).sort()
  // Moyenne mensuelle sur les 12 derniers mois (glissants depuis maintenant)
  const last12: string[] = []
  { const d = new Date(); for (let i = 0; i < 12; i++) { last12.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() - 1) } }
  const sum12 = last12.reduce((s, m) => s + (byMonth[m] || 0), 0)
  const avg12 = sum12 / 12

  const byCat: Record<string, number> = {}
  for (const r of revenues) byCat[r.category] = (byCat[r.category] || 0) + r.amount

  const byBrand: Record<string, number> = {}
  for (const r of revenues) if (r.category === 'affiliation' && r.brand) byBrand[r.brand] = (byBrand[r.brand] || 0) + r.amount
  const topBrands = Object.entries(byBrand).sort((a, b) => b[1] - a[1])

  // ── Géométrie du graphique (lignes par catégorie) ────────────────────────
  const CW = 820, CH = 320, ML = 58, MR = 16, MT = 18, MB = 42
  const plotW = CW - ML - MR, plotH = CH - MT - MB
  const maxM = Math.max(1, ...months.map(m => byMonth[m] || 0))
  const xAt = (i: number) => months.length <= 1 ? ML + plotW / 2 : ML + (i / (months.length - 1)) * plotW
  const yAt = (v: number) => MT + plotH * (1 - v / maxM)

  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }
  const inp: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, background: C.input, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }
  const td: React.CSSProperties = { padding: '10px 12px', borderBottom: `1px solid ${C.border}`, fontSize: 13, color: C.text }

  if (loading) return <div style={{ color: C.dim, padding: 20 }}>Chargement…</div>

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 4px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <Link href={`/sites/${siteId}`} style={{ color: C.dim, textDecoration: 'none', fontSize: 13 }}>← {siteId}</Link>
      </div>
      <h1 style={{ fontSize: 22, color: C.text, margin: '0 0 4px' }}>💶 Chiffre d'affaires</h1>
      <div style={{ fontSize: 13, color: C.faint, marginBottom: 20 }}>Suivi des revenus AdSense, affiliation et sponsoring.</div>
      {msg && <div style={{ marginBottom: 14, fontSize: 13, color: msg.startsWith('✓') ? C.accent : '#FC8181' }}>{msg}</div>}

      {/* Cartes résumé */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ fontSize: 12, color: C.faint, marginBottom: 6 }}>Revenu global</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: C.accent }}>{euro(global)}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, color: C.faint, marginBottom: 6 }}>Ce mois-ci ({fmtMonth(cur)})</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: C.text }}>{euro(curTotal)}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, color: C.faint, marginBottom: 6 }}>Moyenne / mois (12 mois)</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: C.text }}>{euro(avg12)}</div>
        </div>
      </div>

      {/* Répartition par catégorie */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
        {CATS.map(c => (
          <div key={c.key} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, display: 'inline-block' }} />
              <span style={{ fontSize: 12, color: C.faint }}>{c.label}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{euro(byCat[c.key] || 0)}</div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>{global > 0 ? Math.round((byCat[c.key] || 0) / global * 100) : 0}% du total</div>
          </div>
        ))}
      </div>

      {/* Graphique évolution */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 4 }}>Évolution mensuelle</div>
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 16 }}>Revenu total par mois, et par catégorie.</div>
        {months.length === 0 ? (
          <div style={{ fontSize: 13, color: C.faint, padding: 20, textAlign: 'center' }}>Aucun revenu enregistré.</div>
        ) : (
          <>
            <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
              {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
                const y = MT + plotH * f
                return (
                  <g key={i}>
                    <line x1={ML} y1={y} x2={CW - MR} y2={y} stroke={C.border} strokeWidth={1} />
                    <text x={ML - 8} y={y + 4} textAnchor="end" fontSize={11} fill={C.faint}>{Math.round(maxM * (1 - f))}€</text>
                  </g>
                )
              })}
              {months.map((m, i) => (
                <text key={m} x={xAt(i)} y={CH - MB + 20} textAnchor="middle" fontSize={11} fill={C.dim}>{fmtMonth(m)}</text>
              ))}
              {/* total (épais) */}
              <polyline points={months.map((m, i) => `${xAt(i)},${yAt(byMonth[m] || 0)}`).join(' ')} fill="none" stroke="#B78AF7" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
              {months.map((m, i) => <circle key={m} cx={xAt(i)} cy={yAt(byMonth[m] || 0)} r={3.5} fill="#B78AF7" />)}
              {/* par catégorie */}
              {CATS.map(c => (
                <polyline key={c.key} points={months.map((m, i) => `${xAt(i)},${yAt((byMonthCat[m] || {})[c.key] || 0)}`).join(' ')} fill="none" stroke={c.color} strokeWidth={1.8} strokeDasharray="4 3" strokeLinejoin="round" />
              ))}
            </svg>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.dim }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: '#B78AF7', display: 'inline-block' }} /> Total
              </div>
              {CATS.map(c => (
                <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.dim }}>
                  <span style={{ width: 14, height: 0, borderTop: `2px dashed ${c.color}`, display: 'inline-block' }} /> {c.label}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Ajout d'un revenu + gestion des marques */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 14 }}>Ajouter un revenu</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inp, flex: 1 }}>
                {CATS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ ...inp, flex: 1 }} />
            </div>
            {category === 'affiliation' && (
              <select value={brand} onChange={e => setBrand(e.target.value)} style={inp}>
                <option value="">— Marque affiliée (optionnel) —</option>
                {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Montant €" style={{ ...inp, flex: 1 }} />
            </div>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optionnel)" style={inp} />
            <button onClick={addRevenue} disabled={saving} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: C.accent, color: '#04121C', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {saving ? 'Ajout…' : '+ Ajouter'}
            </button>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 14 }}>Marques affiliées</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <input value={newBrand} onChange={e => setNewBrand(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addBrand() }} placeholder="Nom de la marque" style={{ ...inp, flex: 1 }} />
            <button onClick={addBrand} style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${C.accent}`, background: 'transparent', color: C.accent, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>+ Ajouter</button>
          </div>
          {brands.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.faint }}>Aucune marque. Ajoute tes partenaires d'affiliation.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {brands.map(b => (
                <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 10px', borderRadius: 20, background: C.input, border: `1px solid ${C.border}`, fontSize: 12.5, color: C.text }}>
                  {b.name}
                  {byBrand[b.name] ? <span style={{ color: C.faint }}>· {euro(byBrand[b.name])}</span> : null}
                  <span onClick={() => delBrand(b.id)} title="Supprimer" style={{ cursor: 'pointer', color: C.faint }}>✕</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tableau des revenus */}
      <div style={card}>
        <div style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 14 }}>Détail des revenus</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Mois', 'Catégorie', 'Marque', 'Montant', 'Note', ''].map((h, i) => (
                  <th key={i} style={{ ...td, color: C.faint, fontWeight: 600, textAlign: i === 3 ? 'right' : 'left', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {revenues.length === 0 && <tr><td colSpan={6} style={{ ...td, color: C.faint, textAlign: 'center', padding: 20 }}>Aucun revenu enregistré.</td></tr>}
              {revenues.map(r => {
                const c = catOf(r.category)
                if (editId === r.id) {
                  const edInp: React.CSSProperties = { ...inp, padding: '6px 8px', fontSize: 12.5, width: '100%' }
                  return (
                    <tr key={r.id} style={{ background: 'rgba(0,212,170,.05)' }}>
                      <td style={td}><input type="month" value={ed.month} onChange={e => setEd({ ...ed, month: e.target.value })} style={edInp} /></td>
                      <td style={td}>
                        <select value={ed.category} onChange={e => setEd({ ...ed, category: e.target.value })} style={edInp}>
                          {CATS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                        </select>
                      </td>
                      <td style={td}>
                        {ed.category === 'affiliation'
                          ? <select value={ed.brand} onChange={e => setEd({ ...ed, brand: e.target.value })} style={edInp}>
                              <option value="">—</option>
                              {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                            </select>
                          : <span style={{ color: C.faint }}>—</span>}
                      </td>
                      <td style={td}><input type="number" step="0.01" min="0" value={ed.amount} onChange={e => setEd({ ...ed, amount: e.target.value })} style={{ ...edInp, textAlign: 'right' }} /></td>
                      <td style={td}><input value={ed.note} onChange={e => setEd({ ...ed, note: e.target.value })} style={edInp} /></td>
                      <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span onClick={saveEdit} title="Enregistrer" style={{ cursor: 'pointer', color: C.accent, marginRight: 10 }}>✓</span>
                        <span onClick={() => setEditId(null)} title="Annuler" style={{ cursor: 'pointer', color: C.faint }}>✕</span>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, color: C.dim, whiteSpace: 'nowrap' }}>{fmtMonth(r.month)}</td>
                    <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: c?.color || C.faint, display: 'inline-block' }} />{c?.label || r.category}</span></td>
                    <td style={{ ...td, color: C.dim }}>{r.brand || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', color: C.accent, fontWeight: 600, whiteSpace: 'nowrap' }}>{euro(r.amount)}</td>
                    <td style={{ ...td, color: C.dim }}>{r.note}</td>
                    <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <span onClick={() => startEdit(r)} title="Modifier" style={{ cursor: 'pointer', color: C.faint, marginRight: 10 }}>✏️</span>
                      <span onClick={() => delRevenue(r.id)} title="Supprimer" style={{ cursor: 'pointer', color: C.faint }}>🗑</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
