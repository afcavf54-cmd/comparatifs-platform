'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function TemplatesPage() {
  const [schemas, setSchemas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Charge la liste des schemas depuis platform/schemas/
    fetch('/api/github?path=platform/schemas').then(r => r.json()).then(async (files) => {
      if (!Array.isArray(files)) { setLoading(false); return }
      const jsonFiles = files.filter((f: any) => f.name.endsWith('.json'))
      const schemas = await Promise.all(jsonFiles.map(async (f: any) => {
        const r = await fetch(`/api/github?path=${encodeURIComponent(f.path)}`)
        const d = await r.json()
        try { return JSON.parse(d.content) } catch { return null }
      }))
      setSchemas(schemas.filter(Boolean))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // ── Labels et couleurs par type ────────────────────────────────────────
  // 'blog' ajouté (juin 2026) pour les thématiques blog-only (ex: cadeau,
  // finance perso). Référencé via page_types.blog: <slug> dans config.yaml,
  // lu côté Python par load_prompts() dans blog_publish_scheduled.py.
  // Couleur rose (#F687B3) pour les distinguer visuellement des classements.
  const TYPE_LABELS: Record<string, string> = {
    blog: 'Thématiques Blog',
    avis: 'Pages Avis',
    vs: 'Pages Marque vs Marque',
    local: 'Pages Locales',
    classement: 'Pages Classement',
    autres: 'Autres',
  }

  const byType = schemas.reduce((acc: any, s) => {
    const type = s.type || 'autres'
    if (!acc[type]) acc[type] = []
    acc[type].push(s)
    return acc
  }, {})

  const typeColors: Record<string, string> = {
    blog: '#F687B3',
    avis: '#00D4AA',
    vs: '#0090FF',
    local: '#F6AD55',
    classement: '#9F7AEA',
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>📐 Modèles de pages</h1>
          <p style={{ color: '#8B9CB0', fontSize: 13, margin: '6px 0 0' }}>
            {schemas.length} modèle{schemas.length > 1 ? 's' : ''} disponible{schemas.length > 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/templates/new" style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
          ➕ Nouveau modèle
        </Link>
      </div>

      {loading ? (
        <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 60 }}>Chargement...</div>
      ) : schemas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#4A5568' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📐</div>
          <div style={{ fontSize: 16, marginBottom: 8, color: '#8B9CB0' }}>Aucun modèle</div>
          <div style={{ fontSize: 13 }}>Créez votre premier modèle ou uploadez les schemas SCPI sur GitHub</div>
        </div>
      ) : (
        Object.entries(byType).map(([type, templates]: [string, any]) => (
          <div key={type} style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              {TYPE_LABELS[type] || type}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {templates.map((schema: any) => (
                <Link key={schema.template} href={`/templates/${schema.template}`} style={{ textDecoration: 'none' }}>
                  <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 20, cursor: 'pointer', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#00D4AA')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#1E2D3D')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div style={{ padding: '4px 10px', borderRadius: 6, background: `${typeColors[schema.type] || '#8B9CB0'}20`, color: typeColors[schema.type] || '#8B9CB0', fontSize: 11, fontWeight: 700 }}>
                        {schema.type}
                      </div>
                      <div style={{ fontSize: 11, color: '#4A5568' }}>{schema.blocks?.length || 0} blocs</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 6 }}>{schema.label}</div>
                    <div style={{ fontSize: 12, color: '#8B9CB0', lineHeight: 1.5 }}>{schema.description}</div>
                    <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(schema.blocks || []).slice(0, 4).map((b: any) => (
                        <span key={b.id} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#1E2D3D', color: '#8B9CB0' }}>
                          {b.label}
                        </span>
                      ))}
                      {schema.blocks?.length > 4 && (
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#1E2D3D', color: '#4A5568' }}>
                          +{schema.blocks.length - 4}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
