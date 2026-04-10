'use client'

import { useState, useEffect } from 'react'

const TEMPLATES = [
  {
    id: 'scpi',
    label: 'Comparatif SCPI',
    path: 'platform/templates/comparatif-vs-scpi.html.j2',
    description: 'Template des pages X vs Y — 4 piliers, schemas, donuts',
  },
  {
    id: 'index',
    label: 'Home SCPI',
    path: 'platform/templates/index-scpi.html.j2',
    description: 'Page d\'accueil avec comparateur interactif',
  },
  {
    id: 'base',
    label: 'Base commune',
    path: 'platform/templates/base/comparatif-vs-base.html.j2',
    description: 'CSS, nav, tableau, verdict, maillage — partagé par tous les templates',
  },
  {
    id: 'mentions',
    label: 'Mentions légales',
    path: 'platform/templates/mentions-legales.html.j2',
    description: 'MiFID, AMF, risques SCPI, affiliation',
  },
  {
    id: 'confidentialite',
    label: 'Confidentialité',
    path: 'platform/templates/politique-confidentialite.html.j2',
    description: 'RGPD, CNIL, cookies, droits utilisateurs',
  },
  {
    id: 'generate',
    label: 'Générateur Python',
    path: 'platform/scripts/generate.py',
    description: 'Script de génération — lit le Sheet CSV, génère les pages',
  },
]

export default function TemplatesPage() {
  const [selected, setSelected]   = useState(TEMPLATES[0])
  const [content, setContent]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [status, setStatus]       = useState<{ type: 'success' | 'error', msg: string } | null>(null)
  const [changed, setChanged]     = useState(false)
  const [original, setOriginal]   = useState('')

  useEffect(() => {
    loadTemplate(selected)
  }, [selected])

  async function loadTemplate(tpl: typeof TEMPLATES[0]) {
    setLoading(true)
    setStatus(null)
    setChanged(false)
    try {
      const res = await fetch(`/api/github?path=${encodeURIComponent(tpl.path)}`)
      if (!res.ok) throw new Error('Fichier introuvable dans GitHub')
      const data = await res.json()
      setContent(data.content)
      setOriginal(data.content)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur'
      setStatus({ type: 'error', msg })
      setContent('')
    } finally {
      setLoading(false)
    }
  }

  async function saveTemplate() {
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch('/api/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: selected.path,
          content,
          message: `Update ${selected.label} via dashboard`,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStatus({ type: 'success', msg: `✓ Publié — GitHub Action en cours de déploiement` })
      setOriginal(content)
      setChanged(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur'
      setStatus({ type: 'error', msg: `✗ Erreur : ${msg}` })
    } finally {
      setSaving(false)
    }
  }

  function handleChange(val: string) {
    setContent(val)
    setChanged(val !== original)
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif', color: '#1A1714' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <a href="/" style={{ fontSize: 13, color: '#A09890', textDecoration: 'none' }}>← Dashboard</a>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Templates</h1>
          <p style={{ fontSize: 13, color: '#6B6560', margin: '4px 0 0' }}>
            Modifiez un template → cliquez Publier → déployé automatiquement sur Cloudflare
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {changed && (
            <span style={{ fontSize: 12, color: '#E8410A', padding: '4px 10px', background: '#FEF0EC', borderRadius: 6 }}>
              Modifications non publiées
            </span>
          )}
          <button
            onClick={() => { setContent(original); setChanged(false) }}
            disabled={!changed || saving}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: changed ? 'pointer' : 'not-allowed',
              border: '0.5px solid #ccc', background: 'transparent', color: changed ? '#1A1714' : '#ccc'
            }}
          >
            Annuler
          </button>
          <button
            onClick={saveTemplate}
            disabled={!changed || saving}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: changed ? 'pointer' : 'not-allowed',
              background: changed ? '#E8410A' : '#ccc', color: '#fff', border: 'none'
            }}
          >
            {saving ? 'Publication...' : '🚀 Publier'}
          </button>
        </div>
      </div>

      {/* Status */}
      {status && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: status.type === 'success' ? '#EAF3DE' : '#FEF0EC',
          color: status.type === 'success' ? '#27500A' : '#E8410A',
          border: `1px solid ${status.type === 'success' ? '#C0DD97' : '#FAC775'}`,
        }}>
          {status.msg}
          {status.type === 'success' && (
            <a
              href="https://utl-peipin-scpi.pages.dev"
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginLeft: 12, color: '#27500A', fontWeight: 600 }}
            >
              Voir le site →
            </a>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16 }}>

        {/* Sidebar templates */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {TEMPLATES.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => { if (!saving) { setSelected(tpl) } }}
              style={{
                textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${selected.id === tpl.id ? '#E8410A' : '#E2DDD6'}`,
                background: selected.id === tpl.id ? '#FEF0EC' : '#fff',
                transition: '.15s',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: selected.id === tpl.id ? '#E8410A' : '#1A1714', marginBottom: 2 }}>
                {tpl.label}
              </div>
              <div style={{ fontSize: 11, color: '#A09890', lineHeight: 1.4 }}>{tpl.description}</div>
            </button>
          ))}

          {/* Info deploy */}
          <div style={{ marginTop: 16, padding: '12px 14px', background: '#F7F4EF', borderRadius: 10, fontSize: 11, color: '#6B6560', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Comment ça marche</div>
            1. Modifiez le template<br />
            2. Cliquez <strong>Publier</strong><br />
            3. GitHub Action génère le site<br />
            4. Cloudflare déploie (~1 min)
          </div>
        </div>

        {/* Éditeur */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: '#A09890', fontFamily: 'monospace' }}>{selected.path}</div>
            <div style={{ fontSize: 11, color: '#A09890' }}>
              {content.length.toLocaleString('fr')} caractères · {content.split('\n').length.toLocaleString('fr')} lignes
            </div>
          </div>
          {loading ? (
            <div style={{ height: 600, background: '#F7F4EF', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A09890', fontSize: 14 }}>
              Chargement depuis GitHub...
            </div>
          ) : (
            <textarea
              value={content}
              onChange={e => handleChange(e.target.value)}
              spellCheck={false}
              style={{
                width: '100%', height: 640, padding: '16px', borderRadius: 12,
                border: `1px solid ${changed ? '#E8410A' : '#E2DDD6'}`,
                fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.6,
                resize: 'vertical', background: '#FAFAFA', color: '#1A1714', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          )}
        </div>

      </div>
    </div>
  )
}
