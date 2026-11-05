'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

// ────────────────────────────────────────────────────────────────────────
// Landing pages sur-mesure (ads). Le design/contenu de chaque page est
// développé dans le repo (template `key`). Ici on édite slug, title SEO et
// meta description, et on (dé)active. Ces pages sont en noindex et hors sitemap.
// ────────────────────────────────────────────────────────────────────────

type Landing = { key: string; slug: string; seo_title?: string; meta_description?: string; active?: boolean }

const card = { background: '#0F1724', border: '1px solid #1E2D3D', borderRadius: 12, padding: 18 } as const
const input = { width: '100%', padding: '9px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 } as const
const lbl = { display: 'block', fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }
const btn = (bg: string) => ({ padding: '9px 16px', borderRadius: 8, background: bg, color: '#fff', border: 0, fontSize: 13, fontWeight: 600, cursor: 'pointer' } as const)

function siteDomain(siteId: string) {
  // Reconstruit le NDD public à partir de l'id de site (monelor-com → www.monelor.com)
  if (siteId === 'mon-credit-facile-fr') return 'https://mon-credit-facile-fr.pages.dev'
  const host = siteId.replace(/-(com|fr|net|io|org)$/,'.$1')
  return `https://www.${host}`
}

export default function LandingsAdmin() {
  const { siteId } = useParams<{ siteId: string }>()
  const [rows, setRows] = useState<Landing[]>([])
  const [loading, setLoading] = useState(true)
  const [exists, setExists] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    setLoading(true); setMsg('')
    try {
      const r = await fetch(`/api/sites/${siteId}/landings`)
      const d = await r.json()
      setRows(d.landings || []); setExists(d.exists !== false)
      if (d.error) setMsg('⚠️ ' + d.error)
    } catch (e: any) { setMsg('⚠️ ' + (e.message || 'Erreur réseau')) }
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [siteId])

  function upd(key: string, field: keyof Landing, value: any) {
    setRows(p => p.map(r => r.key === key ? { ...r, [field]: value } : r))
  }

  async function save() {
    setSaving(true); setMsg('')
    try {
      const r = await fetch(`/api/sites/${siteId}/landings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landings: rows }),
      })
      const d = await r.json()
      if (!r.ok) setMsg('❌ ' + (d.error || 'Erreur'))
      else { setRows(d.landings || rows); setMsg(d.deployed ? '✅ Enregistré — déploiement lancé (~2-3 min)' : '✅ Enregistré (⚠️ déploiement non déclenché, relance manuelle)') }
    } catch (e: any) { setMsg('❌ ' + (e.message || 'Erreur réseau')) }
    setSaving(false)
  }

  const base = siteDomain(siteId)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px', color: '#fff' }}>
      <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none', fontSize: 13 }}>← {siteId}</Link>
      <h1 style={{ fontSize: 22, margin: '8px 0 2px' }}>🎯 Landing pages (ads)</h1>
      <p style={{ color: '#8B9CB0', fontSize: 13, margin: '0 0 18px', lineHeight: 1.6 }}>
        Pages sur-mesure dédiées aux campagnes publicitaires : <strong>en noindex</strong>, <strong>absentes du sitemap</strong> et non liées depuis le blog ou la navigation. Le design de chaque page est développé sur mesure ; ici vous éditez le slug, le title SEO et la meta description.
      </p>

      {msg && <div style={{ ...card, marginBottom: 14 }}>{msg}</div>}

      {loading ? (
        <div style={{ ...card, color: '#8B9CB0' }}>Chargement…</div>
      ) : rows.length === 0 ? (
        <div style={{ ...card, color: '#8B9CB0', lineHeight: 1.6 }}>
          Aucune landing page pour ce site pour l'instant.<br />
          Donnez les consignes de la première page à construire — elle sera développée puis ajoutée ici, éditable juste après.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 14 }}>
            {rows.map(r => {
              const url = `${base}/${r.slug}.html`
              return (
                <div key={r.key} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, color: '#55657A', background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 6, padding: '3px 8px' }}>template : {r.key}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: r.active !== false ? '#4ADE80' : '#8B9CB0', cursor: 'pointer' }}>
                        <input type="checkbox" checked={r.active !== false} onChange={e => upd(r.key, 'active', e.target.checked)} />
                        {r.active !== false ? 'En ligne' : 'Désactivée'}
                      </label>
                    </div>
                    <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#60A5FA', textDecoration: 'none' }}>Ouvrir ↗</a>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <label style={lbl}>Slug (URL)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#55657A', fontSize: 13, whiteSpace: 'nowrap' }}>{base}/</span>
                      <input style={input} value={r.slug} onChange={e => upd(r.key, 'slug', e.target.value)} placeholder="mon-offre-ads" />
                      <span style={{ color: '#55657A', fontSize: 13 }}>.html</span>
                    </div>
                    <p style={{ fontSize: 11, color: '#55657A', margin: '5px 0 0' }}>Minuscules, chiffres et tirets. La page reste accessible avec ou sans « .html ».</p>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <label style={lbl}>Title SEO</label>
                    <input style={input} value={r.seo_title || ''} onChange={e => upd(r.key, 'seo_title', e.target.value)} maxLength={180} />
                    <p style={{ fontSize: 11, color: '#55657A', margin: '5px 0 0' }}>{(r.seo_title || '').length}/180</p>
                  </div>

                  <div>
                    <label style={lbl}>Meta description</label>
                    <textarea style={{ ...input, minHeight: 64 }} value={r.meta_description || ''} onChange={e => upd(r.key, 'meta_description', e.target.value)} maxLength={320} />
                    <p style={{ fontSize: 11, color: '#55657A', margin: '5px 0 0' }}>{(r.meta_description || '').length}/320</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
            <button type="button" disabled={saving} style={btn('#FF8A3D')} onClick={save}>{saving ? 'Enregistrement…' : '🚀 Enregistrer & déployer'}</button>
            <button type="button" style={btn('#1E2D3D')} onClick={load} disabled={saving}>Annuler les modifs</button>
          </div>
        </>
      )}
    </div>
  )
}
