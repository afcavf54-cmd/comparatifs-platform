'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

// ── Catalogue d'outils disponibles ──────────────────────────────
// Pour ajouter un nouvel outil :
// 1. Créer le template Jinja2 dans platform/templates/outils/<id>.html.j2
// 2. Ajouter une entrée ici dans CATALOG
// 3. Le générateur Python lira platform/sites/<site>/outils.json et publiera
//    les outils actifs depuis ce catalogue
const CATALOG = [
  {
    id: 'convertisseur-ht-ttc',
    icon: '⇄',
    name: 'Convertisseur HT / TTC',
    description: 'Convertit un prix HT en TTC et inversement, avec les taux TVA 20%, 10%, 5,5% et 2,1%',
    default_slug: 'convertir-ht-ttc',
  },
  // Futur : { id: 'salaire-brut-net', ... }
  // Futur : { id: 'calcul-interets', ... }
]

interface OutilState {
  active: boolean
  slug: string
  title?: string
  meta_description?: string
  h1?: string
}

interface ToolsConfig {
  menu_label: string
  outils: Record<string, OutilState>
}

export default function OutilsPage() {
  const { siteId } = useParams()
  const [config, setConfig] = useState<ToolsConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const configPath = `platform/sites/${siteId}/outils.json`

  useEffect(() => {
    if (!siteId) return
    fetch(`/api/github?path=${encodeURIComponent(configPath)}`)
      .then(r => r.json())
      .then(d => {
        if (d.content) {
          try {
            setConfig(JSON.parse(d.content))
          } catch {
            setError("Format JSON invalide dans outils.json")
          }
        } else {
          // Pas de fichier → config par défaut (aucun outil activé)
          setConfig({ menu_label: 'Outils', outils: {} })
        }
        setLoading(false)
      })
      .catch(() => {
        setConfig({ menu_label: 'Outils', outils: {} })
        setLoading(false)
      })
  }, [siteId])

  if (loading) {
    return <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 60 }}>Chargement...</div>
  }

  if (error) {
    return (
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, padding: 40, textAlign: 'center' }}>
        <div style={{ color: '#FC8181', fontSize: 14 }}>{error}</div>
      </div>
    )
  }

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>🧰 Outils</h1>
      <div style={{ color: '#8B9CB0', fontSize: 13, marginBottom: 24 }}>
        Outils interactifs (convertisseurs, calculateurs…) à mettre en ligne sur ce site.
        Chaque outil peut être activé ou non, avec un slug d'URL personnalisable.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {CATALOG.map(tool => {
          const state = config?.outils?.[tool.id]
          const isActive = state?.active === true
          return (
            <div key={tool.id} style={{
              background: '#0D1117',
              border: `1px solid ${isActive ? '#00D4AA' : '#1E2D3D'}`,
              borderRadius: 12,
              padding: 20,
              position: 'relative'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>{tool.icon}</span>
                <h3 style={{ color: '#fff', margin: 0, fontSize: 15, fontWeight: 600, flex: 1 }}>{tool.name}</h3>
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  padding: '3px 10px', borderRadius: 20,
                  color: isActive ? '#00D4AA' : '#8B9CB0',
                  background: isActive ? 'rgba(0,212,170,0.12)' : 'rgba(139,156,176,0.12)',
                }}>
                  {isActive ? '● En ligne' : '○ Hors ligne'}
                </span>
              </div>
              <div style={{ color: '#8B9CB0', fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
                {tool.description}
              </div>
              <div style={{ fontSize: 11, color: '#4A5568', marginBottom: 14 }}>
                <strong style={{ color: '#8B9CB0' }}>Slug actuel :</strong> /{state?.slug || tool.default_slug}
              </div>
              <div style={{ fontSize: 12, color: '#4A5568', fontStyle: 'italic' }}>
                Configuration détaillée disponible bientôt (toggle, prompt IA, FAQ, etc.)
              </div>
            </div>
          )
        })}
      </div>

      {/* Hint pour l'utilisateur */}
      <div style={{ marginTop: 24, padding: '12px 16px', background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 10, fontSize: 12, color: '#8B9CB0' }}>
        💡 Cette page liste les outils disponibles dans la plateforme. Dans la prochaine étape, on ajoutera la possibilité de les activer/désactiver par site, de personnaliser leur slug, et de générer du contenu IA en dessous (prompt, plan, FAQ).
      </div>
    </div>
  )
}
