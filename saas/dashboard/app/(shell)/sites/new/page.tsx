'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type SiteType = '' | 'comparatif' | 'classement'

const STEPS_COMPARATIF = ['Type', 'Infos', 'Domaine', 'Modèles', 'SEO', 'Visuel', 'Récap']
const STEPS_CLASSEMENT = ['Type', 'Infos', 'Domaine', 'Modèles', 'Visuel', 'Récap']

export default function NewSitePage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [siteType, setSiteType] = useState<SiteType>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sheetPreview, setSheetPreview] = useState<any>(null)
  const [checkingSheet, setCheckingSheet] = useState(false)
  const [availableSchemas, setAvailableSchemas] = useState<any[]>([])

  const STEPS = siteType === 'classement' ? STEPS_CLASSEMENT : STEPS_COMPARATIF

  const [form, setForm] = useState({
    name: '', domain: '', sheet_csv_url: '', description: '',
    logo_text: '', logo_accent: '',
    accent: '#1B4FD8', accent2: '#E8410A', bg: '#F4F6FB',
    www_preference: 'www',
    home_title: '', home_description: '',
    seo_vs_title: '{A} vs {B} : comparatif {year}',
    seo_vs_meta: 'Comparatif complet {A} vs {B} {year} : rendements, frais, avis.',
    seo_avis_title: 'Avis {nom} {year} : faut-il investir ?',
    seo_avis_meta: 'Notre avis complet sur {nom} {year} : rendement {td}%, frais, points forts et risques.',
    seo_liste_comp_title: 'Tous les comparatifs {site_name} {year}',
    seo_liste_avis_title: 'Avis {site_name} {year} : analyses indépendantes',
  })

  const [pageTypes, setPageTypes] = useState<Record<string, string>>({ avis: '', vs: '', local: '', classement: '' })

  useEffect(() => {
    fetch('/api/github?path=platform/schemas').then(r => r.json()).then(async (files) => {
      if (!Array.isArray(files)) return
      const schemas = await Promise.all(files.filter((f: any) => f.name.endsWith('.json')).map(async (f: any) => {
        const r = await fetch(`/api/github?path=${encodeURIComponent(f.path)}`)
        const d = await r.json()
        try { return { ...JSON.parse(d.content), filename: f.name.replace('.json', '') } } catch { return null }
      }))
      setAvailableSchemas(schemas.filter(Boolean))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (siteType === 'classement') {
      const s = availableSchemas.find(s => s.type === 'classement')
      if (s) setPageTypes(prev => ({ ...prev, classement: s.filename }))
    } else if (siteType === 'comparatif') {
      const vs = availableSchemas.find(s => s.type === 'vs')
      const avis = availableSchemas.find(s => s.type === 'avis')
      setPageTypes(prev => ({ ...prev, vs: vs?.filename || '', avis: avis?.filename || '' }))
    }
  }, [siteType, availableSchemas])

  const set = (k: string, v: string) => {
    setForm(f => {
      const next = { ...f, [k]: v }
      if (k === 'name') { const parts = v.split(' '); next.logo_text = parts[0] || ''; next.logo_accent = parts.slice(1).join(' ') }
      return next
    })
  }

  async function checkSheet() {
    if (!form.sheet_csv_url) return
    setCheckingSheet(true); setError('')
    try {
      const r = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: form.sheet_csv_url }) })
      const d = await r.json()
      if (d.error) setError(d.error); else setSheetPreview(d)
    } catch { setError('Erreur connexion Sheet') }
    setCheckingSheet(false)
  }

  async function handleSubmit() {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/sites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, page_types: pageTypes, site_type: siteType })
      })
      const d = await r.json()
      if (d.error) { setError(d.error); setLoading(false); return }
      router.push(`/sites/${d.site.id}`)
    } catch { setError('Erreur création site'); setLoading(false) }
  }

  const inp = (placeholder: string, key: string) => (
    <input type="text" placeholder={placeholder} value={(form as any)[key]} onChange={e => set(key, e.target.value)}
      style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, marginBottom: 12 }} />
  )
  const seoInp = (placeholder: string, key: string) => (
    <input type="text" placeholder={placeholder} value={(form as any)[key]} onChange={e => set(key, e.target.value)}
      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' as const, marginBottom: 10 }} />
  )
  const lbl = (text: string) => (
    <div style={{ fontSize: 12, color: '#8B9CB0', marginBottom: 6, fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{text}</div>
  )

  const si = (name: string) => STEPS.indexOf(name)

  const canNext = () => {
    if (step === 0 && !siteType) { setError('Choisissez un type de site'); return false }
    if (step === si('Infos') && !form.name) { setError('Le nom est requis'); return false }
    if (step === si('Domaine') && !form.domain) { setError('Le domaine est requis'); return false }
    setError(''); return true
  }

  const typeCard = (type: SiteType, icon: string, title: string, desc: string, examples: string[]) => (
    <div onClick={() => { setSiteType(type); setError('') }} style={{ flex: 1, padding: 24, borderRadius: 16, cursor: 'pointer', border: siteType === type ? '2px solid #00D4AA' : '2px solid #1E2D3D', background: siteType === type ? 'rgba(0,212,170,0.06)' : '#0A0E1A', transition: 'all .15s' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#8B9CB0', lineHeight: 1.6, marginBottom: 14 }}>{desc}</div>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
        {examples.map(e => <div key={e} style={{ fontSize: 11, color: '#4A5568', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: siteType === type ? '#00D4AA' : '#1E2D3D' }}>→</span> {e}</div>)}
      </div>
      {siteType === type && <div style={{ marginTop: 16, fontSize: 12, fontWeight: 600, color: '#00D4AA' }}>✓ Sélectionné</div>}
    </div>
  )

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none', fontSize: 13 }}>← Retour aux sites</Link>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: '8px 0 4px' }}>Nouveau site</h1>
        <p style={{ color: '#8B9CB0', fontSize: 14 }}>{siteType ? `${STEPS.length} étapes` : 'Choisissez le type de site'}</p>
      </div>

      {siteType && (
        <div style={{ display: 'flex', gap: 0, marginBottom: 32, background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 12, overflow: 'hidden' }}>
          {STEPS.map((s, i) => (
            <div key={s} onClick={() => i < step && setStep(i)} style={{ flex: 1, padding: '12px 8px', textAlign: 'center' as const, fontSize: 11, fontWeight: i === step ? 700 : 400, color: i === step ? '#fff' : i < step ? '#00D4AA' : '#4A5568', background: i === step ? '#1E2D3D' : 'transparent', borderRight: i < STEPS.length - 1 ? '1px solid #1E2D3D' : 'none', cursor: i < step ? 'pointer' : 'default' }}>
              <span style={{ marginRight: 4 }}>{i < step ? '✓' : i + 1}</span>{s}
            </div>
          ))}
        </div>
      )}

      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 28 }}>

        {step === 0 && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 8, marginTop: 0 }}>Quel type de site ?</h2>
            <p style={{ color: '#8B9CB0', fontSize: 13, marginBottom: 24 }}>Le type détermine la structure du site et les étapes de configuration.</p>
            <div style={{ display: 'flex', gap: 16 }}>
              {typeCard('comparatif', '⚖️', 'Site Comparatif', 'Pages A vs B, pages avis produit. Idéal pour SCPI, assurances, banques, mutuelles.', ['Iroko Zen vs Wemo One', 'Avis Remake Live', 'Comparatif SCPI 2026'])}
              {typeCard('classement', '📊', 'Site Classement', 'Pages classement par catégorie, moteur de recherche. Idéal pour logiciels SaaS.', ['Meilleur logiciel de paie', 'Top logiciels comptabilité', 'Comparateur CRM 2026'])}
            </div>
          </div>
        )}

        {step === si('Infos') && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 24, marginTop: 0 }}>Informations générales</h2>
            {lbl('Nom du site *')}{inp('Ex: Comparateur Logiciels Pro...', 'name')}
            {lbl('Description courte')}{inp('Description optionnelle', 'description')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>{lbl('Logo texte')}{inp('Ex: Meilleurs', 'logo_text')}</div>
              <div>{lbl('Logo accent')}{inp('Ex: SaaS', 'logo_accent')}</div>
            </div>
            <div style={{ padding: 14, background: '#0A0E1A', borderRadius: 10, border: '1px solid #1E2D3D' }}>
              <div style={{ fontSize: 12, color: '#8B9CB0', marginBottom: 8 }}>Aperçu logo</div>
              <span style={{ fontFamily: 'serif', fontSize: 22, color: '#fff' }}>{form.logo_text || 'Logo'}<span style={{ color: form.accent }}>{form.logo_accent ? ` ${form.logo_accent}` : ' Accent'}</span></span>
            </div>
          </div>
        )}

        {step === si('Domaine') && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 24, marginTop: 0 }}>Domaine{siteType === 'comparatif' ? ' et source de données' : ''}</h2>
            {lbl('Domaine *')}{inp('mon-domaine.fr', 'domain')}
            {lbl('Version canonique')}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              {[{ val: 'www', label: 'www.monsite.fr' }, { val: 'naked', label: 'monsite.fr' }].map(opt => (
                <div key={opt.val} onClick={() => set('www_preference', opt.val)} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, cursor: 'pointer', border: form.www_preference === opt.val ? '2px solid #00D4AA' : '2px solid #1E2D3D', background: form.www_preference === opt.val ? 'rgba(0,212,170,0.08)' : 'transparent' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{opt.label}</div>
                </div>
              ))}
            </div>
            {siteType === 'comparatif' && (
              <>
                {lbl('URL Google Sheet (CSV publié) *')}
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv" value={form.sheet_csv_url} onChange={e => set('sheet_csv_url', e.target.value)}
                    style={{ flex: 1, padding: '12px 14px', borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none' }} />
                  <button onClick={checkSheet} disabled={checkingSheet} style={{ padding: '12px 16px', borderRadius: 10, background: '#1E2D3D', border: 'none', color: '#00D4AA', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{checkingSheet ? '...' : 'Tester'}</button>
                </div>
                <div style={{ fontSize: 11, color: '#4A5568', marginBottom: 16 }}>Fichier → Partager → Publier sur le web → CSV</div>
                {sheetPreview && (
                  <div style={{ background: '#0A0E1A', border: '1px solid #00D4AA', borderRadius: 10, padding: 16 }}>
                    <div style={{ color: '#00D4AA', fontWeight: 600, marginBottom: 10 }}>✓ {sheetPreview.count} produits détectés</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>{sheetPreview.headers.map((h: string) => (<span key={h} style={{ fontSize: 11, background: '#1E2D3D', color: '#8B9CB0', padding: '3px 8px', borderRadius: 6 }}>{h}</span>))}</div>
                  </div>
                )}
              </>
            )}
            {siteType === 'classement' && (
              <div style={{ padding: 16, background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 10, fontSize: 13, color: '#8B9CB0', lineHeight: 1.7 }}>
                💡 Les Google Sheets se configurent par type de logiciel depuis <strong style={{ color: '#fff' }}>Modèles → Mots clés</strong>. Pas de Sheet global nécessaire ici.
              </div>
            )}
          </div>
        )}

        {step === si('Modèles') && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 8, marginTop: 0 }}>Modèles de pages</h2>
            <p style={{ color: '#8B9CB0', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
              {siteType === 'classement' ? 'Le modèle classement a été pré-sélectionné.' : 'Choisissez les modèles pour chaque type de page.'}
            </p>
            {siteType === 'classement' ? (
              availableSchemas.filter(s => s.type === 'classement').map(s => (
                <div key={s.filename} style={{ padding: 20, borderRadius: 12, border: '2px solid #00D4AA', background: 'rgba(0,212,170,0.06)', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(159,122,234,0.2)', color: '#9F7AEA', fontWeight: 700 }}>classement</span>
                    <span style={{ fontSize: 11, color: '#00D4AA' }}>✓ Sélectionné</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 12, color: '#8B9CB0' }}>{s.description}</div>
                </div>
              ))
            ) : (
              ['avis', 'vs', 'local'].map(type => {
                const schemas = availableSchemas.filter(s => s.type === type)
                return (
                  <div key={type} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{type === 'vs' ? 'Comparatif (A vs B)' : type === 'avis' ? 'Pages avis' : 'Pages locales'}</div>
                      {pageTypes[type] && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(0,212,170,0.15)', color: '#00D4AA' }}>✓</span>}
                    </div>
                    {schemas.length === 0 ? (
                      <div style={{ padding: '12px 16px', borderRadius: 10, border: '1px dashed #1E2D3D', color: '#4A5568', fontSize: 13 }}>Aucun modèle disponible</div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                        <div onClick={() => setPageTypes(prev => ({ ...prev, [type]: '' }))} style={{ padding: '12px 16px', borderRadius: 10, cursor: 'pointer', border: '2px solid #1E2D3D', background: !pageTypes[type] ? 'rgba(255,255,255,0.03)' : 'transparent', color: '#4A5568', fontSize: 13 }}>— Non utilisé</div>
                        {schemas.map(s => (
                          <div key={s.filename} onClick={() => setPageTypes(prev => ({ ...prev, [type]: s.filename }))} style={{ padding: '12px 16px', borderRadius: 10, cursor: 'pointer', border: pageTypes[type] === s.filename ? '2px solid #00D4AA' : '2px solid #1E2D3D', background: pageTypes[type] === s.filename ? 'rgba(0,212,170,0.08)' : 'transparent' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{s.label}</div>
                            <div style={{ fontSize: 11, color: '#4A5568' }}>{s.blocks?.length} blocs · {s.filename}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {siteType === 'comparatif' && step === si('SEO') && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 24, marginTop: 0 }}>SEO</h2>
            <div style={{ fontSize: 11, color: '#4A5568', marginBottom: 16 }}>Variables : <code style={{ color: '#00D4AA' }}>{'{A}'}</code> <code style={{ color: '#00D4AA' }}>{'{B}'}</code> <code style={{ color: '#00D4AA' }}>{'{nom}'}</code> <code style={{ color: '#00D4AA' }}>{'{year}'}</code> <code style={{ color: '#00D4AA' }}>{'{site_name}'}</code></div>
            <div style={{ fontSize: 12, color: '#00D4AA', fontWeight: 600, marginBottom: 8 }}>Page d'accueil</div>
            {lbl('Meta title')}{seoInp('Comparateur 2026...', 'home_title')}
            {lbl('Meta description')}{seoInp('Comparez les meilleures...', 'home_description')}
            <div style={{ fontSize: 12, color: '#0090FF', fontWeight: 600, margin: '16px 0 8px' }}>Pages comparatifs</div>
            {lbl('Title pattern')}{seoInp('{A} vs {B} : comparatif {year}', 'seo_vs_title')}
            {lbl('Meta pattern')}{seoInp('Comparatif complet {A} vs {B}...', 'seo_vs_meta')}
            <div style={{ fontSize: 12, color: '#9F7AEA', fontWeight: 600, margin: '16px 0 8px' }}>Pages avis</div>
            {lbl('Title pattern')}{seoInp('Avis {nom} {year}...', 'seo_avis_title')}
            {lbl('Meta pattern')}{seoInp('Notre avis complet sur {nom}...', 'seo_avis_meta')}
            <div style={{ fontSize: 12, color: '#F6AD55', fontWeight: 600, margin: '16px 0 8px' }}>Listes</div>
            {lbl('Title liste comparatifs')}{seoInp('Tous les comparatifs {site_name} {year}', 'seo_liste_comp_title')}
            {lbl('Title liste avis')}{seoInp('Avis {site_name} {year}', 'seo_liste_avis_title')}
          </div>
        )}

        {step === si('Visuel') && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 24, marginTop: 0 }}>Configuration visuelle</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
              {[{ key: 'accent', label: 'Couleur principale' }, { key: 'accent2', label: 'Couleur secondaire' }, { key: 'bg', label: 'Fond de page' }].map(({ key, label: lbl2 }) => (
                <div key={key}>
                  <div style={{ fontSize: 12, color: '#8B9CB0', marginBottom: 6, fontWeight: 500, textTransform: 'uppercase' as const }}>{lbl2}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="color" value={(form as any)[key]} onChange={e => set(key, e.target.value)} style={{ width: 40, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer' }} />
                    <input value={(form as any)[key]} onChange={e => set(key, e.target.value)} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none' }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: 20, borderRadius: 12, background: form.bg }}>
              <div style={{ fontFamily: 'serif', fontSize: 24, color: '#0F1A2E', marginBottom: 12 }}>{form.logo_text}<span style={{ color: form.accent2 }}>{form.logo_accent ? ` ${form.logo_accent}` : ''}</span></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ padding: '8px 18px', borderRadius: 8, background: form.accent, color: '#fff', fontSize: 13, fontWeight: 600 }}>Bouton principal</div>
                <div style={{ padding: '8px 18px', borderRadius: 8, background: form.accent2, color: '#fff', fontSize: 13, fontWeight: 600 }}>CTA</div>
              </div>
            </div>
          </div>
        )}

        {step === si('Récap') && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 24, marginTop: 0 }}>Récapitulatif</h2>
            {[
              { label: 'Type', value: siteType === 'classement' ? '📊 Classement SaaS' : '⚖️ Comparatif' },
              { label: 'Nom', value: form.name },
              { label: 'Domaine', value: form.domain },
              { label: 'Logo', value: `${form.logo_text} ${form.logo_accent}`.trim() },
              { label: 'Google Sheet', value: siteType === 'classement' ? 'Par catégorie (à configurer)' : form.sheet_csv_url ? '✓ Configuré' : 'Non configuré' },
              { label: 'URL canonique', value: form.www_preference === 'www' ? `www.${form.domain}` : form.domain },
              { label: 'Modèles', value: Object.entries(pageTypes).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ') || 'Aucun' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1E2D3D', fontSize: 14 }}>
                <span style={{ color: '#8B9CB0' }}>{row.label}</span>
                <span style={{ color: '#fff', fontWeight: 500 }}>{row.value}</span>
              </div>
            ))}
            <div style={{ marginTop: 20, padding: 16, background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.3)', borderRadius: 10, fontSize: 13, color: '#8B9CB0', lineHeight: 1.6 }}>
              ✓ Fichiers créés dans GitHub<br />
              {siteType === 'comparatif' && <>✓ Contenu IA généré<br /></>}
              ✓ Site déployé sur Cloudflare Pages<br />
              <span style={{ color: '#FC8181' }}>Configurez ensuite les DNS Cloudflare sur votre domaine.</span>
            </div>
          </div>
        )}

        {error && <div style={{ color: '#FC8181', fontSize: 13, marginTop: 12, padding: '10px 14px', background: 'rgba(252,129,129,0.08)', borderRadius: 8 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
          <button onClick={() => step > 0 && setStep(s => s - 1)} disabled={step === 0} style={{ padding: '10px 20px', borderRadius: 10, background: '#1E2D3D', border: 'none', color: step === 0 ? '#4A5568' : '#fff', cursor: step === 0 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 14 }}>← Précédent</button>
          {step < STEPS.length - 1 ? (
            <button onClick={() => { if (canNext()) setStep(s => s + 1) }} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Suivant →</button>
          ) : (
            <button onClick={handleSubmit} disabled={loading} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: loading ? '#1E2D3D' : 'linear-gradient(135deg, #00D4AA, #0090FF)', color: loading ? '#4A5568' : '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 14 }}>{loading ? 'Création en cours...' : '✓ Créer le site'}</button>
          )}
        </div>
      </div>
    </div>
  )
}
