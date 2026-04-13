'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const STEPS = ['Infos generales', 'Source de donnees', 'Configuration', 'Recapitulatif']

export default function NewSitePage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sheetPreview, setSheetPreview] = useState<any>(null)
  const [checkingSheet, setCheckingSheet] = useState(false)

  const [form, setForm] = useState({
    name: '', domain: '', sheet_csv_url: '', description: '',
    logo_text: '', logo_accent: '',
    accent: '#1B4FD8', accent2: '#E8410A', bg: '#F4F6FB',
  })

  const set = (k: string, v: string) => {
    setForm(f => {
      const next = { ...f, [k]: v }
      // Auto-split logo depuis le nom
      if (k === 'name') {
        const parts = v.split(' ')
        next.logo_text = parts[0] || ''
        next.logo_accent = parts.slice(1).join(' ')
      }
      return next
    })
  }

  async function checkSheet() {
    if (!form.sheet_csv_url) return
    setCheckingSheet(true)
    setError('')
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
      router.push(`/sites/${d.site.id}/deploy`)
    } catch { setError('Erreur creation site'); setLoading(false) }
  }

  const inp = (placeholder: string, key: string) => (
    <input
      type="text" placeholder={placeholder} value={(form as any)[key]}
      onChange={e => set(key, e.target.value)}
      style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
    />
  )

  const label = (text: string) => (
    <div style={{ fontSize: 12, color: '#8B9CB0', marginBottom: 6, fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{text}</div>
  )

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none', fontSize: 13 }}>← Retour aux sites</Link>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: '8px 0 4px' }}>Nouveau site</h1>
        <p style={{ color: '#8B9CB0', fontSize: 14 }}>Configurez votre nouveau site comparatif en quelques etapes</p>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 32, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden' }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{
            flex: 1, padding: '12px 8px', textAlign: 'center' as const, fontSize: 12, fontWeight: i === step ? 700 : 400,
            color: i === step ? '#fff' : i < step ? '#00D4AA' : '#4A5568',
            background: i === step ? '#1E2D3D' : 'transparent',
            borderRight: i < STEPS.length - 1 ? '1px solid #1E2D3D' : 'none',
            cursor: i < step ? 'pointer' : 'default',
          }} onClick={() => i < step && setStep(i)}>
            <span style={{ marginRight: 6 }}>{i < step ? '✓' : i + 1}</span>{s}
          </div>
        ))}
      </div>

      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 28 }}>

        {/* Step 0 — Infos */}
        {step === 0 && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 24, marginTop: 0 }}>Informations generales</h2>
            {label('Nom du site *')}
            {inp('Ex: Meilleurs ETF, Comparatifs Mutuelles...', 'name')}
            {label('Description courte')}
            {inp('Description optionnelle', 'description')}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                {label('Logo texte')}
                {inp('Ex: UTL', 'logo_text')}
              </div>
              <div>
                {label('Logo accent (couleur)')}
                {inp('Ex: Peipin', 'logo_accent')}
              </div>
            </div>

            <div style={{ marginTop: 8, padding: 14, background: '#0A0E1A', borderRadius: 10, border: '1px solid #1E2D3D' }}>
              <div style={{ fontSize: 12, color: '#8B9CB0', marginBottom: 8 }}>Apercu logo</div>
              <span style={{ fontFamily: 'serif', fontSize: 22, color: '#fff' }}>
                {form.logo_text || 'Logo'}
                <span style={{ color: accent_preview(form.accent) }}>{form.logo_accent ? ` ${form.logo_accent}` : 'Accent'}</span>
              </span>
            </div>
          </div>
        )}

        {/* Step 1 — Donnees */}
        {step === 1 && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 24, marginTop: 0 }}>Source de donnees et domaine</h2>
            {label('Domaine *')}
            {inp('mon-domaine.fr', 'domain')}

            {label('URL Google Sheet (CSV publie)')}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                value={form.sheet_csv_url} onChange={e => set('sheet_csv_url', e.target.value)}
                style={{ flex: 1, padding: '12px 14px', borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none' }}
              />
              <button onClick={checkSheet} disabled={checkingSheet} style={{
                padding: '12px 16px', borderRadius: 10, background: '#1E2D3D', border: 'none',
                color: '#00D4AA', cursor: 'pointer', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' as const
              }}>
                {checkingSheet ? '...' : 'Tester'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#4A5568', marginBottom: 16 }}>
              Dans Google Sheets : Fichier → Partager → Publier sur le web → CSV → Copier le lien
            </div>
            {sheetPreview && (
              <div style={{ background: '#0A0E1A', border: '1px solid #00D4AA', borderRadius: 10, padding: 16 }}>
                <div style={{ color: '#00D4AA', fontWeight: 600, marginBottom: 10 }}>✓ {sheetPreview.count} produits detectes</div>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                  {sheetPreview.headers.map((h: string) => (
                    <span key={h} style={{ fontSize: 11, background: '#1E2D3D', color: '#8B9CB0', padding: '3px 8px', borderRadius: 6 }}>{h}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2 — Theme */}
        {step === 2 && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 24, marginTop: 0 }}>Configuration visuelle</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              {[
                { key: 'accent', label: 'Couleur principale' },
                { key: 'accent2', label: 'Couleur secondaire' },
                { key: 'bg', label: 'Fond de page' },
              ].map(({ key, label: lbl }) => (
                <div key={key}>
                  {label(lbl)}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="color" value={(form as any)[key]} onChange={e => set(key, e.target.value)}
                      style={{ width: 40, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer' }} />
                    <input value={(form as any)[key]} onChange={e => set(key, e.target.value)}
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, padding: 20, borderRadius: 12, background: form.bg }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>Apercu</div>
              <div style={{ fontFamily: 'serif', fontSize: 24, color: '#0F1A2E', marginBottom: 12 }}>
                {form.logo_text}<span style={{ color: form.accent2 }}>{form.logo_accent ? ` ${form.logo_accent}` : ''}</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ padding: '8px 18px', borderRadius: 8, background: form.accent, color: '#fff', fontSize: 13, fontWeight: 600 }}>Bouton principal</div>
                <div style={{ padding: '8px 18px', borderRadius: 8, background: form.accent2, color: '#fff', fontSize: 13, fontWeight: 600 }}>CTA</div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Recap */}
        {step === 3 && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 24, marginTop: 0 }}>Recapitulatif</h2>
            {[
              { label: 'Nom', value: form.name },
              { label: 'Domaine', value: form.domain },
              { label: 'Logo', value: `${form.logo_text} ${form.logo_accent}`.trim() },
              { label: 'Google Sheet', value: form.sheet_csv_url ? '✓ Configure' : 'Non configure' },
              { label: 'Couleurs', value: `${form.accent} / ${form.accent2}` },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1E2D3D', fontSize: 14 }}>
                <span style={{ color: '#8B9CB0' }}>{row.label}</span>
                <span style={{ color: '#fff', fontWeight: 500 }}>{row.value}</span>
              </div>
            ))}
            <div style={{ marginTop: 20, padding: 16, background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.3)', borderRadius: 10, fontSize: 13, color: '#8B9CB0', lineHeight: 1.6 }}>
              En cliquant sur "Creer le site" :<br />
              ✓ Fichiers crees dans GitHub (config, editoriaux)<br />
              ✓ Contenu IA genere via API (56 appels)<br />
              ✓ Site genere et deploye sur Cloudflare Pages<br />
              <span style={{ color: '#FC8181' }}>Configurez ensuite les DNS Cloudflare sur votre domaine.</span>
            </div>
          </div>
        )}

        {error && <div style={{ color: '#FC8181', fontSize: 13, marginTop: 12, padding: '10px 14px', background: 'rgba(252,129,129,0.08)', borderRadius: 8 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
          <button onClick={() => step > 0 && setStep(s => s - 1)} disabled={step === 0} style={{
            padding: '10px 20px', borderRadius: 10, background: '#1E2D3D', border: 'none',
            color: step === 0 ? '#4A5568' : '#fff', cursor: step === 0 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 14
          }}>← Precedent</button>

          {step < STEPS.length - 1 ? (
            <button onClick={() => {
              if (step === 0 && !form.name) { setError('Le nom est requis'); return }
              if (step === 1 && !form.domain) { setError('Le domaine est requis'); return }
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
            }}>{loading ? 'Creation en cours...' : 'Creer le site'}</button>
          )}
        </div>
      </div>
    </div>
  )
}

function accent_preview(color: string) {
  return color || '#E8410A'
}
