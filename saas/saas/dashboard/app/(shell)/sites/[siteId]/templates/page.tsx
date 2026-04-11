'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const TEMPLATE_FILES = [
  { id: 'base', path: 'platform/templates/base/comparatif-vs-base.html.j2', label: '🏗️ Base commune', desc: 'Header, nav, footer, styles CSS partagés' },
  { id: 'comparatif', path: 'platform/templates/comparatif-vs-scpi.html.j2', label: '⚖️ Page comparatif', desc: 'Template des pages comparatif X vs Y' },
  { id: 'index', path: 'platform/templates/index-scpi.html.j2', label: '🏠 Page d\'accueil', desc: 'Homepage avec comparateur et liste des produits' },
  { id: 'comparatifs', path: 'platform/templates/comparatifs-scpi.html.j2', label: '📋 Tous les comparatifs', desc: 'Page listant tous les comparatifs' },
  { id: 'mentions', path: 'platform/templates/mentions-legales.html.j2', label: '⚖️ Mentions légales', desc: 'Page mentions légales' },
]

export default function TemplatesPage() {
  const { siteId } = useParams()
  const [selected, setSelected] = useState(TEMPLATE_FILES[0])
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadTemplate(selected) }, [selected])

  async function loadTemplate(tpl: typeof TEMPLATE_FILES[0]) {
    setLoading(true)
    setMsg('')
    try {
      const r = await fetch(`/api/github?path=${encodeURIComponent(tpl.path)}`)
      const d = await r.json()
      if (d.content) {
        setContent(d.content)
        setOriginalContent(d.content)
      } else {
        setContent('')
        setOriginalContent('')
      }
    } catch { setContent(''); setOriginalContent('') }
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    setMsg('')
    try {
      const r = await fetch('/api/github', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selected.path, content, message: `HUB: Update template ${selected.id} for ${siteId}` })
      })
      const d = await r.json()
      if (d.ok) { setMsg('✓ Template sauvegardé'); setOriginalContent(content) }
      else setMsg('✗ ' + (d.error || 'Erreur'))
    } catch { setMsg('✗ Erreur réseau') }
    setSaving(false)
  }

  const hasChanges = content !== originalContent
  const lines = content.split('\n').length

  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 20, fontSize: 13, color: '#8B9CB0' }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Sites</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none' }}>{siteId}</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: '#fff' }}>Templates</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Éditeur de templates</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 13, color: msg.startsWith('✓') ? '#00D4AA' : '#FC8181' }}>{msg}</span>}
          <button onClick={save} disabled={saving || !hasChanges} style={{
            padding: '9px 20px', borderRadius: 10, border: 'none', fontWeight: 600, fontSize: 13,
            background: !hasChanges ? '#1E2D3D' : 'linear-gradient(135deg, #00D4AA, #0090FF)',
            color: !hasChanges ? '#4A5568' : '#fff', cursor: !hasChanges ? 'not-allowed' : 'pointer'
          }}>
            {saving ? 'Sauvegarde...' : hasChanges ? '💾 Sauvegarder' : '✓ Sauvegardé'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden' }}>
        {/* File list */}
        <div style={{ width: 240, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, padding: 12, flexShrink: 0, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, color: '#4A5568', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, padding: '0 4px' }}>Fichiers</div>
          {TEMPLATE_FILES.map(tpl => (
            <div key={tpl.id} onClick={() => setSelected(tpl)} style={{
              padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
              background: selected.id === tpl.id ? 'rgba(0,212,170,0.1)' : 'transparent',
              border: selected.id === tpl.id ? '1px solid rgba(0,212,170,0.3)' : '1px solid transparent',
            }}>
              <div style={{ fontSize: 13, fontWeight: selected.id === tpl.id ? 600 : 400, color: selected.id === tpl.id ? '#fff' : '#8B9CB0', marginBottom: 3 }}>
                {tpl.label}
              </div>
              <div style={{ fontSize: 11, color: '#4A5568', lineHeight: 1.4 }}>{tpl.desc}</div>
            </div>
          ))}
        </div>

        {/* Editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden' }}>
          {/* Editor header */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #1E2D3D', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#8B9CB0', fontFamily: 'monospace' }}>{selected.path}</span>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#4A5568' }}>
              <span>{lines} lignes</span>
              <span>{content.length} chars</span>
              {hasChanges && <span style={{ color: '#F6AD55' }}>● modifié</span>}
            </div>
          </div>
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B9CB0' }}>Chargement...</div>
          ) : (
            <textarea
              value={content} onChange={e => setContent(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1, padding: 16, background: 'transparent', border: 'none',
                color: '#E2E8F0', fontFamily: '"Fira Code", "Cascadia Code", monospace',
                fontSize: 13, lineHeight: 1.6, resize: 'none', outline: 'none',
                tabSize: 2
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
