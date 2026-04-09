'use client'

import { useEffect, useState } from 'react'
import { supabase, type Site, type Build } from '@/lib/supabase'

export default function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [builds, setBuilds] = useState<Build[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const { data: sitesData } = await supabase.from('sites').select('*').order('created_at', { ascending: false })
        const { data: buildsData } = await supabase.from('builds').select('*').order('created_at', { ascending: false }).limit(10)
        setSites(sitesData || [])
        setBuilds(buildsData || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function triggerGenerate(site: Site) {
    await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_slug: site.slug, site_id: site.id, trigger: 'manual' }),
    })
    alert(`Génération lancée pour ${site.name} !`)
  }

  if (loading) return <div style={s.loading}>Chargement…</div>

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Dashboard</h1>
          <p style={s.sub}>Plateforme comparatifs — {sites.length} site(s)</p>
        </div>
        <a href="/dashboard/sites/new" style={s.btnPrimary}>+ Nouveau site</a>
      </div>

      {/* Métriques */}
      <div style={s.metrics}>
        <div style={s.metric}><div style={s.mLabel}>Sites actifs</div><div style={s.mVal}>{sites.filter(s => s.status === 'live').length}</div></div>
        <div style={s.metric}><div style={s.mLabel}>Sites total</div><div style={s.mVal}>{sites.length}</div></div>
        <div style={s.metric}><div style={s.mLabel}>Pages générées</div><div style={s.mVal}>{sites.reduce((a, s) => a + (s.pages_count || 0), 0)}</div></div>
        <div style={s.metric}><div style={s.mLabel}>Dernier build</div><div style={{...s.mVal, fontSize: 13}}>{builds[0] ? new Date(builds[0].created_at).toLocaleDateString('fr') : '—'}</div></div>
      </div>

      {/* Sites */}
      <div style={s.card}>
        <div style={s.cardHeader}><span style={s.cardTitle}>Sites</span></div>
        {sites.length === 0 ? (
          <p style={s.empty}>Aucun site — <a href="/dashboard/sites/new" style={s.link}>créer le premier</a></p>
        ) : sites.map(site => (
          <div key={site.id} style={s.siteRow}>
            <div style={{...s.dot, background: site.status === 'live' ? '#639922' : '#ccc'}} />
            <div style={{flex: 1}}>
              <div style={s.siteName}>{site.name}</div>
              <div style={s.siteMeta}>{site.domain}{site.base_path} · {site.pages_count || 0} pages</div>
            </div>
            <span style={{...s.badge, ...(site.status === 'live' ? s.badgeLive : s.badgeDraft)}}>{site.status}</span>
            <a href={`/dashboard/sites/${site.slug}/products`} style={s.btn}>Produits</a>
            <button onClick={() => triggerGenerate(site)} style={s.btn}>Générer</button>
          </div>
        ))}
      </div>

      {/* Builds récents */}
      <div style={s.card}>
        <div style={s.cardHeader}><span style={s.cardTitle}>Builds récents</span></div>
        {builds.length === 0 ? (
          <p style={s.empty}>Aucun build encore</p>
        ) : builds.map(build => (
          <div key={build.id} style={s.buildRow}>
            <div style={{...s.dot, background: build.status === 'success' ? '#639922' : build.status === 'error' ? '#E8410A' : '#FAC775'}} />
            <span style={s.buildStatus}>{build.status}</span>
            <span style={s.buildMeta}>{build.pages_built || 0} pages · {build.trigger}</span>
            <span style={s.buildTime}>{new Date(build.created_at).toLocaleString('fr')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:       { maxWidth: 900, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif', color: '#1A1714' },
  loading:    { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui, sans-serif' },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title:      { fontSize: 24, fontWeight: 600, margin: '0 0 4px' },
  sub:        { fontSize: 13, color: '#6B6560', margin: 0 },
  btnPrimary: { background: '#E8410A', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none' },
  btn:        { background: 'transparent', border: '0.5px solid #ccc', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', marginLeft: 6, color: '#1A1714', textDecoration: 'none' },
  metrics:    { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 },
  metric:     { background: '#F7F4EF', borderRadius: 8, padding: '12px 14px' },
  mLabel:     { fontSize: 11, color: '#6B6560', marginBottom: 4 },
  mVal:       { fontSize: 22, fontWeight: 600 },
  card:       { background: '#fff', border: '0.5px solid #E2DDD6', borderRadius: 12, padding: 16, marginBottom: 14 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle:  { fontSize: 14, fontWeight: 500 },
  siteRow:    { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '0.5px solid #E2DDD6' },
  dot:        { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  siteName:   { fontSize: 13, fontWeight: 500 },
  siteMeta:   { fontSize: 11, color: '#A09890' },
  badge:      { padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 500 },
  badgeLive:  { background: '#EAF3DE', color: '#27500A' },
  badgeDraft: { background: '#F1EFE8', color: '#6B6560' },
  buildRow:   { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '0.5px solid #E2DDD6', fontSize: 12 },
  buildStatus:{ fontWeight: 500, minWidth: 60 },
  buildMeta:  { color: '#6B6560', flex: 1 },
  buildTime:  { color: '#A09890', fontSize: 11 },
  empty:      { fontSize: 13, color: '#A09890', padding: '8px 0' },
  link:       { color: '#E8410A' },
}
