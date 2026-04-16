'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type Tab = 'pairs' | 'products' | 'site'

export default function EditorialPage() {
  const { siteId } = useParams()
  const [tab, setTab] = useState<Tab>('pairs')

  const [editorial, setEditorial] = useState<Record<string, any>>({})
  const [selectedPair, setSelectedPair] = useState<string | null>(null)
  const [searchPair, setSearchPair] = useState('')

  const [productsEditorial, setProductsEditorial] = useState<Record<string, any>>({})
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)

  const [siteEditorial, setSiteEditorial] = useState<Record<string, any>>({})
  const [products, setProducts] = useState<any[]>([])
  const [vsSchema, setVsSchema] = useState<any>(null)
  const [avisSchema, setAvisSchema] = useState<any>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState('')
  const [sheetUrl, setSheetUrl] = useState('')

  const editorialPath = `platform/sites/${siteId}/editorial.json`
  const productsPath = `platform/sites/${siteId}/products_editorial.json`
  const sitePath = `platform/sites/${siteId}/site_editorial.json`

  async function loadFile(path: string) {
    const r = await fetch(`/api/github?path=${encodeURIComponent(path)}`)
    const d = await r.json()
    if (d.content) { try { return JSON.parse(d.content) } catch {} }
    return {}
  }

  async function loadSchema(templateId: string) {
    const r = await fetch(`/api/github?path=${encodeURIComponent(`platform/schemas/${templateId}.json`)}`)
    const d = await r.json()
    if (d.content) { try { return JSON.parse(d.content) } catch {} }
    return null
  }

  async function loadSheet(url: string) {
    try {
      const r = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      const d = await r.json()
      return d.rows || []
    } catch { return [] }
  }

  useEffect(() => {
    setLoading(true)
    fetch(`/api/sites/${siteId}`).then(r => r.json()).then(async d => {
      if (d.sheet_csv_url) {
        setSheetUrl(d.sheet_csv_url)
        const rows = await loadSheet(d.sheet_csv_url)
        setProducts(rows)
      }
    })
    Promise.all([
      loadFile(editorialPath),
      loadFile(productsPath),
      loadFile(sitePath),
    ]).then(async ([ed, prod, site]) => {
      setEditorial(ed); setProductsEditorial(prod); setSiteEditorial(site)
      // Charger les schemas via config page_types
      const configRes = await fetch(`/api/sites/${siteId}/config`)
      const config = await configRes.json()
      const pt = config.page_types || {}
      if (pt.vs) { const s = await loadSchema(pt.vs); setVsSchema(s) }
      if (pt.avis) { const s = await loadSchema(pt.avis); setAvisSchema(s) }
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

  // Régénère un bloc spécifique
  async function regenerateBlock(pageType: string, blockId: string, field: string, variables: Record<string, any>, isPair: boolean) {
    const key = `${blockId}-${isPair ? selectedPair : selectedProduct}`
    setRegenerating(prev => ({ ...prev, [key]: true }))
    try {
      const r = await fetch(`/api/sites/${siteId}/regenerate-block`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageType, blockId, variables })
      })
      const d = await r.json()
      if (d.success) {
        if (isPair && selectedPair) {
          setEditorial(prev => ({ ...prev, [selectedPair]: { ...prev[selectedPair], [field]: d.value } }))
        } else if (!isPair && selectedProduct) {
          setProductsEditorial(prev => ({ ...prev, [selectedProduct]: { ...prev[selectedProduct], [field]: d.value } }))
        }
        setMsg(`✓ ${field} régénéré`)
      } else {
        setMsg('✗ ' + (d.error || 'Erreur'))
      }
    } catch (e: any) { setMsg('✗ ' + e.message) }
    setRegenerating(prev => ({ ...prev, [key]: false }))
  }

  // Régénère tous les blocs d'une paire
  async function regenerateAllBlocks(isPair: boolean) {
    const schema = isPair ? vsSchema : avisSchema
    if (!schema) { setMsg('✗ Schema introuvable'); return }
    const selected = isPair ? selectedPair : selectedProduct
    if (!selected) return

    for (const block of schema.blocks || []) {
      const vars = isPair ? getPairVariables(selected) : getProductVariables(selected)
      await regenerateBlock(isPair ? 'vs' : 'avis', block.id, block.field, vars, isPair)
      await new Promise(r => setTimeout(r, 500))
    }
    setMsg('✓ Tous les blocs régénérés')
  }

  function getPairVariables(pairKey: string) {
    const [slugA, slugB] = pairKey.split('-vs-')
    const pa = products.find(p => p.slug === slugA) || {}
    const pb = products.find(p => p.slug === slugB) || {}
    return {
      nom_a: pa.nom, nom_b: pb.nom, marque_a: pa.marque, marque_b: pb.marque,
      td_a: pa.td, td_b: pb.td, tri_a: pa.tri, tri_b: pb.tri,
      frais_souscription_a: pa.frais_souscription, frais_souscription_b: pb.frais_souscription,
      year: new Date().getFullYear(), site_name: siteId
    }
  }

  function getProductVariables(slug: string) {
    const p = products.find(pr => pr.slug === slug) || {}
    return { nom: p.nom, marque: p.marque, td: p.td, tri: p.tri, tof: p.tof, pga: p.pga, frais_souscription: p.frais_souscription, frais_gestion: p.frais_gestion, year: new Date().getFullYear(), site_name: siteId }
  }

  function updatePairField(field: string, value: any) {
    if (!selectedPair) return
    setEditorial(prev => ({ ...prev, [selectedPair]: { ...prev[selectedPair], [field]: value } }))
  }

  function updateProductField(field: string, value: any) {
    if (!selectedProduct) return
    setProductsEditorial(prev => ({ ...prev, [selectedProduct]: { ...prev[selectedProduct], [field]: value } }))
  }

  const filteredPairs = Object.keys(editorial).filter(k => !searchPair || k.toLowerCase().includes(searchPair.toLowerCase()))

  const RegenerateBtn = ({ blockId, field, isPair }: { blockId: string, field: string, isPair: boolean }) => {
    const key = `${blockId}-${isPair ? selectedPair : selectedProduct}`
    const isLoading = regenerating[key]
    const schema = isPair ? vsSchema : avisSchema
    if (!schema) return null
    const block = schema?.blocks?.find((b: any) => b.id === blockId)
    if (!block) return null
    const vars = isPair ? (selectedPair ? getPairVariables(selectedPair) : {}) : (selectedProduct ? getProductVariables(selectedProduct) : {})
    return (
      <button onClick={() => regenerateBlock(isPair ? 'vs' : 'avis', blockId, field, vars, isPair)} disabled={isLoading}
        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #1E2D3D', background: isLoading ? '#1E2D3D' : 'transparent', color: isLoading ? '#4A5568' : '#F6AD55', cursor: isLoading ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600 }}>
        {isLoading ? '⏳' : '🔄'}
      </button>
    )
  }

  const fieldRow = (label: string, field: string, value: any, onChange: (v: any) => void, isPair: boolean, blockId: string, rows = 5) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', flex: 1 }}>{label}</div>
        <RegenerateBtn blockId={blockId} field={field} isPair={isPair} />
      </div>
      {Array.isArray(value) ? (
        <>
          <textarea value={(value as string[]).join('\n')} rows={rows} onChange={e => onChange(e.target.value.split('\n'))}
            style={{ width: '100%', padding: 12, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, resize: 'vertical' as const, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
          <div style={{ fontSize: 10, color: '#4A5568', marginTop: 3 }}>Un item par ligne</div>
        </>
      ) : (
        <textarea value={value || ''} rows={rows} onChange={e => onChange(e.target.value)}
          style={{ width: '100%', padding: 12, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, resize: 'vertical' as const, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
      )}
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
      color: selected === key ? '#fff' : '#8B9CB0', borderBottom: '1px solid #1E2D3D'
    }}>
      {key.replace(/-vs-/, ' vs ').replace(/-/g, ' ')}
    </div>
  )

  const hasSchema = (isPair: boolean) => isPair ? !!vsSchema : !!avisSchema
  const selectedKey = tab === 'pairs' ? selectedPair : selectedProduct

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
          <button style={tabStyle('products')} onClick={() => setTab('products')}>📋 Avis ({Object.keys(productsEditorial).length})</button>
          <button style={tabStyle('site')} onClick={() => setTab('site')}>🏠 Site</button>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('✓') ? '#00D4AA' : '#FC8181', maxWidth: 280 }}>{msg}</span>}
          {selectedKey && hasSchema(tab === 'pairs') && (
            <button onClick={() => regenerateAllBlocks(tab === 'pairs')}
              style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid #F6AD55', background: 'transparent', color: '#F6AD55', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
              🔄 Tout régénérer
            </button>
          )}
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

          {/* PAIRES */}
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
                  {!vsSchema && <div style={{ fontSize: 11, color: '#F6AD55', marginBottom: 12 }}>⚠ Schema vs-{siteId}.json introuvable — régénération désactivée</div>}
                  {fieldRow('Intro édito', 'intro_edito', editorial[selectedPair]?.intro_edito, v => updatePairField('intro_edito', v), true, 'intro_edito', 4)}
                  {fieldRow('Expert performance', 'expert_performance', editorial[selectedPair]?.expert_performance, v => updatePairField('expert_performance', v), true, 'expert_performance', 3)}
                  {fieldRow('Expert fiscalité', 'expert_fiscalite', editorial[selectedPair]?.expert_fiscalite, v => updatePairField('expert_fiscalite', v), true, 'expert_fiscalite', 3)}
                  {fieldRow('Expert frais', 'expert_frais', editorial[selectedPair]?.expert_frais, v => updatePairField('expert_frais', v), true, 'expert_frais', 3)}
                  {fieldRow('Expert décote', 'expert_decote', editorial[selectedPair]?.expert_decote, v => updatePairField('expert_decote', v), true, 'expert_decote', 2)}
                  {fieldRow('Mix text', 'mix_text', editorial[selectedPair]?.mix_text, v => updatePairField('mix_text', v), true, 'mix_text', 4)}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#0090FF', fontWeight: 600, marginBottom: 8 }}>Produit A</div>
                      {fieldRow('Description A', 'description_a', editorial[selectedPair]?.description_a, v => updatePairField('description_a', v), true, 'description_a', 6)}
                      {fieldRow('Points forts A', 'points_forts_a', editorial[selectedPair]?.points_forts_a, v => updatePairField('points_forts_a', v), true, 'points_forts_a', 4)}
                      {fieldRow('Points faibles A', 'points_faibles_a', editorial[selectedPair]?.points_faibles_a, v => updatePairField('points_faibles_a', v), true, 'points_faibles_a', 3)}
                      {fieldRow('Verdict si A', 'verdict_si_a', editorial[selectedPair]?.verdict_si_a, v => updatePairField('verdict_si_a', v), true, 'verdict_si_a', 3)}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#9F7AEA', fontWeight: 600, marginBottom: 8 }}>Produit B</div>
                      {fieldRow('Description B', 'description_b', editorial[selectedPair]?.description_b, v => updatePairField('description_b', v), true, 'description_b', 6)}
                      {fieldRow('Points forts B', 'points_forts_b', editorial[selectedPair]?.points_forts_b, v => updatePairField('points_forts_b', v), true, 'points_forts_b', 4)}
                      {fieldRow('Points faibles B', 'points_faibles_b', editorial[selectedPair]?.points_faibles_b, v => updatePairField('points_faibles_b', v), true, 'points_faibles_b', 3)}
                      {fieldRow('Verdict si B', 'verdict_si_b', editorial[selectedPair]?.verdict_si_b, v => updatePairField('verdict_si_b', v), true, 'verdict_si_b', 3)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>}

          {/* PRODUITS */}
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
                  <h3 style={{ color: '#00D4AA', margin: '0 0 8px', fontSize: 14 }}>{selectedProduct}</h3>
                  {!avisSchema && <div style={{ fontSize: 11, color: '#F6AD55', marginBottom: 12 }}>⚠ Schema avis-{siteId}.json introuvable — régénération désactivée</div>}
                  {fieldRow('Description', 'description', productsEditorial[selectedProduct]?.description, v => updateProductField('description', v), false, 'description', 8)}
                  {fieldRow('Points forts', 'points_forts', productsEditorial[selectedProduct]?.points_forts, v => updateProductField('points_forts', v), false, 'points_forts', 4)}
                  {fieldRow('Points faibles', 'points_faibles', productsEditorial[selectedProduct]?.points_faibles, v => updateProductField('points_faibles', v), false, 'points_faibles', 3)}
                  {fieldRow('Verdict si', 'verdict_si', productsEditorial[selectedProduct]?.verdict_si, v => updateProductField('verdict_si', v), false, 'verdict_si', 4)}
                </div>
              )}
            </div>
          </>}

          {/* SITE */}
          {tab === 'site' && (
            <div style={{ flex: 1, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'auto', padding: 24 }}>
              <h3 style={{ color: '#00D4AA', margin: '0 0 20px', fontSize: 14 }}>Contenu éditorial du site</h3>
              {Object.keys(siteEditorial).length === 0 ? (
                <div style={{ color: '#4A5568', textAlign: 'center', padding: 40 }}>Aucun contenu site</div>
              ) : (
                Object.entries(siteEditorial).map(([key, value]) => (
                  <div key={key} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>{key.replace(/_/g, ' ')}</div>
                    {typeof value === 'string' ? (
                      <textarea value={value} rows={4} onChange={e => setSiteEditorial(prev => ({ ...prev, [key]: e.target.value }))}
                        style={{ width: '100%', padding: 12, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, resize: 'vertical' as const, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
                    ) : (
                      <textarea value={JSON.stringify(value, null, 2)} rows={6} onChange={e => { try { setSiteEditorial(prev => ({ ...prev, [key]: JSON.parse(e.target.value) })) } catch {} }}
                        style={{ width: '100%', padding: 12, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 12, lineHeight: 1.6, resize: 'vertical' as const, outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' as const }} />
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
