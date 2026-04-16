'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function TemplateDetailPage() {
  const { templateId } = useParams()
  const [schema, setSchema] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editingBlock, setEditingBlock] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const schemaPath = `platform/schemas/${templateId}.json`

  useEffect(() => {
    fetch(`/api/github?path=${encodeURIComponent(schemaPath)}`).then(r => r.json()).then(d => {
      try { setSchema(JSON.parse(d.content)) } catch {}
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [templateId])

  function updateBlock(blockId: string, field: string, value: string) {
    setSchema((prev: any) => ({
      ...prev,
      blocks: prev.blocks.map((b: any) => b.id === blockId ? { ...b, [field]: value } : b)
    }))
  }

  async function save() {
    setSaving(true); setMsg('')
    const r = await fetch('/api/github', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: schemaPath, content: JSON.stringify(schema, null, 2), message: `HUB: Update schema ${templateId}` })
    })
    const d = await r.json()
    setMsg(d.ok ? '✓ Modèle sauvegardé' : '✗ Erreur')
    setSaving(false)
  }

  const typeColors: Record<string, string> = { avis: '#00D4AA', vs: '#0090FF', local: '#F6AD55', classement: '#9F7AEA' }
  const blockTypeIcon: Record<string, string> = { h1: 'H1', h2: 'H2', paragraph: '¶', 'expert-box': '💡', list: '☰', faq: '❓', verdict: '✅' }

  if (loading) return <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 60 }}>Chargement...</div>
  if (!schema) return <div style={{ color: '#FC8181', textAlign: 'center', padding: 60 }}>Modèle introuvable</div>

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 24, fontSize: 13, color: '#8B9CB0' }}>
        <Link href="/templates" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Modèles</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: '#fff' }}>{schema.label}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>{schema.label}</h1>
            <span style={{ padding: '3px 10px', borderRadius: 6, background: `${typeColors[schema.type] || '#8B9CB0'}20`, color: typeColors[schema.type] || '#8B9CB0', fontSize: 12, fontWeight: 700 }}>{schema.type}</span>
          </div>
          <p style={{ color: '#8B9CB0', fontSize: 13, margin: 0 }}>{schema.description} · {schema.blocks?.length} blocs</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('✓') ? '#00D4AA' : '#FC8181' }}>{msg}</span>}
          <button onClick={save} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            {saving ? '...' : '💾 Sauvegarder'}
          </button>
        </div>
      </div>

      {/* Variables disponibles */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Variables disponibles dans les prompts</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(schema.variables || []).map((v: string) => (
            <code key={v} style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(0,212,170,0.1)', color: '#00D4AA', fontSize: 12 }}>{`{${v}}`}</code>
          ))}
        </div>
      </div>

      {/* Blocs */}
      <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        Structure de la page ({schema.blocks?.length} blocs)
      </div>

      {(schema.blocks || []).map((block: any, i: number) => (
        <div key={block.id} style={{ background: '#0D1117', border: `1px solid ${editingBlock === block.id ? '#00D4AA' : '#1E2D3D'}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden', transition: 'border-color 0.15s' }}>
          {/* Header bloc */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }}
            onClick={() => setEditingBlock(editingBlock === block.id ? null : block.id)}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#1E2D3D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#8B9CB0', flexShrink: 0 }}>
              {blockTypeIcon[block.type] || block.type}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{block.label}</div>
              <div style={{ fontSize: 11, color: '#4A5568', marginTop: 2 }}>champ: <code style={{ color: '#8B9CB0' }}>{block.field}</code> · type: {block.type}</div>
            </div>
            <div style={{ fontSize: 18, color: '#4A5568' }}>{editingBlock === block.id ? '▲' : '▼'}</div>
          </div>

          {/* Éditeur prompt */}
          {editingBlock === block.id && (
            <div style={{ padding: '0 18px 18px', borderTop: '1px solid #1E2D3D' }}>
              <div style={{ paddingTop: 14 }}>
                <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Prompt de génération
                </div>
                <textarea
                  value={block.prompt || ''}
                  rows={6}
                  onChange={e => updateBlock(block.id, 'prompt', e.target.value)}
                  style={{ width: '100%', padding: 12, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  placeholder="Prompt pour générer ce bloc via Sonnet. Utilisez {variables} pour injecter les données produit."
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, marginTop: 4 }}>
                    Label
                  </div>
                </div>
                <input
                  value={block.label || ''}
                  onChange={e => updateBlock(block.id, 'label', e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Ajouter un bloc */}
      <button onClick={() => {
        const id = `block_${Date.now()}`
        setSchema((prev: any) => ({
          ...prev,
          blocks: [...(prev.blocks || []), { id, type: 'paragraph', label: 'Nouveau bloc', field: id, prompt: '' }]
        }))
        setEditingBlock(id)
      }} style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px dashed #1E2D3D', background: 'transparent', color: '#4A5568', cursor: 'pointer', fontSize: 13, marginTop: 8 }}>
        ➕ Ajouter un bloc
      </button>
    </div>
  )
}
