'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Site {
  id: string; name: string; niche: string; domain: string
  status: string; created_at: string; last_deployed?: string
  pages_count?: number; products_count?: number; description?: string
  sheet_csv_url?: string; cloudflare_project?: string
}

const STATUS_COLORS: Record<string, string> = {
  live: '#00D4AA', draft: '#8B9CB0', building: '#F6AD55', error: '#FC8181'
}

export default function SiteDetailPage() {
  const { siteId } = useParams()
  const router = useRouter()
  const [site, setSite] = useState<Site | null>(null)
  const [loading, setLoading] = useState(true)
  const [deploying, setDeploying] = useState(false)
  const [deployMsg, setDeployMsg] = useState('')
  const [runs, setRuns] = useState<any[]>([])
  const [sheetData, setSheetData] = useState<any>(null)
  const [pageTypes, setPageTypes] = useState<Record<string, string>>({})
  const [analyticsClicky, setAnalyticsClicky] = useState('')
  const [googleVerification, setGoogleVerification] = useState('')
  const [linkavistaVerification, setLinkavistaVerification] = useState('')
  const [rocketlinkVerification, setRocketlinkVerification] = useState('')
  const [develinkVerification, setDevelinkVerification] = useState('')
  const [contactFormKey, setContactFormKey] = useState('')
  const [savingTracking, setSavingTracking] = useState(false)
  const [trackingMsg, setTrackingMsg] = useState('')

  useEffect(() => {
    fetch(`/api/sites/${siteId}`).then(r => r.json()).then(d => {
      setSite(d)
      setLoading(false)
      if (d.sheet_csv_url) loadSheet(d.sheet_csv_url)
    }).catch(() => setLoading(false))

    fetch('/api/deploy').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setRuns(d.slice(0, 5))
    })

    fetch(`/api/sites/${siteId}/config`).then(r => r.json()).then(d => {
      if (d.page_types) setPageTypes(d.page_types)
      if (d.analytics_clicky) setAnalyticsClicky(d.analytics_clicky)
      if (d.google_site_verification) setGoogleVerification(d.google_site_verification)
      if (d.linkavista_verification) setLinkavistaVerification(d.linkavista_verification)
      if (d.rocketlink_verification) setRocketlinkVerification(d.rocketlink_verification)
      if (d.develink_verification) setDevelinkVerification(d.develink_verification)
      if (d.contact_form_key) setContactFormKey(d.contact_form_key)
    }).catch(() => {})
  }, [siteId])

  async function loadSheet(url: string) {
    try {
      const r = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      const d = await r.json()
      if (!d.error) setSheetData(d)
    } catch {}
  }

  async function saveTracking() {
    setSavingTracking(true); setTrackingMsg('')
    const r = await fetch(`/api/sites/${siteId}/config`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        analytics_clicky: analyticsClicky,
        google_site_verification: googleVerification,
        linkavista_verification: linkavistaVerification,
        rocketlink_verification: rocketlinkVerification,
        develink_verification: develinkVerification,
        contact_form_key: contactFormKey,
      })
    })
    const d = await r.json()
    setTrackingMsg(d.ok ? '✓ Sauvegardé' : '✗ Erreur')
    setSavingTracking(false)
    setTimeout(() => setTrackingMsg(''), 3000)
  }

  async function deploy() {
    setDeploying(true); setDeployMsg('')
    try {
      const r = await fetch('/api/deploy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // skip_enrich: true — ne jamais régénérer le contenu IA depuis ce bouton
        body: JSON.stringify({ siteId, workflowFile: 'generate-scpi.yml', skip_enrich: true })
      })
      const d = await r.json()
      if (d.ok) {
        setDeployMsg('✓ Workflow déclenché - déploiement en cours (~3 min)')
        const updated = { ...site!, status: 'building', last_deployed: new Date().toISOString() }
        setSite(updated)
        await fetch(`/api/sites/${siteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'building', last_deployed: new Date().toISOString() }) })
      } else {
        setDeployMsg('✗ ' + (d.error || 'Erreur inconnue'))
      }
    } catch { setDeployMsg('✗ Erreur réseau') }
    setDeploying(false)
  }

  if (loading) return <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 60 }}>Chargement...</div>
  if (!site) return <div style={{ color: '#FC8181', textAlign: 'center', padding: 60 }}>Site introuvable</div>

  return (
    <div>
      <div style={{ marginBottom: 24, fontSize: 13, color: '#8B9CB0' }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Sites</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: '#fff' }}>{site.name}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>{site.name}</h1>
            <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, color: STATUS_COLORS[site.status] || '#8B9CB0', background: `${STATUS_COLORS[site.status]}20` }}>
              ● {site.status}
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#8B9CB0' }}>
            <a href={`https://${site.domain}`} target="_blank" rel="noopener noreferrer" style={{ color: '#00D4AA', textDecoration: 'none' }}>
              {site.domain} ↗
            </a>
          </div>
        </div>
      </div>

      {deployMsg && (
        <div style={{ marginBottom: 20, padding: '10px 16px', borderRadius: 10, background: deployMsg.startsWith('✓') ? 'rgba(0,212,170,0.1)' : 'rgba(252,129,129,0.1)', color: deployMsg.startsWith('✓') ? '#00D4AA' : '#FC8181', fontSize: 13 }}>
          {deployMsg}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Pages générées', value: site.pages_count || 0, icon: '📄', color: '#0090FF' },
          { label: 'Produits', value: sheetData?.count || site.products_count || 0, icon: '📦', color: '#00D4AA' },
          { label: 'Comparatifs', value: (() => { const n = sheetData?.count || 0; return Math.floor(n * (n - 1) / 2) })(), icon: '⚖️', color: '#F6AD55' },
          { label: 'Dernière MAJ', value: site.last_deployed ? new Date(site.last_deployed).toLocaleDateString('fr') : '-', icon: '🕐', color: '#8B9CB0' },
        ].map(stat => (
          <div key={stat.label} style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{stat.icon}</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</span>
            </div>
            <div style={{ fontSize: 11, color: '#4A5568', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Body grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 24 }}>
          <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Actions rapides</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: '📄', label: 'Éditer les templates', href: `/sites/${siteId}/templates` },
              { icon: '🗂', label: 'Voir les données', href: `/sites/${siteId}/data` },
              { icon: '✍️', label: "Gérer l'éditorial", href: `/sites/${siteId}/editorial` },
              ...(pageTypes.classement ? [{ icon: '📊', label: 'Gérer les classements', href: `/sites/${siteId}/classements` }] : []),
              { icon: '📝', label: 'Gérer le blog', href: `/sites/${siteId}/blog` },
              ...(siteId === 'monelor-com' ? [{ icon: '💰', label: 'Simulation de dividendes', href: `/sites/${siteId}/dividendes` }] : []),
              { icon: '⚙️', label: 'Paramètres du site', href: `/sites/${siteId}/settings` },
            ].map(action => (
              <Link key={action.href} href={action.href} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', textDecoration: 'none', fontSize: 13, transition: 'all 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#00D4AA')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#1E2D3D')}>
                <span>{action.icon}</span>{action.label}
              </Link>
            ))}
          </div>
        </div>

        <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 24 }}>
          <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Déploiements récents</h3>
          {runs.length === 0 ? (
            <div style={{ color: '#4A5568', fontSize: 13 }}>Aucun déploiement</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {runs.map(run => (
                <a key={run.id} href={run.html_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#fff', marginBottom: 2 }}>{run.head_commit?.message?.slice(0, 40) || run.name}</div>
                      <div style={{ fontSize: 11, color: '#4A5568' }}>{new Date(run.created_at).toLocaleString('fr')}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, color: run.conclusion === 'success' ? '#00D4AA' : run.status === 'in_progress' ? '#F6AD55' : '#FC8181', background: run.conclusion === 'success' ? 'rgba(0,212,170,0.12)' : run.status === 'in_progress' ? 'rgba(246,173,85,0.12)' : 'rgba(252,129,129,0.12)' }}>
                      {run.conclusion || run.status}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Tracking & Vérification */}
        <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 24, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ color: '#fff', margin: 0, fontSize: 15, fontWeight: 600 }}>📡 Tracking & Vérification</h3>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {trackingMsg && <span style={{ fontSize: 12, color: trackingMsg.startsWith('✓') ? '#00D4AA' : '#FC8181' }}>{trackingMsg}</span>}
              <button onClick={saveTracking} disabled={savingTracking} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {savingTracking ? '...' : '💾 Sauvegarder'}
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>📊 Clicky Analytics</div>
              <textarea value={analyticsClicky} onChange={e => setAnalyticsClicky(e.target.value)}
                placeholder={'<script async data-id="101505110" src="//static.getclicky.com/js"></script>'}
                rows={3} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'monospace', resize: 'vertical', lineHeight: 1.5 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>🔍 Google Search Console</div>
              <input value={googleVerification} onChange={e => setGoogleVerification(e.target.value)}
                placeholder="8qExRLvDtjV8AY9eKfy1-yNAgx7JTZAPDM-Cs4CE4WU"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>✉️ Clé Web3Forms (formulaire de contact)</div>
              <input value={contactFormKey} onChange={e => setContactFormKey(e.target.value)}
                placeholder="ex: a1b2c3d4-e5f6-7890-abcd-ef1234567890"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'monospace' }} />
              <div style={{ fontSize: 11, color: '#4A5568', marginTop: 6, lineHeight: 1.5 }}>
                Crée une clé gratuite sur <a href="https://web3forms.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#00D4AA', textDecoration: 'none' }}>web3forms.com</a> en renseignant <code style={{ color: '#00D4AA' }}>contact@viseoweb.fr</code> comme email destinataire. Sans clé, la page /contact affiche juste un mailto.
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #1E2D3D', paddingTop: 18, marginTop: 4 }}>
              <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, marginBottom: 4 }}>🔗 Vente de lien</div>
              <div style={{ fontSize: 11, color: '#4A5568', marginBottom: 14, lineHeight: 1.5 }}>
                Codes de vérification des plateformes de vente de liens. Le meta correspondant est injecté dans le <code style={{ color: '#00D4AA' }}>{'<head>'}</code> de la page d'accueil au build, pour prouver la possession du site.
              </div>
              <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>🟣 Linkavista</div>
              <input value={linkavistaVerification} onChange={e => setLinkavistaVerification(e.target.value)}
                placeholder="d92294280149faa1d5064096a735a59c5ea6350b"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'monospace' }} />
              <div style={{ fontSize: 11, color: '#4A5568', marginTop: 6, lineHeight: 1.5 }}>
                Colle le hash seul, ou le tag complet <code style={{ color: '#00D4AA' }}>{'<meta name="linkavista" content="…">'}</code> fourni par Linkavista — seul le contenu est conservé. Au build, il est injecté tel que <code style={{ color: '#00D4AA' }}>{'<meta name="linkavista" content="…">'}</code> dans la home.
              </div>
              <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '16px 0 8px' }}>🚀 Rocketlink</div>
              <input value={rocketlinkVerification} onChange={e => setRocketlinkVerification(e.target.value)}
                placeholder="97ec5dc3c934ab42"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'monospace' }} />
              <div style={{ fontSize: 11, color: '#4A5568', marginTop: 6, lineHeight: 1.5 }}>
                Colle le code seul, ou le commentaire complet <code style={{ color: '#00D4AA' }}>{'<!-- 97ec5dc3c934ab42 -->'}</code> fourni par Rocketlink. Au build, il est injecté en commentaire HTML <code style={{ color: '#00D4AA' }}>{'<!-- … -->'}</code> dans la home (invisible pour les visiteurs).
              </div>
              <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '16px 0 8px' }}>🟢 Develink</div>
              <input value={develinkVerification} onChange={e => setDevelinkVerification(e.target.value)}
                placeholder="6a6b4dd9c7ef6-5khUcrKz"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'monospace' }} />
              <div style={{ fontSize: 11, color: '#4A5568', marginTop: 6, lineHeight: 1.5 }}>
                Colle le code seul, ou le tag complet <code style={{ color: '#00D4AA' }}>{'<meta name="verify" content="…">'}</code> fourni par Develink. Au build, il est injecté tel que <code style={{ color: '#00D4AA' }}>{'<meta name="verify" content="…">'}</code> dans la home.
              </div>
            </div>
          </div>
        </div>

        {sheetData && (
          <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 24, gridColumn: '1 / -1' }}>
            <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Données Sheet - {sheetData.count} produits détectés</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr>{sheetData.headers.slice(0, 8).map((h: string) => (<th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#8B9CB0', borderBottom: '1px solid #1E2D3D', whiteSpace: 'nowrap' }}>{h}</th>))}</tr></thead>
                <tbody>{sheetData.rows.slice(0, 5).map((row: any, i: number) => (<tr key={i}>{sheetData.headers.slice(0, 8).map((h: string) => (<td key={h} style={{ padding: '8px 12px', color: '#fff', borderBottom: '1px solid #1E2D3D', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[h] || '-'}</td>))}</tr>))}</tbody>
              </table>
              {sheetData.count > 5 && <div style={{ color: '#4A5568', fontSize: 11, padding: '8px 12px' }}>+ {sheetData.count - 5} autres produits</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
