'use client'
import { useEffect, useMemo, useState } from 'react'

const C = {
  bg: '#0A0E1A', card: '#0D1117', border: '#1E2D3D', accent: '#00D4AA',
  text: '#fff', dim: '#8B9CB0', faint: '#4A5568', input: '#0A0E1A',
}

type Entry = {
  site: string; site_name: string; slug: string; title: string;
  cat_parent: string; date: string; time: string; url: string
}

const fmtDate = (d: string) => {
  if (!d) return 'Date inconnue'
  const dt = new Date(d + 'T00:00:00')
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function JournalPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [sites, setSites] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [site, setSite] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/comparators-journal', { cache: 'no-store' })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status)
        setEntries(d.entries || [])
        setSites(d.sites || [])
      } catch (e: any) { setErr(e.message || 'Erreur chargement') }
      setLoading(false)
    })()
  }, [])

  const filtered = useMemo(() => {
    let list = entries
    if (site) list = list.filter(e => e.site_name === site)
    if (q.trim()) { const s = q.toLowerCase(); list = list.filter(e => e.title.toLowerCase().includes(s) || e.site_name.toLowerCase().includes(s)) }
    return list
  }, [entries, site, q])

  // Regroupement par date (ordre déjà décroissant côté API)
  const groups = useMemo(() => {
    const g: { date: string; items: Entry[] }[] = []
    for (const e of filtered) {
      const last = g[g.length - 1]
      if (last && last.date === e.date) last.items.push(e)
      else g.push({ date: e.date, items: [e] })
    }
    return g
  }, [filtered])

  const stats = useMemo(() => {
    const today = new Date(); const weekAgo = new Date(today.getTime() - 7 * 864e5)
    const dated = entries.filter(e => e.date)
    const thisWeek = dated.filter(e => new Date(e.date + 'T00:00:00') >= weekAgo).length
    const bySite: Record<string, number> = {}
    for (const e of entries) bySite[e.site_name] = (bySite[e.site_name] || 0) + 1
    return { total: entries.length, thisWeek, sites: Object.keys(bySite).length, undated: entries.length - dated.length }
  }, [entries])

  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }
  const inp: React.CSSProperties = { padding: '8px 11px', borderRadius: 8, background: C.input, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }

  if (loading) return <div style={{ color: C.dim, padding: 24 }}>Chargement du journal…</div>

  return (
    <div style={{ maxWidth: 1050, margin: '0 auto', padding: '8px 4px 60px' }}>
      <h1 style={{ fontSize: 22, color: C.text, margin: '0 0 4px' }}>📅 Journal des comparateurs publiés</h1>
      <div style={{ fontSize: 13, color: C.faint, marginBottom: 18 }}>Tous les comparateurs mis en ligne, par date de première publication et par site.</div>
      {err && <div style={{ marginBottom: 14, fontSize: 13, color: '#FC8181' }}>✗ {err}</div>}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { k: 'Total publiés', v: stats.total },
          { k: '7 derniers jours', v: stats.thisWeek },
          { k: 'Sites concernés', v: stats.sites },
          ...(stats.undated ? [{ k: 'Sans date connue', v: stats.undated }] : []),
        ].map(s => (
          <div key={s.k} style={{ ...card, padding: '14px 16px' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.accent }}>{s.v}</div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{s.k}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 Rechercher un comparateur ou un site…" style={{ ...inp, flex: 1, minWidth: 200 }} />
        <select value={site} onChange={e => setSite(e.target.value)} style={{ ...inp, minWidth: 180 }}>
          <option value="">Tous les sites</option>
          {sites.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {groups.length === 0 ? (
        <div style={{ ...card, color: C.faint, fontSize: 13 }}>Aucun comparateur {site || q ? 'pour ce filtre' : 'publié pour l’instant'}.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groups.map((g, gi) => (
            <div key={gi}>
              <div style={{ fontSize: 13, fontWeight: 600, color: g.date ? C.text : C.faint, marginBottom: 8, textTransform: 'capitalize' }}>
                {fmtDate(g.date)} <span style={{ color: C.faint, fontWeight: 400 }}>· {g.items.length}</span>
              </div>
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                {g.items.map((e, i) => (
                  <div key={e.site + e.slug} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: i ? `1px solid ${C.border}` : 'none' }}>
                    <span style={{ fontSize: 12, color: e.time ? C.dim : C.faint, fontVariantNumeric: 'tabular-nums', width: 42, flexShrink: 0 }}>{e.time || '—'}</span>
                    <span style={{ fontSize: 11, color: C.accent, background: 'rgba(0,212,170,0.1)', padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>{e.site_name}</span>
                    <span style={{ flex: 1, fontSize: 13.5, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.title}
                      {e.cat_parent && <span style={{ color: C.faint, fontSize: 12 }}> · {e.cat_parent}</span>}
                    </span>
                    {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.dim, textDecoration: 'none', flexShrink: 0 }}>↗ voir</a>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
