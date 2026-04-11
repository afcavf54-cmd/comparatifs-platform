'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function DataPage() {
  const { siteId } = useParams()
  const [site, setSite] = useState<any>(null)
  const [sheetUrl, setSheetUrl] = useState('')
  const [sheetData, setSheetData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch(`/api/sites/${siteId}`).then(r => r.json()).then(d => {
      setSite(d)
      if (d.sheet_csv_url) {
        setSheetUrl(d.sheet_csv_url)
        loadSheet(d.sheet_csv_url)
      }
    })
  }, [siteId])

  async function loadSheet(url: string) {
    setLoading(true)
    try {
      const r = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      const d = await r.json()
      if (!d.error) setSheetData(d)
      else setMsg('✗ ' + d.error)
    } catch { setMsg('✗ Erreur connexion') }
    setLoading(false)
  }

  async function saveUrl() {
    setSaving(true)
    setMsg('')
    try {
      const r = await fetch(`/api/sites/${siteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sheet_csv_url: sheetUrl }) })
      const d = await r.json()
      if (d.id) { setMsg('✓ URL sauvegardée'); loadSheet(sheetUrl) }
      else setMsg('✗ Erreur')
    } catch { setMsg('✗ Erreur') }
    setSaving(false)
  }

  return (
    <div>
      <div style={{ marginBottom: 24, fontSize: 13, color: '#8B9CB0' }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Sites</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none' }}>{siteId}</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: '#fff' }}>Données</span>
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 24 }}>Source de données</h1>

      {/* Sheet URL config */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Google Sheet CSV</h3>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input
            value={sheetUrl} onChange={e => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
            style={{ flex: 1, padding: '12px 14px', borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none' }}
          />
          <button onClick={() => loadSheet(sheetUrl)} style={{ padding: '12px 16px', borderRadius: 10, background: '#1E2D3D', border: 'none', color: '#00D4AA', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            🔍 Tester
          </button>
          <button onClick={saveUrl} disabled={saving} style={{ padding: '12px 16px', borderRadius: 10, background: 'linear-gradient(135deg, #00D4AA, #0090FF)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            {saving ? '...' : '💾 Sauvegarder'}
          </button>
        </div>
        {msg && <div style={{ fontSize: 13, color: msg.startsWith('✓') ? '#00D4AA' : '#FC8181' }}>{msg}</div>}
        <div style={{ fontSize: 11, color: '#4A5568', marginTop: 8 }}>
          Google Sheet → Fichier → Partager → Publier sur le web → Feuille entière → Format CSV → Copier le lien
        </div>
      </div>

      {/* Sheet preview */}
      {loading && <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 40 }}>Chargement des données...</div>}
      {sheetData && (
        <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ color: '#fff', margin: 0, fontSize: 15, fontWeight: 600 }}>
              Aperçu — <span style={{ color: '#00D4AA' }}>{sheetData.count} produits</span>
            </h3>
            <div style={{ display: 'flex', gap: 6 }}>
              {sheetData.headers.length > 8 && (
                <span style={{ fontSize: 11, color: '#8B9CB0' }}>+{sheetData.headers.length - 8} colonnes cachées</span>
              )}
            </div>
          </div>

          {/* Colonnes détectées */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {sheetData.headers.map((h: string) => (
              <span key={h} style={{ fontSize: 11, background: '#1E2D3D', color: '#8B9CB0', padding: '3px 8px', borderRadius: 6 }}>{h}</span>
            ))}
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #1E2D3D' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#0A0E1A' }}>
                  {sheetData.headers.slice(0, 8).map((h: string) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#8B9CB0', borderBottom: '1px solid #1E2D3D', whiteSpace: 'nowrap', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheetData.rows.map((row: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1E2D3D' }}>
                    {sheetData.headers.slice(0, 8).map((h: string) => (
                      <td key={h} style={{ padding: '9px 12px', color: i % 2 === 0 ? '#E2E8F0' : '#CBD5E0', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row[h] || <span style={{ color: '#4A5568' }}>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sheetData.count > sheetData.rows.length && (
            <div style={{ color: '#4A5568', fontSize: 11, padding: '10px 0 0' }}>Affichage des {sheetData.rows.length} premiers sur {sheetData.count}</div>
          )}
        </div>
      )}
    </div>
  )
}
