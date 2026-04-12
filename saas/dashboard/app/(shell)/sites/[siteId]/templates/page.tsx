'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const COMMON_TEMPLATES = [
  { id: 'base', path: 'platform/templates/base/comparatif-vs-base.html.j2', label: '🏗️ Base commune', desc: 'Header, nav, footer, CSS partagés' },
  { id: 'comparatif', path: 'platform/templates/comparatif-vs-scpi.html.j2', label: '⚖️ Page comparatif', desc: 'Template pages X vs Y' },
  { id: 'index', path: 'platform/templates/index-scpi.html.j2', label: '🏠 Accueil', desc: 'Homepage avec comparateur' },
  { id: 'comparatifs', path: 'platform/templates/comparatifs-scpi.html.j2', label: '📋 Tous comparatifs', desc: 'Liste de tous les comparatifs' },
  { id: 'mentions', path: 'platform/templates/mentions-legales.html.j2', label: '⚖️ Mentions légales', desc: 'Page mentions légales' },
]

type Tpl = typeof COMMON_TEMPLATES[0]

export default function TemplatesPage() {
  const params = useParams()
  const siteId = params.siteId as string
  const [selected, setSelected] = useState<Tpl>(COMMON_TEMPLATES[0])
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const siteFiles: Tpl[] = [
    { id: 'config', path: `platform/sites/${siteId}/config.yaml`, label: '⚙️ Config YAML', desc: 'Configuration SEO, thème, données' },
    { id: 'editorial', path: `platform/sites/${siteId}/editorial.json`, label: '✍️ Éditorial JSON', desc: 'Textes par paire' },
    { id: 'generate', path: 'platform/scripts/generate.py', label: '🐍 Générateur Python', desc: 'Script de génération des pages' },
  ]

  useEffect(() => { loadFile(selected) }, [selected])

  async function loadFile(tpl: Tpl) {
    setLoading(true)
    setMsg('')
    try {
      const r = await fetch(`/api/github?path=${encodeURIComponent(tpl.path)}`)
      const d = await r.json()
      if (d.content) { setContent(d.content); setOriginalContent(d.content) }
      else { setContent(''); setOriginalContent('') }
    } catch { setContent(''); setOriginalContent('') }
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    setMsg('')
    try {
      const r = await fetch('/api/github', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selected.path, content, message: `HUB: Update ${selected.id} for ${siteId}` })
      })
      const d = await r.json()
      if (d.ok) { setMsg('✓ Sauvegardé'); setOriginalContent(content) }
      else setMsg('✗ ' + (d.error || 'Erreur'))
    } catch { setMsg('✗ Erreur réseau') }
    setSaving(false)
  }

  const hasChanges = content !== originalContent

  const FileItem = ({ tpl }: { tpl: Tpl }) => (
    <div onClick={() => setSelected(tpl)} style={{
      padding: '10px 12px', cursor: 'pointer',
      background: selected.id === tpl.id ? 'rgba(0,212,170,0.1)' : 'transparent',
      borderLeft: selected.id === tpl.id ? '2px solid #00D4AA' : '2px solid transparent',
      borderBottom: '1px solid #1E2D3D'
    }}>
      <div style={{ fontSize: 12, fontWeight: selected.id === tpl.id ? 600 : 400, color: selected.id === tpl.id ? '#fff' : '#8B9CB0', marginBottom: 2 }}>{tpl.label}</div>
      <div style={{ fontSize: 10, color: '#4A5568' }}>{tpl.desc}</div>
    </div>
  )

  const SectionLabel = ({ text }: { text: string }) => (
    <div style={{ padding: '8px 12px', fontSize: 10, color: '#4A5568', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontWeight: 600, borderBottom: '1px solid #1E2D3D', background: '#0A0E1A' }}>{text}</div>
  )

  return (
    <div style={{ height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 14, fontSize: 13, color: '#8B9CB0' }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Sites</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none' }}>{siteId}</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: '#fff' }}>Templates</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>Éditeur de fichiers</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('✓') ? '#00D4AA' : '#FC8181' }}>{msg}</span>}
          <button onClick={save} disabled={saving || !hasChanges} style={{
            padding: '8px 18px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 13,
            background: !hasChanges ? '#1E2D3D' : 'linear-gradient(135deg, #00D4AA, #0090FF)',
            color: !hasChanges ? '#4A5568' : '#fff', cursor: !hasChanges ? 'not-allowed' : 'pointer'
          }}>
            {saving ? 'Sauvegarde...' : hasChanges ? '💾 Sauvegarder' : '✓ Sauvegardé'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <div style={{ width: 230, display: 'flex', flexDirection: 'column', background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <SectionLabel text="Templates communs" />
            {COMMON_TEMPLATES.map(t => <FileItem key={t.id} tpl={t} />)}
            <SectionLabel text={`Fichiers — ${siteId}`} />
            {siteFiles.map(t => <FileItem key={t.id} tpl={t} />)}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 10, overflow: 'hidden', minWidth: 0 }}>
          <div style={{ padding: '9px 14px', borderBottom: '1px solid #1E2D3D', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: '#8B9CB0', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.path}</span>
            <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#4A5568', flexShrink: 0, marginLeft: 10 }}>
              <span>{content.split('\n').length} L</span>
              {hasChanges && <span style={{ color: '#F6AD55' }}>● modifié</span>}
            </div>
          </div>
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B9CB0' }}>Chargement...</div>
          ) : (
            <textarea value={content} onChange={e => setContent(e.target.value)} spellCheck={false} style={{
              flex: 1, padding: 14, background: 'transparent', border: 'none',
              color: '#E2E8F0', fontFamily: 'monospace', fontSize: 12.5,
              lineHeight: 1.65, resize: 'none', outline: 'none', minHeight: 0
            }} />
          )}
        </div>
      </div>
    </div>
  )
}
