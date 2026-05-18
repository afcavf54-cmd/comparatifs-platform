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

  // Configuration de la sheet (input + save)
  const [showSheetConfig, setShowSheetConfig] = useState(false)
  const [sheetUrl, setSheetUrl] = useState('')
  const [sheetUrlOriginal, setSheetUrlOriginal] = useState('')
  const [editUrlInput, setEditUrlInput] = useState('')
  const [editUrlOriginal, setEditUrlOriginal] = useState('')
  const [savingSheet, setSavingSheet] = useState(false)
  const [sheetMsg, setSheetMsg] = useState('')

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
      // Charge la sheet URL et l'URL d'édition pour les afficher dans le formulaire
      const csv = d?.avis_sheet_csv_url || d?.site?.avis_sheet_csv_url || ''
      const edit = d?.avis_sheet_edit_url || d?.site?.avis_sheet_edit_url || ''
      setSheetUrl(csv)
      setSheetUrlOriginal(csv)
      setEditUrlInput(edit)
      setEditUrlOriginal(edit)
      setSheetEditUrl(edit)
      // Si pas configurée, on ouvre automatiquement le bloc config pour guider l'utilisateur
      if (!csv) setShowSheetConfig(true)
    } catch {}
  }

  // Sauvegarde l'URL CSV (avec normalisation /pubhtml → /pub?output=csv).
  // Au prochain `loadSheet()` la page reflète la nouvelle config.
  async function saveSheet() {
    setSavingSheet(true)
    setSheetMsg('')
    let urlToSave = sheetUrl.trim()
    if (urlToSave) {
      urlToSave = urlToSave.replace(/\/pubhtml(\?[^#]*)?(#.*)?$/, '/pub?output=csv')
      if (/\/pub(\?|$)/.test(urlToSave) && !/output=csv/.test(urlToSave)) {
        urlToSave = urlToSave.replace(/\/pub(\?|$)/, '/pub?output=csv$1').replace('?$1', '')
      }
    }
    const editUrl = editUrlInput.trim()
    try {
      const r = await fetch(`/api/sites/${siteId}/config`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avis_sheet_csv_url: urlToSave,
          avis_sheet_edit_url: editUrl,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (r.ok) {
        setSheetUrl(urlToSave)
        setSheetUrlOriginal(urlToSave)
        setEditUrlOriginal(editUrl)
        setSheetEditUrl(editUrl)
        const msg = urlToSave !== sheetUrl.trim() ? '✓ URL normalisée et enregistrée' : '✓ Sheet enregistrée'
        setSheetMsg(msg)
        // Recharge la preview avec la nouvelle URL
        setTimeout(() => { loadSheet(); setNotConfigured(false) }, 800)
      } else {
        setSheetMsg(`✗ ${data.error || `Erreur ${r.status}`}`)
      }
    } catch (e: any) {
      setSheetMsg(`✗ ${e.message}`)
    }
    setSavingSheet(false)
    setTimeout(() => setSheetMsg(''), 5000)
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
          <button onClick={() => setShowSheetConfig(s => !s)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #2A4A6D',
                     background: showSheetConfig ? '#1A2A3D' : 'transparent',
                     color: '#A5C9E8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            📊 Config sheet {showSheetConfig ? '▲' : '▼'}
          </button>
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

      {showSheetConfig && (
        <div style={card}>
          <div style={sectionTitle}>📊 Configuration de la Google Sheet d'avis</div>
          <p style={{ color: '#A5B5C8', fontSize: 13, marginBottom: 16 }}>
            Renseigne l'URL de ta sheet publiée en CSV. <strong>Pas besoin de créer une nouvelle sheet à chaque fois</strong> : les avis déjà publiés sont automatiquement détectés et ignorés. Tu ajoutes simplement de nouvelles lignes à ta sheet existante au fil du temps.
          </p>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#8B9CB0', textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>
              URL CSV publiée
            </label>
            <input type="text" value={sheetUrl} onChange={e => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/e/XXXX/pub?output=csv"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' as const }} />
            <div style={{ fontSize: 11, color: '#8B9CB0', marginTop: 4 }}>
              Dans Google Sheets : <strong>Fichier → Partager → Publier sur le Web → Document entier → Valeurs séparées par des virgules (.csv)</strong>. L'URL <code style={{ color: '#5E9ED6' }}>/pubhtml</code> est automatiquement normalisée en <code style={{ color: '#5E9ED6' }}>/pub?output=csv</code>.
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#8B9CB0', textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>
              URL d'édition (optionnel)
            </label>
            <input type="text" value={editUrlInput} onChange={e => setEditUrlInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/XXXX/edit"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' as const }} />
            <div style={{ fontSize: 11, color: '#8B9CB0', marginTop: 4 }}>
              Permet d'afficher un bouton 📝 Éditer la sheet en haut de cette page.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={saveSheet}
              disabled={savingSheet || (sheetUrl === sheetUrlOriginal && editUrlInput === editUrlOriginal)}
              style={{
                padding: '10px 18px', borderRadius: 8,
                background: (sheetUrl === sheetUrlOriginal && editUrlInput === editUrlOriginal) ? '#1E2D3D' : '#00D4AA',
                color: (sheetUrl === sheetUrlOriginal && editUrlInput === editUrlOriginal) ? '#4A5568' : '#0A0E1A',
                fontSize: 13, fontWeight: 700, border: 'none',
                cursor: (sheetUrl === sheetUrlOriginal && editUrlInput === editUrlOriginal) ? 'default' : 'pointer',
              }}>
              {savingSheet ? '⏳ Enregistrement...' : '💾 Enregistrer'}
            </button>
            {sheetMsg && (
              <span style={{ fontSize: 13, color: sheetMsg.startsWith('✓') ? '#3D7A4F' : '#C0392B' }}>
                {sheetMsg}
              </span>
            )}
          </div>

          {!sheetUrlOriginal && (
            <details style={{ marginTop: 16, fontSize: 12, color: '#8B9CB0' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#A5C9E8' }}>
                📋 Quelles colonnes mettre dans la sheet ?
              </summary>
              <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid #1E2D3D' }}>
                <p style={{ marginBottom: 8 }}>Colonnes obligatoires :</p>
                <code style={{ display: 'block', background: '#0A0E1A', padding: 8, borderRadius: 4, fontSize: 11, color: '#5E9ED6', marginBottom: 8 }}>
                  date_publication, marque, categorie, sentiment, note_globale, cta_url, tarifs
                </code>
                <p style={{ marginBottom: 8 }}>Colonnes optionnelles :</p>
                <code style={{ display: 'block', background: '#0A0E1A', padding: 8, borderRadius: 4, fontSize: 11, color: '#5E9ED6' }}>
                  cta_label, cible, note_trustpilot, nb_avis_trustpilot, plateforme_avis, meta_title, meta_description, link_anchors, slug
                </code>
                <p style={{ marginTop: 12, fontSize: 11 }}>
                  Formats : <strong>date_publication</strong> = <code>YYYY-MM-DD HH:MM</code> (heure de Paris), <em>vide = publication immédiate au prochain passage du cron</em> — <strong>sentiment</strong> = <code>positif</code> / <code>mitige</code> / <code>negatif</code> — <strong>note_globale</strong> = nombre 0–5 (demi-étoiles OK) — <strong>tarifs</strong> = <code>Offre1|Prix1|Features1;Offre2|Prix2|Features2</code>
                </p>
              </div>
            </details>
          )}
        </div>
      )}

      {notConfigured && !showSheetConfig && (
        <div style={card}>
          <div style={sectionTitle}>⚠ Sheet non configurée</div>
          <p style={{ color: '#A5B5C8', fontSize: 14 }}>
            Clique sur <strong>📊 Config sheet</strong> en haut à droite pour ajouter l'URL de ta sheet.
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
              <div key={a.slug} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 8 }}>
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
                {/* Bouton « Éditer » : ouvre la page d'édition complète
                    (frontmatter + tous les champs métier). Sauvegarde via
                    PUT /api/sites/<siteId>/avis/<slug>. */}
                <a href={`/sites/${siteId}/avis/${a.slug}`}
                   style={{ fontSize: 11, color: '#8B9CB0', textDecoration: 'none', padding: '4px 10px', border: '1px solid #1E2D3D', borderRadius: 6 }}>
                  ✏️ Éditer
                </a>
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
