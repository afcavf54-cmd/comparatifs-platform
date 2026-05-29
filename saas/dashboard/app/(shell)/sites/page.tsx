'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const UNCATEGORIZED_KEY = '__uncategorized__'

// Grille commune à toutes les lignes (et au header) pour aligner les colonnes
const GRID_COLS = '1.4fr 1.2fr 1.4fr 0.8fr'

function CategoryInput({
  siteId, value, suggestions, onSave, disabled,
}: {
  siteId: string
  value: string
  suggestions: string[]
  onSave: (v: string) => void
  disabled: boolean
}) {
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => { setLocalValue(value) }, [value])

  function commit() {
    const trimmed = localValue.trim()
    if (trimmed !== (value || '').trim()) {
      onSave(trimmed)
    }
  }

  const datalistId = `cats-${siteId}`

  return (
    <>
      <input
        type="text"
        list={datalistId}
        value={localValue}
        onChange={e => setLocalValue(e.target.value)}
        onBlur={commit}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.currentTarget as HTMLInputElement).blur()
          } else if (e.key === 'Escape') {
            setLocalValue(value)
            ;(e.currentTarget as HTMLInputElement).blur()
          }
        }}
        placeholder="+ Catégorie…"
        disabled={disabled}
        style={{
          width: '100%',
          padding: '5px 9px',
          borderRadius: 6,
          border: '1px solid #1E2D3D',
          background: '#0A0E1A',
          color: '#fff',
          fontSize: 12,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <datalist id={datalistId}>
        {suggestions.map(s => <option key={s} value={s} />)}
      </datalist>
    </>
  )
}

export default function SitesPage() {
  const router = useRouter()
  const [sites, setSites] = useState<any[]>([])
  const [categories, setCategories] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingCategoryFor, setSavingCategoryFor] = useState<string | null>(null)
  const [deployingAll, setDeployingAll] = useState(false)
  const [deployAllMsg, setDeployAllMsg] = useState('')
  const [deployProgress, setDeployProgress] = useState<string[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/sites').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()).catch(() => ({ categories: {} })),
    ]).then(([sitesData, catsData]) => {
      setSites(sitesData.sites || [])
      setCategories(catsData.categories || {})
      setLoading(false)
    })
    const interval = setInterval(() => {
      fetch('/api/sites').then(r => r.json()).then(d => setSites(d.sites || []))
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  async function saveCategory(siteId: string, newCategory: string) {
    setSavingCategoryFor(siteId)
    setCategories(prev => {
      const updated = { ...prev }
      if (newCategory) updated[siteId] = newCategory
      else delete updated[siteId]
      return updated
    })
    try {
      const r = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, category: newCategory }),
      })
      const d = await r.json()
      if (d.ok && d.categories) {
        setCategories(d.categories)
      } else if (!d.ok) {
        const r2 = await fetch('/api/categories')
        const d2 = await r2.json()
        setCategories(d2.categories || {})
      }
    } catch {
      const r2 = await fetch('/api/categories')
      const d2 = await r2.json()
      setCategories(d2.categories || {})
    } finally {
      setSavingCategoryFor(null)
    }
  }

  async function deployAll() {
    setDeployingAll(true)
    setDeployAllMsg('')
    setDeployProgress([])
    const liveSites = sites.filter(s => s.id)
    for (const site of liveSites) {
      setDeployProgress(p => [...p, `⏳ Déploiement de ${site.name}...`])
      try {
        const r = await fetch('/api/deploy', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: site.id, workflowFile: 'generate-scpi.yml', skipEnrich: true })
        })
        const d = await r.json()
        setDeployProgress(p => [...p.slice(0, -1), d.ok ? `✓ ${site.name}` : `✗ ${site.name}: ${d.error}`])
        await fetch(`/api/sites/${site.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'building' }) })
      } catch {
        setDeployProgress(p => [...p.slice(0, -1), `✗ ${site.name}: erreur réseau`])
      }
      await new Promise(res => setTimeout(res, 1500))
    }
    setDeployAllMsg(`✓ ${liveSites.length} site(s) déclenchés`)
    setDeployingAll(false)
  }

  // ── Regrouper par catégorie ──────────────────────────────────────
  const groups: Record<string, any[]> = {}
  for (const site of sites) {
    const cat = (categories[site.id] || '').trim()
    const key = cat || UNCATEGORIZED_KEY
    if (!groups[key]) groups[key] = []
    groups[key].push(site)
  }
  const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
    if (a === UNCATEGORIZED_KEY) return 1
    if (b === UNCATEGORIZED_KEY) return -1
    return a.localeCompare(b, 'fr')
  })

  const suggestions = Array.from(new Set(Object.values(categories))).filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Mes sites</h1>
          <p style={{ color: '#8B9CB0', fontSize: 13, margin: '4px 0 0' }}>
            {sites.length} site{sites.length > 1 ? 's' : ''} · Actualisation auto toutes les 30s
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={deployAll} disabled={deployingAll || loading || sites.length === 0}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: deployingAll ? '#1E2D3D' : 'linear-gradient(135deg, #F6AD55, #FC8181)', color: deployingAll ? '#4A5568' : '#fff', fontWeight: 600, fontSize: 14, cursor: deployingAll ? 'not-allowed' : 'pointer' }}>
            {deployingAll ? '⏳ Déploiement...' : '🚀 Tout déployer'}
          </button>
          <Link href="/sites/new" style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            + Nouveau site
          </Link>
        </div>
      </div>

      {deployProgress.length > 0 && (
        <div style={{ marginBottom: 20, padding: 16, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#8B9CB0', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progression</div>
          {deployProgress.map((msg, i) => (
            <div key={i} style={{ fontSize: 13, color: msg.startsWith('✓') ? '#00D4AA' : msg.startsWith('✗') ? '#FC8181' : '#F6AD55', padding: '3px 0' }}>{msg}</div>
          ))}
          {deployAllMsg && <div style={{ marginTop: 8, fontSize: 13, color: '#00D4AA', fontWeight: 600 }}>{deployAllMsg}</div>}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 60 }}>Chargement...</div>
      ) : sites.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#4A5568' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🌐</div>
          <div style={{ fontSize: 16, color: '#8B9CB0', marginBottom: 20 }}>Aucun site créé</div>
          <Link href="/sites/new" style={{ padding: '12px 24px', borderRadius: 10, background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', fontWeight: 600, textDecoration: 'none' }}>Créer mon premier site</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          {/* Header colonnes global */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: GRID_COLS,
            gap: 14,
            padding: '0 12px',
            fontSize: 11,
            fontWeight: 600,
            color: '#4A5568',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: -20,
            maxWidth: 980,
          }}>
            <div>Nom du site</div>
            <div>Catégorie</div>
            <div>URL</div>
            <div style={{ textAlign: 'right' }}>Créé le</div>
          </div>

          {sortedGroupKeys.map(groupKey => {
            const groupSites = groups[groupKey]
            const isUncategorized = groupKey === UNCATEGORIZED_KEY
            const groupLabel = isUncategorized ? 'Sans catégorie' : groupKey
            const groupIcon = isUncategorized ? '📁' : '🏷️'
            return (
              <section key={groupKey} style={{ maxWidth: 980 }}>
                {/* Titre de section */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 14 }}>{groupIcon}</span>
                  <h2 style={{ fontSize: 13, fontWeight: 700, color: isUncategorized ? '#4A5568' : '#fff', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{groupLabel}</h2>
                  <span style={{ fontSize: 12, color: '#4A5568' }}>· {groupSites.length} site{groupSites.length > 1 ? 's' : ''}</span>
                </div>

                {/* Liste des lignes */}
                <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid #1E2D3D' }}>
                  {groupSites.map((site: any) => {
                    const cleanDomain = site.domain ? site.domain.replace(/^https?:\/\//, '') : ''
                    const fullUrl = site.domain ? (site.domain.startsWith('http') ? site.domain : `https://${site.domain}`) : ''
                    return (
                      <div key={site.id}
                        onClick={() => router.push(`/sites/${site.id}`)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: GRID_COLS,
                          alignItems: 'center',
                          gap: 14,
                          padding: '11px 12px',
                          background: 'transparent',
                          borderBottom: '1px solid #1E2D3D',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#11161F' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                        {/* Nom du site */}
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', wordBreak: 'break-word' }}>
                          {site.name}
                        </div>

                        {/* Catégorie input */}
                        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CategoryInput
                            siteId={site.id}
                            value={categories[site.id] || ''}
                            suggestions={suggestions}
                            onSave={v => saveCategory(site.id, v)}
                            disabled={savingCategoryFor === site.id}
                          />
                          {savingCategoryFor === site.id && (
                            <span style={{ fontSize: 11, color: '#F6AD55' }}>⏳</span>
                          )}
                        </div>

                        {/* URL */}
                        <div>
                          {cleanDomain ? (
                            <a href={fullUrl} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ fontSize: 13, color: '#00D4AA', textDecoration: 'none', wordBreak: 'break-all' }}>
                              🌐 {cleanDomain} ↗
                            </a>
                          ) : (
                            <span style={{ fontSize: 13, color: '#4A5568' }}>—</span>
                          )}
                        </div>

                        {/* Date de création */}
                        <div style={{ fontSize: 12, color: '#8B9CB0', textAlign: 'right' }}>
                          {new Date(site.created_at).toLocaleDateString('fr')}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
