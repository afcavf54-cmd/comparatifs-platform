'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type Tab = 'pairs' | 'products' | 'site'

export default function EditorialPage() {
  const { siteId } = useParams()
  const [tab, setTab] = useState<Tab>('pairs')

  // Pairs (editorial.json)
  const [editorial, setEditorial] = useState<Record<string, any>>({})
  const [selectedPair, setSelectedPair] = useState<string | null>(null)
  const [searchPair, setSearchPair] = useState('')

  // Products (products_editorial.json)
  const [productsEditorial, setProductsEditorial] = useState<Record<string, any>>({})
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)

  // Site (site_editorial.json)
  const [siteEditorial, setSiteEditorial] = useState<Record<string, any>>({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [sheetUrl, setSheetUrl] = useState('')

  const editorialPath = `platform/sites/${siteId}/editorial.json`
  const productsPath = `platform/sites/${siteId}/products_editorial.json`
  const sitePath = `platform/sites/${siteId}/site_editorial.json`

  async function loadFile(path: string) {
    const r = await fetch(`/api/github?path=${encodeURIComponent(path)}`)
    const d = await r.json()
    if (d.content) {
      try { return JSON.parse(d.content) } catch {}
    }
    return {}
  }

  useEffect(() => {
    setLoading(true)
    fetch(`/api/sites/${siteId}`).then(r => r.json()).then(d => {
      if (d.sheet_csv_url) setSheetUrl(d.sheet_csv_url)
    })
    Promise.all([
      loadFile(editorialPath),
      loadFile(productsPath),
      loadFile(sitePath),
    ]).then(([ed, prod, site]) => {
      setEditorial(ed)
      setProductsEditorial(prod)
      setSiteEditorial(site)
      setLoading(false)
    })
  }, [siteId])

  async function save(path: string, data: any, label: string) {
    setSaving(true); setMsg('')
    const r = await fetch('/api/github', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content: JSON.stringify(data, null, 2), message: `HUB: Update ${label} ${siteId}` })
    })
    const d = await r.json()
    setMsg(d.ok ? '✓ Sauvegardé' : '✗ Erreur')
    setSaving(false)
  }

  function updatePairField(field: string, value: any) {
    if (!selectedPair) return
    setEditorial(prev => ({ ...prev, [selectedPair]: { ...prev[selectedPair], [field]: value } }))
  }

  function updateProductField(field: string, value: any) {
    if (!selectedProduct) return
    setProductsEditorial(prev => ({ ...prev, [selectedProduct]: { ...prev[selectedProduct], [field]: value } }))
  }

  const filteredPairs = Object.keys(editorial).filter(k =>
    !searchPair || k.toLowerCase().includes(searchPair.toLowerCase())
  )

  const inp = (label: string, value: string, onChange: (v: string) => void, rows = 6) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <textarea value={value || ''} rows={rows} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: 12, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, resize: 'vertical' as const, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
    </div>
  )

  const listInp = (label: string, value: string[], onChange: (v: string[]) => void) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <textarea value={(value || []).join('\n')} rows={4} onChange={e => onChange(e.target.value.split('\n'))}
        style={{ width: '100%', padding: 12, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, resize: 'vertical' as const, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
      <div style={{ fontSize: 10, color: '#4A5568', marginTop: 4 }}>Un item par ligne</div>
    </div>
  )

  const tabStyle = (t: Tab) => ({
    padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
    background: tab === t ? 'rgba(0,212,170,0.15)' : 'transparent',
    color: tab === t ? '#00D4AA' : '#8B9CB0',
  })

  const sidebarItem = (key: string, selected: string | null, onClick: () => void) => (
    <div key={key} onClick={onClick} style={{
      padding: '10px 14px', cursor: 'pointer', fontSize: 12,
      background: selected === key ? 'rgba(0,212,170,0.1)' : 'transparent',
      borderLeft: selected === key ? '2px solid #00D4AA' : '2px solid transparent',
      color: selected === key ? '#fff' : '#8B9CB0',
      borderBottom: '1px solid #1E2D3D'
    }}>
      {key.replace(/-vs-/, ' vs ').replace(/-/g, ' ')}
    </div>
  )

  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 16, fontSize: 13, color: '#8B9CB0' }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Sites</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none' }}>{siteId}</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: '#fff' }}>Éditorial</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={tabStyle('pairs')} onClick={() => setTab('pairs')}>⚖️ Paires VS ({Object.keys(editorial).length})</button>
          <button style={tabStyle('products')} onClick={() => setTab('products')}>📋 Avis produits ({Object.keys(productsEditorial).length})</button>
          <button style={tabStyle('site')} onClick={() => setTab('site')}>🏠 Site</button>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('✓') ? '#00D4AA' : '#FC8181' }}>{msg}</span>}
          <button onClick={() => {
            if (tab === 'pairs') save(editorialPath, editorial, 'editorial')
            else if (tab === 'products') save(productsPath, productsEditorial, 'products_editorial')
            else save(sitePath, siteEditorial, 'site_editorial')
          }} disabled={saving} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            {saving ? '...' : '💾 Sauvegarder'}
          </button>
        </div>
      </div>

      {loading ? <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 40 }}>Chargement...</div> : (

        <div style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden' }}>

          {/* ── PAIRES VS ── */}
          {tab === 'pairs' && <>
            <div style={{ width: 260, display: 'flex', flexDirection: 'column', background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: 12 }}>
                <input value={searchPair} onChange={e => setSearchPair(e.target.value)} placeholder="Rechercher..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {filteredPairs.map(key => sidebarItem(key, selectedPair, () => setSelectedPair(key)))}
                {filteredPairs.length === 0 && <div style={{ color: '#4A5568', padding: 20, fontSize: 12, textAlign: 'center' }}>Aucune paire</div>}
              </div>
            </div>
            <div style={{ flex: 1, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {!selectedPair ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A5568', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 40 }}>⚖️</div><div>Sélectionnez une paire</div>
                </div>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                  <h3 style={{ color: '#00D4AA', margin: '0 0 16px', fontSize: 14 }}>{selectedPair}</h3>
                  {inp('Intro édito', editorial[selectedPair]?.intro_edito, v => updatePairField('intro_edito', v), 4)}
                  {inp('Expert performance', editorial[selectedPair]?.expert_performance, v => updatePairField('expert_performance', v), 3)}
                  {inp('Expert fiscalité', editorial[selectedPair]?.expert_fiscalite, v => updatePairField('expert_fiscalite', v), 3)}
                  {inp('Expert frais', editorial[selectedPair]?.expert_frais, v => updatePairField('expert_frais', v), 3)}
                  {inp('Expert décote', editorial[selectedPair]?.expert_decote, v => updatePairField('expert_decote', v), 3)}
                  {inp('Mix text (investir dans les deux)', editorial[selectedPair]?.mix_text, v => updatePairField('mix_text', v), 4)}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#0090FF', fontWeight: 600, marginBottom: 8 }}>Produit A</div>
                      {inp('Description A', editorial[selectedPair]?.description_a, v => updatePairField('description_a', v), 6)}
                      {listInp('Points forts A', editorial[selectedPair]?.points_forts_a, v => updatePairField('points_forts_a', v))}
                      {listInp('Points faibles A', editorial[selectedPair]?.points_faibles_a, v => updatePairField('points_faibles_a', v))}
                      {listInp('Verdict si A', editorial[selectedPair]?.verdict_si_a, v => updatePairField('verdict_si_a', v))}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#9F7AEA', fontWeight: 600, marginBottom: 8 }}>Produit B</div>
                      {inp('Description B', editorial[selectedPair]?.description_b, v => updatePairField('description_b', v), 6)}
                      {listInp('Points forts B', editorial[selectedPair]?.points_forts_b, v => updatePairField('points_forts_b', v))}
                      {listInp('Points faibles B', editorial[selectedPair]?.points_faibles_b, v => updatePairField('points_faibles_b', v))}
                      {listInp('Verdict si B', editorial[selectedPair]?.verdict_si_b, v => updatePairField('verdict_si_b', v))}
                    </div>
                  </div>
                  {/* FAQ */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>FAQ</div>
                    {(editorial[selectedPair]?.faq_vs || []).map((item: any, i: number) => (
                      <div key={i} style={{ marginBottom: 12, padding: 12, background: '#0A0E1A', borderRadius: 8, border: '1px solid #1E2D3D' }}>
                        <input value={item.q || ''} onChange={e => {
                          const faq = [...(editorial[selectedPair]?.faq_vs || [])]
                          faq[i] = { ...faq[i], q: e.target.value }
                          updatePairField('faq_vs', faq)
                        }} placeholder="Question" style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none', marginBottom: 6, boxSizing: 'border-box' as const }} />
                        <textarea value={item.a || ''} rows={2} onChange={e => {
                          const faq = [...(editorial[selectedPair]?.faq_vs || [])]
                          faq[i] = { ...faq[i], a: e.target.value }
                          updatePairField('faq_vs', faq)
                        }} placeholder="Réponse" style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>}

          {/* ── AVIS PRODUITS ── */}
          {tab === 'products' && <>
            <div style={{ width: 220, display: 'flex', flexDirection: 'column', background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {Object.keys(productsEditorial).map(key => sidebarItem(key, selectedProduct, () => setSelectedProduct(key)))}
                {Object.keys(productsEditorial).length === 0 && <div style={{ color: '#4A5568', padding: 20, fontSize: 12, textAlign: 'center' }}>Aucun produit</div>}
              </div>
            </div>
            <div style={{ flex: 1, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {!selectedProduct ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A5568', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 40 }}>📋</div><div>Sélectionnez un produit</div>
                </div>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                  <h3 style={{ color: '#00D4AA', margin: '0 0 16px', fontSize: 14 }}>{selectedProduct}</h3>
                  {inp('Description', productsEditorial[selectedProduct]?.description, v => updateProductField('description', v), 8)}
                  {listInp('Points forts', productsEditorial[selectedProduct]?.points_forts, v => updateProductField('points_forts', v))}
                  {listInp('Points faibles', productsEditorial[selectedProduct]?.points_faibles, v => updateProductField('points_faibles', v))}
                  {listInp('Verdict si', productsEditorial[selectedProduct]?.verdict_si, v => updateProductField('verdict_si', v))}
                </div>
              )}
            </div>
          </>}

          {/* ── SITE ── */}
          {tab === 'site' && (
            <div style={{ flex: 1, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'auto', padding: 24 }}>
              <h3 style={{ color: '#00D4AA', margin: '0 0 20px', fontSize: 14 }}>Contenu éditorial du site</h3>
              {Object.keys(siteEditorial).length === 0 ? (
                <div style={{ color: '#4A5568', textAlign: 'center', padding: 40 }}>Aucun contenu site — générez-le via le pipeline</div>
              ) : (
                Object.entries(siteEditorial).map(([key, value]) => (
                  <div key={key} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>{key.replace(/_/g, ' ')}</div>
                    {typeof value === 'string' ? (
                      <textarea value={value} rows={4} onChange={e => setSiteEditorial(prev => ({ ...prev, [key]: e.target.value }))}
                        style={{ width: '100%', padding: 12, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, resize: 'vertical' as const, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
                    ) : Array.isArray(value) ? (
                      <textarea value={value.join('\n')} rows={4} onChange={e => setSiteEditorial(prev => ({ ...prev, [key]: e.target.value.split('\n') }))}
                        style={{ width: '100%', padding: 12, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, resize: 'vertical' as const, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
                    ) : (
                      <div style={{ color: '#4A5568', fontSize: 12 }}>{JSON.stringify(value)}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
