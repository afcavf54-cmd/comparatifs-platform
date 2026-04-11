'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const STEPS = ['Infos générales', 'Source de données', 'Configuration', 'Récapitulatif']

const NICHES = [
  { id: 'comparatif', icon: '⚖️', label: 'Comparatif', desc: 'Comparez des produits côte à côte (SCPI, mutuelles, assurances...)' },
  { id: 'classement', icon: '🏆', label: 'Classement', desc: 'Classez des produits ou lieux par critères (top villes, meilleurs hôtels...)' },
  { id: 'autre', icon: '📄', label: 'Autre', desc: 'Site de contenu personnalisé' },
]

export default function NewSitePage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sheetPreview, setSheetPreview] = useState<any>(null)
  const [checkingSheet, setCheckingSheet] = useState(false)

  const [form, setForm] = useState({
    name: '', niche: 'comparatif', domain: '', cloudflare_project: '',
    sheet_csv_url: '', description: '',
    accent: '#1B4FD8', accent2: '#E8410A', bg: '#F7F4EF',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function checkSheet() {
    if (!form.sheet_csv_url) return
    setCheckingSheet(true)
    try {
      const r = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: form.sheet_csv_url }) })
      const d = await r.json()
      if (d.error) setError(d.error)
      else setSheetPreview(d)
    } catch { setError('Erreur connexion Sheet') }
    setCheckingSheet(false)
  }

  async function handleSubmit() {
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/sites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const d = await r.json()
      if (d.error) { setError(d.error); setLoading(false); return }
      router.push(`/sites/${d.site.id}`)
    } catch { setError('Erreur création site'); setLoading(false) }
  }

  const inp = (placeholder: string, key: string, type = 'text') => (
    <input
      type={type} placeholder={placeholder} value={(form as any)[key]}
      onChange={e => set(key, e.target.value)}
      style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
    />
  )

  const label = (text: string) => <div style={{ fontSize: 12, color: '#8B9CB0', marginBottom: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{text}</div>

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none', fontSize: 13 }}>← Retour aux sites</Link>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: '8px 0 4px' }}>Nouveau site</h1>
        <p style={{ color: '#8B9CB0', fontSize: 14 }}>Configurez votre nouveau site en quelques étapes</p>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 32, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden' }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{
            flex: 1, padding: '12px 8px', textAlign: 'center', fontSize: 12, fontWeight: i === step ? 700 : 400,
            color: i === step ? '#fff' : i < step ? '#00D4AA' : '#4A5568',
            background: i === step ? '#1E2D3D' : 'transparent',
            borderRight: i < STEPS.length - 1 ? '1px solid #1E2D3D' : 'none',
            cursor: i < step ? 'pointer' : 'default',
          }} onClick={() => i < step && setStep(i)}>
            <span style={{ marginRight: 6 }}>{i < step ? '✓' : i + 1}</span>{s}
          </div>
        ))}
      </div>

      {/* Card */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 28 }}>

        {/* Step 0 — Infos générales */}
        {step === 0 && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 24, marginTop: 0 }}>Informations générales</h2>
            {label('Nom du site *')}
            {inp('Ex: Comparatifs SCPI, Top Mutuelles...', 'name')}
            {label('Description courte')}
            {inp('Description optionnelle du site', 'description')}
            {label('Type de site *')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
              {NICHES.map(n => (
                <div key={n.id} onClick={() => set('niche', n.id)} style={{
                  padding: 14, borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                  border: form.niche === n.id ? '2px solid #00D4AA' : '2px solid #1E2D3D',
                  background: form.niche === n.id ? 'rgba(0,212,170,0.08)' : 'transparent',
                  transition: 'all 0.15s'
                }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{n.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{n.label}</div>
                  <div style={{ fontSize: 11, color: '#8B9CB0', lineHeight: 1.4 }}>{n.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 1 — Données */}
        {step === 1 && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 24, marginTop: 0 }}>Source de données</h2>
            {label('URL Google Sheet (CSV publié)')}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                value={form.sheet_csv_url} onChange={e => set('sheet_csv_url', e.target.value)}
                style={{ flex: 1, padding: '12px 14px', borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none' }}
              />
              <button onClick={checkSheet} disabled={checkingSheet} style={{
                padding: '12px 16px', borderRadius: 10, background: '#1E2D3D', border: 'none',
                color: '#00D4AA', cursor: 'pointer', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap'
              }}>
                {checkingSheet ? '...' : '🔍 Tester'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#4A5568', marginBottom: 16 }}>
              Fichier → Partager → Publier sur le web → CSV → Copier le lien
            </div>
            {sheetPreview && (
              <div style={{ background: '#0A0E1A', border: '1px solid #00D4AA', borderRadius: 10, padding: 16 }}>
                <div style={{ color: '#00D4AA', fontWeight: 600, marginBottom: 10 }}>✓ {sheetPreview.count} produits détectés</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {sheetPreview.headers.map((h: string) => (
                    <span key={h} style={{ fontSize: 11, background: '#1E2D3D', color: '#8B9CB0', padding: '3px 8px', borderRadius: 6 }}>{h}</span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: 20 }}>
              {label('Projet Cloudflare Pages')}
              {inp('nom-du-projet-cloudflare', 'cloudflare_project')}
              {label('Domaine')}
              {inp('mon-domaine.fr', 'domain')}
            </div>
          </div>
        )}

        {/* Step 2 — Thème */}
        {step === 2 && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 24, marginTop: 0 }}>Configuration visuelle</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                {label('Couleur principale')}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                  <input type="color" value={form.accent} onChange={e => set('accent', e.target.value)}
                    style={{ width: 40, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer' }} />
                  <input value={form.accent} onChange={e => set('accent', e.target.value)}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 }} />
                </div>
              </div>
              <div>
                {label('Couleur secondaire')}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                  <input type="color" value={form.accent2} onChange={e => set('accent2', e.target.value)}
                    style={{ width: 40, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer' }} />
                  <input value={form.accent2} onChange={e => set('accent2', e.target.value)}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 }} />
                </div>
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              {label('Couleur fond')}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.bg} onChange={e => set('bg', e.target.value)}
                  style={{ width: 40, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer' }} />
                <input value={form.bg} onChange={e => set('bg', e.target.value)}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 }} />
              </div>
            </div>
            <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: form.bg }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Aperçu</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ padding: '8px 16px', borderRadius: 8, background: form.accent, color: '#fff', fontSize: 13, fontWeight: 600 }}>Bouton principal</div>
                <div style={{ padding: '8px 16px', borderRadius: 8, background: form.accent2, color: '#fff', fontSize: 13, fontWeight: 600 }}>Bouton secondaire</div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Récap */}
        {step === 3 && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 24, marginTop: 0 }}>Récapitulatif</h2>
            {[
              { label: 'Nom', value: form.name },
              { label: 'Type', value: form.niche },
              { label: 'Domaine', value: form.domain },
              { label: 'Cloudflare', value: form.cloudflare_project || form.name },
              { label: 'Sheet CSV', value: form.sheet_csv_url ? '✓ Configuré' : '⚠ Non configuré' },
              { label: 'Description', value: form.description || '—' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1E2D3D', fontSize: 14 }}>
                <span style={{ color: '#8B9CB0' }}>{row.label}</span>
                <span style={{ color: '#fff', fontWeight: 500 }}>{row.value}</span>
              </div>
            ))}
            <div style={{ marginTop: 20, padding: 16, background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.3)', borderRadius: 10, fontSize: 13, color: '#8B9CB0' }}>
              ✓ Le fichier <code style={{ color: '#00D4AA' }}>config.yaml</code> sera créé dans GitHub. Vous pourrez ensuite éditer les templates et déployer.
            </div>
          </div>
        )}

        {/* Error */}
        {error && <div style={{ color: '#FC8181', fontSize: 13, marginTop: 12, padding: '10px 14px', background: 'rgba(252,129,129,0.08)', borderRadius: 8 }}>{error}</div>}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
          <button onClick={() => step > 0 && setStep(s => s - 1)} disabled={step === 0} style={{
            padding: '10px 20px', borderRadius: 10, background: '#1E2D3D', border: 'none',
            color: step === 0 ? '#4A5568' : '#fff', cursor: step === 0 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 14
          }}>← Précédent</button>

          {step < STEPS.length - 1 ? (
            <button onClick={() => {
              if (step === 0 && !form.name) { setError('Le nom est requis'); return }
              setError('')
              setStep(s => s + 1)
            }} style={{
              padding: '10px 24px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #00D4AA, #0090FF)',
              color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14
            }}>Suivant →</button>
          ) : (
            <button onClick={handleSubmit} disabled={loading} style={{
              padding: '10px 24px', borderRadius: 10, border: 'none',
              background: loading ? '#1E2D3D' : 'linear-gradient(135deg, #00D4AA, #0090FF)',
              color: loading ? '#4A5568' : '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 14
            }}>{loading ? 'Création...' : '🚀 Créer le site'}</button>
          )}
        </div>
      </div>
    </div>
  )
}
