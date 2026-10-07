'use client'
import { useEffect, useMemo, useState } from 'react'

const C = {
  bg: '#0A0E1A', card: '#0D1117', border: '#1E2D3D', accent: '#00D4AA',
  text: '#fff', dim: '#8B9CB0', faint: '#4A5568', input: '#0A0E1A',
}
const PATH = 'platform/backlink-settings.json'
const DISC_PATH = 'platform/backlink-discovered-brands.json'

type Event = { link_brand: string; contact_brand: string; date: string; amount?: number; notes?: string }
type KnownClient = { url: string; note?: string }
type Settings = {
  enabled: boolean; rotation_days: number; simultaneous: number; anchor?: string;
  excluded_sites?: string[]; excluded_comparatifs?: string[];
  brands: Record<string, string>; events?: Event[]; known_clients?: KnownClient[];
}

export default function BacklinksPage() {
  const [s, setS] = useState<Settings>({ enabled: false, rotation_days: 21, simultaneous: 1, anchor: '', brands: {}, events: [], known_clients: [], excluded_sites: [], excluded_comparatifs: [] })
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
        if (setRes.content) { try { setS({ brands: {}, events: [], known_clients: [], ...JSON.parse(setRes.content) }) } catch {} }
        if (discRes.content) { try { const d = JSON.parse(discRes.content); setDiscovered(d && typeof d === 'object' && !Array.isArray(d) ? d : {}) } catch {} }
      } catch (e: any) { flash('✗ ' + (e.message || 'Erreur chargement')) }
      setLoading(false)
    })()
  }, [])

  // ── Nettoyage + normalisation des noms de marques ──
  const cleanBrand = (n: string) => String(n || '')
    .replace(/-(?:logiciels?|outils?)\b.*$/i, '')
    .replace(/-terminaux-de-paiement$/i, '')
    .replace(/-expert-comptable-en-ligne$/i, '')
    .replace(/-banque-pro-en-ligne$/i, '')
    .replace(/^[-\s]+|[-\s]+$/g, '')
  const normBrand = (n: string) => cleanBrand(n)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-._/\s]+/g, ' ').trim().toLowerCase()
  // Préférer le display le plus propre (avec espaces, puis initiale majuscule)
  const pickDisplay = (cur: string, cand: string) => {
    if (cand.includes(' ') && !cur.includes(' ')) return cand
    if (!cur.includes(' ') && cand && cand[0] === cand[0].toUpperCase() && cur[0] !== cur[0].toUpperCase()) return cand
    return cur
  }

  // Carte unifiée : découvertes + référentiel fusionnés par clé normalisée
  // → un nom propre, un compteur de comparateurs, une URL.
  const brandMap = useMemo(() => {
    const m: Record<string, { display: string; count: number; url: string }> = {}
    for (const site of Object.values(discovered)) for (const [b, n] of Object.entries(site || {})) {
      const cb = cleanBrand(b); if (!cb) continue
      const k = normBrand(b)
      if (!m[k]) m[k] = { display: cb, count: 0, url: '' }
      m[k].count += Number(n) || 0
      m[k].display = pickDisplay(m[k].display, cb)
    }
    for (const [b, url] of Object.entries(s.brands || {})) {
      const cb = cleanBrand(b); if (!cb) continue
      const k = normBrand(b)
      if (!m[k]) m[k] = { display: cb, count: 0, url: '' }
      if (url && url.trim()) m[k].url = url.trim()
      m[k].display = pickDisplay(m[k].display, cb)
    }
    return m
  }, [discovered, s.brands])

  const brands = useMemo(() => Object.values(brandMap)
    .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display)), [brandMap])
  const allBrands = useMemo(() => {
    let list = brands
    if (q.trim()) list = list.filter(b => b.display.toLowerCase().includes(q.toLowerCase()))
    if (onlyMissing) list = list.filter(b => !b.url)
    return list
  }, [brands, q, onlyMissing])
  const withUrl = brands.filter(b => b.url).length

  // Éditer l'URL : on écrit sous la clé propre + on retire les variantes (slug/casse)
  const setURL = (display: string, url: string) => setS(x => {
    const k = normBrand(display)
    const nb: Record<string, string> = {}
    for (const [bn, bu] of Object.entries(x.brands || {})) if (normBrand(bn) !== k) nb[bn] = bu
    nb[display] = url
    return { ...x, brands: nb }
  })
  // ── Clients connus (annonceurs) : simple référentiel d'URLs, SANS effet sur
  //    la rotation pour le moment (on verra plus tard ce qu'on en fait). ──
  const addClient = () => setS(x => ({ ...x, known_clients: [...(x.known_clients || []), { url: '', note: '' }] }))
  const setClient = (i: number, c: Partial<KnownClient>) => setS(x => ({ ...x, known_clients: (x.known_clients || []).map((kc, j) => j === i ? { ...kc, ...c } : kc) }))
  const delClient = (i: number) => setS(x => ({ ...x, known_clients: (x.known_clients || []).filter((_, j) => j !== i) }))

  async function save() {
    setSaving(true)
    try {
      // Nettoyer + dédupliquer : une clé propre par marque, URL non vide uniquement
      const merged: Record<string, { display: string; url: string }> = {}
      for (const [b, url] of Object.entries(s.brands || {})) {
        const cb = cleanBrand(b); if (!cb) continue
        const k = normBrand(b)
        if (!merged[k]) merged[k] = { display: cb, url: '' }
        if (url && url.trim()) merged[k].url = url.trim()
        merged[k].display = pickDisplay(merged[k].display, cb)
      }
      const brandsOut: Record<string, string> = {}
      for (const v of Object.values(merged)) if (v.url) brandsOut[v.display] = v.url
      const payload = { ...s, brands: brandsOut }
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
          <div style={{ fontSize: 12, color: C.faint }}>{withUrl} active(s) · {brands.length} connue(s)</div>
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
            {allBrands.map(b => (
              <div key={b.display} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.url ? C.accent : C.border, flexShrink: 0 }} />
                <span style={{ width: 150, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.display}</span>
                <span title="comparateurs où la marque apparaît" style={{ width: 42, textAlign: 'center', fontSize: 11.5, color: b.count ? C.accent : C.faint, flexShrink: 0 }}>{b.count ? `×${b.count}` : '—'}</span>
                <input value={b.url} onChange={e => setURL(b.display, e.target.value)} placeholder="https://www.marque.com/" style={{ ...inp, flex: 1 }} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 2 }}>Clients connus (annonceurs)</div>
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 14 }}>URL d'un annonceur qui t'a déjà acheté un lien (ex. <i>nnd.fr</i>). Pour l'instant, ces URLs sont juste enregistrées — <b>aucun effet</b> sur la rotation des liens.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(s.known_clients || []).length === 0 && (
            <div style={{ fontSize: 12.5, color: C.faint }}>Aucun client enregistré pour l'instant.</div>
          )}
          {(s.known_clients || []).map((kc, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input value={kc.url} onChange={e => setClient(i, { url: e.target.value })} placeholder="https://nnd.fr/" style={{ ...inp, flex: 2, minWidth: 220 }} />
              <input value={kc.note || ''} onChange={e => setClient(i, { note: e.target.value })} placeholder="Note (nom de l'annonceur, contexte…)" style={{ ...inp, flex: 1, minWidth: 160 }} />
              <span onClick={() => delClient(i)} title="Supprimer" style={{ cursor: 'pointer', color: C.faint, padding: '0 4px' }}>🗑</span>
            </div>
          ))}
        </div>
        <button onClick={addClient} style={{ marginTop: 12, padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.dim, fontSize: 12, cursor: 'pointer' }}>+ Client connu</button>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }
