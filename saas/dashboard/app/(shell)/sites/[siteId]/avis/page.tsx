'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

// Page de gestion des avis du dashboard.
// Layout : 2 sections
//   1. État de la sheet : configuration de l'URL CSV (+ lien d'édition)
//   2. Liste des avis avec leur état (published / scheduled / pending)
//      Chaque ligne "pending" ou "scheduled" a un bouton "🚀 Publier maintenant"
//      Chaque ligne "published" est cliquable vers l'URL publique

type SheetRow = {
  marque: string
  categorie: string
  sentiment: string
  note_globale: string
  date_publication: string
  cta_url: string
  cible: string
  tarifs: string
  note_trustpilot: string
  nb_avis_trustpilot: string
  slug: string
  status: 'published' | 'scheduled' | 'pending'
}

type Avis = {
  slug: string
  marque: string
  categorie: string
  sentiment: string
  note: number | null
  note_trustpilot: number | null
  nb_avis_trustpilot: number | null
  date: string
  meta_title: string
  meta_description: string
  h1: string
  cta_url: string
}

const SENTIMENT_LABEL: Record<string, string> = {
  positif: 'Positif',
  mitige: 'Mitigé',
  negatif: 'Négatif',
}
const SENTIMENT_COLOR: Record<string, string> = {
  positif: '#3D7A4F',
  mitige: '#9F7918',
  negatif: '#C0392B',
}

export default function AvisPage() {
  const params = useParams()
  const siteId = params?.siteId as string

  const [avis, setAvis] = useState<Avis[]>([])
  const [sheetRows, setSheetRows] = useState<SheetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [notConfigured, setNotConfigured] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [publishingMarque, setPublishingMarque] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [siteDomain, setSiteDomain] = useState('')
  const [sheetEditUrl, setSheetEditUrl] = useState('')

  useEffect(() => {
    loadAvis()
    loadSheet()
    loadConfig()
  }, [siteId])

  async function loadAvis() {
    setLoading(true)
    try {
      const r = await fetch(`/api/sites/${siteId}/avis`)
      const d = await r.json()
      setAvis(d.avis || [])
    } catch {
      setAvis([])
    }
    setLoading(false)
  }

  async function loadSheet() {
    setPreviewLoading(true)
    setPreviewError('')
    try {
      const r = await fetch(`/api/sites/${siteId}/avis/preview-sheet`)
      const d = await r.json()
      if (d.not_configured) {
        setNotConfigured(true)
        setSheetRows([])
      } else if (d.error) {
        setPreviewError(d.error)
        setSheetRows([])
        setNotConfigured(false)
      } else {
        setNotConfigured(false)
        setSheetRows(d.rows || [])
      }
    } catch (e: any) {
      setPreviewError('Erreur de chargement : ' + (e?.message || e))
    }
    setPreviewLoading(false)
  }

  async function loadConfig() {
    try {
      const r = await fetch(`/api/sites/${siteId}/config`)
      const d = await r.json()
      setSiteDomain(d?.site?.domain || '')
      // Si une URL d'édition d'avis est configurée
      setSheetEditUrl(d?.site?.avis_sheet_edit_url || '')
    } catch {}
  }

  async function publishNow(marque: string) {
    if (!confirm(`Forcer la publication immédiate de "${marque}" ? Le workflow GitHub va être déclenché.`)) return
    setPublishingMarque(marque)
    try {
      const r = await fetch(`/api/sites/${siteId}/avis/publish-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marques: [marque] }),
      })
      const d = await r.json()
      if (d.ok) {
        setMsg(`✓ ${d.message || 'Publication lancée'}`)
        setTimeout(() => loadSheet(), 2000)
      } else {
        setMsg('✗ ' + (d.error || 'Erreur'))
      }
    } catch (e: any) {
      setMsg('✗ Erreur : ' + (e?.message || e))
    }
    setPublishingMarque(null)
    setTimeout(() => setMsg(''), 8000)
  }

  const published = sheetRows.filter(r => r.status === 'published')
  const scheduled = sheetRows.filter(r => r.status === 'scheduled')
  const pending = sheetRows.filter(r => r.status === 'pending')

  const card = {
    background: '#0E1422',
    border: '1px solid #1E2D3D',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  } as const
  const sectionTitle = {
    fontSize: 14,
    fontWeight: 700,
    color: '#8B9CB0',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: 12,
  } as const

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1280, margin: '0 auto', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>⭐ Avis</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {sheetEditUrl && (
            <a href={sheetEditUrl} target="_blank" rel="noopener" style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid #2A4A6D',
              background: 'transparent', color: '#A5C9E8', textDecoration: 'none',
              fontSize: 13, fontWeight: 600,
            }}>📝 Éditer la sheet</a>
          )}
          <button onClick={() => { loadAvis(); loadSheet() }}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #2A4A6D', background: 'transparent', color: '#A5C9E8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            🔄 Rafraîchir
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ background: msg.startsWith('✓') ? 'rgba(61,122,79,.15)' : 'rgba(192,57,43,.15)',
                      border: '1px solid ' + (msg.startsWith('✓') ? '#3D7A4F' : '#C0392B'),
                      padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {msg}
        </div>
      )}

      {notConfigured && (
        <div style={card}>
          <div style={sectionTitle}>⚠ Sheet non configurée</div>
          <p style={{ color: '#A5B5C8', fontSize: 14, marginBottom: 12 }}>
            Aucune URL de Google Sheet d'avis n'est configurée pour ce site. Pour activer la publication automatique d'avis, édite <code style={{ background: '#0A0E1A', padding: '2px 6px', borderRadius: 4, color: '#5E9ED6' }}>platform/sites/{siteId}/config.yaml</code> et ajoute sous <code>site:</code> :
          </p>
          <pre style={{ background: '#0A0E1A', padding: 12, borderRadius: 6, fontSize: 12, color: '#A5C9E8', overflow: 'auto' }}>
{`site:
  avis_sheet_csv_url: "https://docs.google.com/.../pub?output=csv"
  avis_sheet_edit_url: "https://docs.google.com/.../edit"  # optionnel`}
          </pre>
          <p style={{ color: '#8B9CB0', fontSize: 13, marginTop: 12 }}>
            Une fois configuré, recharge cette page.
          </p>
        </div>
      )}

      {previewError && (
        <div style={card}>
          <div style={{ ...sectionTitle, color: '#C0392B' }}>⚠ Erreur de chargement de la sheet</div>
          <p style={{ color: '#A5B5C8', fontSize: 13 }}>{previewError}</p>
        </div>
      )}

      {/* Avis à publier maintenant (date passée mais pas encore publiée) */}
      {pending.length > 0 && (
        <div style={card}>
          <div style={sectionTitle}>⏳ En attente de publication ({pending.length})</div>
          <p style={{ color: '#A5B5C8', fontSize: 13, marginBottom: 12 }}>
            Ces avis ont une date de publication passée mais n'ont pas encore été publiés (le cron horaire les traitera, ou tu peux forcer la publication maintenant).
          </p>
          {pending.map((r, i) => (
            <Row key={i} row={r} publishingMarque={publishingMarque}
                 onPublish={() => publishNow(r.marque)} siteDomain={siteDomain} />
          ))}
        </div>
      )}

      {/* Avis programmés (date future) */}
      {scheduled.length > 0 && (
        <div style={card}>
          <div style={sectionTitle}>📅 Programmés ({scheduled.length})</div>
          {scheduled.map((r, i) => (
            <Row key={i} row={r} publishingMarque={publishingMarque}
                 onPublish={() => publishNow(r.marque)} siteDomain={siteDomain} />
          ))}
        </div>
      )}

      {/* Avis publiés */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={sectionTitle}>✅ Publiés ({avis.length})</div>
        </div>
        {loading ? (
          <div style={{ color: '#8B9CB0', fontSize: 13 }}>Chargement...</div>
        ) : avis.length === 0 ? (
          <div style={{ color: '#8B9CB0', fontSize: 13 }}>Aucun avis publié pour le moment.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {avis.map(a => (
              <div key={a.slug} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{a.marque || a.slug}</div>
                  <div style={{ fontSize: 12, color: '#8B9CB0', marginTop: 2 }}>
                    {a.categorie}
                    {a.date && ` · ${a.date.split('T')[0]}`}
                  </div>
                </div>
                {a.note != null && (
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#C9A961' }}>
                    {a.note}/5 ⭐
                  </div>
                )}
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' as const, background: (SENTIMENT_COLOR[a.sentiment] || '#5E9ED6') + '22', color: SENTIMENT_COLOR[a.sentiment] || '#5E9ED6' }}>
                  {SENTIMENT_LABEL[a.sentiment] || a.sentiment}
                </span>
                {siteDomain && (
                  <a href={`${siteDomain}/${a.slug}`} target="_blank" rel="noopener"
                     style={{ fontSize: 11, color: '#5E9ED6', textDecoration: 'none' }}>
                    Voir →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ row, publishingMarque, onPublish, siteDomain }: {
  row: SheetRow
  publishingMarque: string | null
  onPublish: () => void
  siteDomain: string
}) {
  const isPublishing = publishingMarque === row.marque
  const note = row.note_globale
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 8, marginBottom: 8 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{row.marque}</div>
        <div style={{ fontSize: 12, color: '#8B9CB0', marginTop: 2 }}>
          {row.categorie}{row.date_publication && ` · prévu le ${row.date_publication}`}
        </div>
      </div>
      {note && (
        <div style={{ fontSize: 14, fontWeight: 700, color: '#C9A961' }}>
          {note}/5 ⭐
        </div>
      )}
      <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' as const, background: (SENTIMENT_COLOR[row.sentiment] || '#5E9ED6') + '22', color: SENTIMENT_COLOR[row.sentiment] || '#5E9ED6' }}>
        {SENTIMENT_LABEL[row.sentiment] || row.sentiment}
      </span>
      <button onClick={onPublish} disabled={isPublishing}
        style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #3D7A4F', background: isPublishing ? '#1A2A1F' : 'transparent', color: isPublishing ? '#4A5568' : '#3D7A4F', cursor: isPublishing ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600 }}>
        {isPublishing ? '⏳ Lancement...' : '🚀 Publier maintenant'}
      </button>
      <span />
    </div>
  )
}
