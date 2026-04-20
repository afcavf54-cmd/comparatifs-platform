'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function ClassementsPage() {
  const { siteId } = useParams()
  const [classements, setClassements] = useState<Record<string, any>>({})
  const [products, setProducts] = useState<any[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({})
  const [deploying, setDeploying] = useState(false)
  const [msg, setMsg] = useState('')

  const editorialPath = `platform/sites/${siteId}/editorial.json`

  useEffect(() => {
    fetch(`/api/sites/${siteId}`).then(r => r.json()).then(async d => {
      if (d.sheet_csv_url) {
        const r = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: d.sheet_csv_url }) })
        const sd = await r.json()
        if (!sd.error) setProducts(sd.rows || [])
      }
    })
    fetch(`/api/github?path=${encodeURIComponent(editorialPath)}`).then(r => r.json()).then(d => {
      if (d.content) {
        try {
          const all = JSON.parse(d.content)
          const cls: Record<string, any> = {}
          for (const [k, v] of Object.entries(all)) {
            if (k.startsWith('classement-')) cls[k] = v
          }
          setClassements(cls)
          if (Object.keys(cls).length > 0) setSelected(Object.keys(cls)[0])
        } catch {}
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [siteId])

  const categories = [...new Set(products.map(p => p.categorie).filter(Boolean))] as string[]
  const categoriesWithoutContent = categories.filter(cat => {
    const slug = cat.toLowerCase().replace(/ /g, '-').replace(/_/g, '-')
    return !classements[`classement-${slug}`]
  })

  async function save() {
    setSaving(true); setMsg('')
    const r = await fetch(`/api/github?path=${encodeURIComponent(editorialPath)}`)
    const d = await r.json()
    let allEditorial: Record<string, any> = {}
    if (d.content) { try { allEditorial = JSON.parse(d.content) } catch {} }
    const merged = { ...allEditorial, ...classements }
    const wr = await fetch('/api/github', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: editorialPath, content: JSON.stringify(merged, null, 2), message: `HUB: Update classements ${siteId}` })
    })
    const wd = await wr.json()
    setMsg(wd.ok ? '✓ Sauvegardé' : '✗ Erreur')
    setSaving(false)
  }

  // Régénère une page : supprime la clé dans editorial.json et relance le déploiement
  async function regeneratePage(catKey: string) {
    setRegenerating(prev => ({ ...prev, [catKey]: true })); setMsg('')
    try {
      // 1. Charger editorial.json complet
      const r = await fetch(`/api/github?path=${encodeURIComponent(editorialPath)}`)
      const d = await r.json()
      let allEditorial: Record<string, any> = {}
      if (d.content) { try { allEditorial = JSON.parse(d.content) } catch {} }

      // 2. Supprimer la clé de ce classement
      delete allEditorial[catKey]

      // 3. Sauvegarder sur GitHub
      const wr = await fetch('/api/github', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: editorialPath, content: JSON.stringify(allEditorial, null, 2), message: `HUB: Reset classement ${catKey} for regeneration` })
      })
      const wd = await wr.json()
      if (!wd.ok) { setMsg('✗ Erreur sauvegarde'); return }

      // 4. Mettre à jour le state local
      setClassements(prev => {
        const next = { ...prev }
        delete next[catKey]
        return next
      })
      if (selected === catKey) setSelected(null)

      // 5. Lancer le déploiement
      setDeploying(true)
      const dr = await fetch(`/api/sites/${siteId}/deploy`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skip_enrich: false })
      })
      const dd = await dr.json()
      setMsg(dd.success ? '✓ Régénération lancée (~3 min)' : '✗ Erreur déploiement')
    } catch (e: any) {
      setMsg('✗ ' + e.message)
    }
    setRegenerating(prev => ({ ...prev, [catKey]: false }))
    setDeploying(false)
  }

  function updateField(catKey: string, field: string, value: string) {
    setClassements(prev => ({ ...prev, [catKey]: { ...prev[catKey], [field]: value } }))
  }

  function addClassement(cat: string) {
    const slug = cat.toLowerCase().replace(/ /g, '-').replace(/_/g, '-')
    const key = `classement-${slug}`
    setClassements(prev => ({
      ...prev,
      [key]: {
        categorie: cat,
        h1: `Meilleur ${cat} 2026 : Top ${products.filter(p => p.categorie === cat).length}`,
        meta_title: `Meilleur ${cat} 2026 : comparatif et avis`,
        meta_description: `Comparez les meilleurs ${cat} en 2026 : prix, fonctionnalités, avis.`,
      }
    }))
    setSelected(key)
  }

  const selectedData = selected ? classements[selected] : null
  const catProducts = selectedData
    ? products.filter(p => {
        const slug = (p.categorie || '').toLowerCase().replace(/ /g, '-').replace(/_/g, '-')
        return `classement-${slug}` === selected
      })
    : []

  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 16, fontSize: 13, color: '#8B9CB0' }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Sites</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none' }}>{siteId}</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: '#fff' }}>Classements</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>📊 Classements</h1>
          <p style={{ color: '#8B9CB0', fontSize: 13, margin: '4px 0 0' }}>{Object.keys(classements).length} page{Object.keys(classements).length > 1 ? 's' : ''} · {categories.length} catégorie{categories.length > 1 ? 's' : ''} dans le Sheet</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('✓') ? '#00D4AA' : '#FC8181', maxWidth: 280 }}>{msg}</span>}
          <button onClick={save} disabled={saving} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            {saving ? '...' : '💾 Sauvegarder'}
          </button>
        </div>
      </div>

      {loading ? <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 40 }}>Chargement...</div> : (
        <div style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden' }}>

          {/* Sidebar */}
          <div style={{ width: 240, display: 'flex', flexDirection: 'column', background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #1E2D3D', fontSize: 11, color: '#8B9CB0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Pages existantes
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {Object.keys(classements).map(key => (
                <div key={key} onClick={() => setSelected(key)} style={{
                  padding: '10px 14px', cursor: 'pointer', fontSize: 12,
                  background: selected === key ? 'rgba(0,212,170,0.1)' : 'transparent',
                  borderLeft: selected === key ? '2px solid #00D4AA' : '2px solid transparent',
                  color: selected === key ? '#fff' : '#8B9CB0',
                  borderBottom: '1px solid #1E2D3D'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>{classements[key]?.categorie || key.replace('classement-', '')}</div>
                    <button
                      onClick={e => { e.stopPropagation(); regeneratePage(key) }}
                      disabled={regenerating[key] || deploying}
                      title="Régénérer cette page"
                      style={{ padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: regenerating[key] ? '#4A5568' : '#F6AD55', cursor: 'pointer', fontSize: 13 }}>
                      {regenerating[key] ? '⏳' : '🔄'}
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: '#4A5568', marginTop: 2 }}>
                    {classements[key]?.intro || classements[key]?.contenu_custom ? '✓ Contenu généré' : '⚠ Sans contenu'}
                  </div>
                </div>
              ))}
              {Object.keys(classements).length === 0 && (
                <div style={{ color: '#4A5568', padding: 16, fontSize: 12, textAlign: 'center' }}>Aucune page</div>
              )}
            </div>

            {categoriesWithoutContent.length > 0 && (
              <>
                <div style={{ padding: '10px 12px', borderTop: '1px solid #1E2D3D', borderBottom: '1px solid #1E2D3D', fontSize: 11, color: '#F6AD55', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  ➕ Ajouter depuis Sheet
                </div>
                {categoriesWithoutContent.map(cat => (
                  <div key={cat} onClick={() => addClassement(cat)} style={{
                    padding: '10px 14px', cursor: 'pointer', fontSize: 12, color: '#F6AD55',
                    borderBottom: '1px solid #1E2D3D', display: 'flex', alignItems: 'center', gap: 6
                  }}>
                    <span>+</span> {cat}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Éditeur */}
          <div style={{ flex: 1, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {!selected || !selectedData ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A5568', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 40 }}>📊</div>
                <div>Sélectionnez une page classement</div>
                {categoriesWithoutContent.length > 0 && (
                  <div style={{ fontSize: 13, color: '#F6AD55' }}>
                    {categoriesWithoutContent.length} catégorie{categoriesWithoutContent.length > 1 ? 's' : ''} détectée{categoriesWithoutContent.length > 1 ? 's' : ''} dans le Sheet sans page
                  </div>
                )}
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3 style={{ color: '#00D4AA', margin: 0, fontSize: 15 }}>
                    {selectedData.categorie || selected.replace('classement-', '')}
                  </h3>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#4A5568' }}>{catProducts.length} produit{catProducts.length > 1 ? 's' : ''}</span>
                    {catProducts.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                        {catProducts.map(p => (
                          <span key={p.slug} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#1E2D3D', color: '#8B9CB0' }}>{p.nom}</span>
                        ))}
                      </div>
                    )}
                    <button onClick={() => regeneratePage(selected)} disabled={regenerating[selected] || deploying}
                      style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #F6AD55', background: 'transparent', color: '#F6AD55', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                      {regenerating[selected] ? '⏳ En cours...' : '🔄 Régénérer cette page'}
                    </button>
                  </div>
                </div>

                {/* Info régénération */}
                <div style={{ padding: 12, background: 'rgba(246,173,85,0.06)', border: '1px solid rgba(246,173,85,0.2)', borderRadius: 8, fontSize: 12, color: '#8B9CB0', marginBottom: 20, lineHeight: 1.6 }}>
                  🔄 <strong style={{ color: '#F6AD55' }}>Régénérer</strong> supprime le contenu existant et relance Sonnet avec les prompts définis dans <Link href={`/templates/classement-saas`} style={{ color: '#00D4AA', textDecoration: 'none' }}>Modèles → classement-saas</Link>.
                </div>

                {/* SEO */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {[{ label: 'H1', field: 'h1' }, { label: 'Meta title', field: 'meta_title' }].map(({ label, field }) => (
                    <div key={field}>
                      <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
                      <input value={selectedData[field] || ''} onChange={e => updateField(selected, field, e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>Meta description</div>
                  <input value={selectedData.meta_description || ''} onChange={e => updateField(selected, 'meta_description', e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                </div>

                {/* Aperçu contenu généré */}
                {(selectedData.intro || selectedData.contenu_custom) && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: '#00D4AA', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>
                      ✓ Contenu généré
                    </div>
                    {selectedData.intro && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: '#8B9CB0', marginBottom: 4 }}>INTRO</div>
                        <div style={{ padding: 12, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', fontSize: 12, color: '#8B9CB0', lineHeight: 1.6, maxHeight: 80, overflow: 'hidden' }}
                          dangerouslySetInnerHTML={{ __html: selectedData.intro }} />
                      </div>
                    )}
                    {selectedData.contenu_custom && (
                      <div>
                        <div style={{ fontSize: 11, color: '#8B9CB0', marginBottom: 4 }}>CONTENU EXPERT</div>
                        <div style={{ padding: 12, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', fontSize: 12, color: '#8B9CB0', lineHeight: 1.6, maxHeight: 80, overflow: 'hidden' }}
                          dangerouslySetInnerHTML={{ __html: selectedData.contenu_custom }} />
                      </div>
                    )}
                  </div>
                )}

                {!selectedData.intro && !selectedData.contenu_custom && (
                  <div style={{ padding: 20, textAlign: 'center', color: '#4A5568', border: '1px dashed #1E2D3D', borderRadius: 8 }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>⚠</div>
                    <div style={{ fontSize: 13 }}>Aucun contenu généré.</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Vérifiez que les prompts sont définis dans Modèles → classement-saas → Mots clés puis cliquez 🔄 Régénérer.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
