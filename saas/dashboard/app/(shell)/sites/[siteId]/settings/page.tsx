'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SettingsPage() {
  const { siteId } = useParams()
  const router = useRouter()
  const [site, setSite] = useState<any>(null)
  const [form, setForm] = useState<any>({})
  const [themeForm, setThemeForm] = useState({ accent: '#2563EB', accent2: '#F59E0B', bg: '#F8FAFC', ink: '#0F172A', cta_color: '#F59E0B', cta_text_color: '#ffffff' })
  const [savingTheme, setSavingTheme] = useState(false)
  const [msgTheme, setMsgTheme] = useState('')
  const [seoForm, setSeoForm] = useState({ home_title: '', home_description: '', home_h1: '', seo_vs_title: '{A} vs {B} : comparatif {year}', seo_vs_meta: 'Comparatif complet {A} vs {B} {year} : rendements, frais, avis.', seo_avis_title: 'Avis {nom} {year} : faut-il investir ?', seo_avis_meta: 'Notre avis complet sur {nom} {year} : rendement {td}%, frais, points forts et risques.', seo_liste_comp_title: 'Tous les comparatifs {site_name} {year}', seo_liste_avis_title: 'Avis {site_name} {year} : analyses independantes', www_preference: 'www' })
  const [pageTypes, setPageTypes] = useState<Record<string, string>>({})
  const [availableSchemas, setAvailableSchemas] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [savingSeo, setSavingSeo] = useState(false)
  const [deployingSeo, setDeployingSeo] = useState(false)
  const [savingPageTypes, setSavingPageTypes] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [faviconFile, setFaviconFile] = useState<File | null>(null)
  const [uploadingFavicon, setUploadingFavicon] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [msgLogo, setMsgLogo] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [msgSeo, setMsgSeo] = useState('')
  const [msgPageTypes, setMsgPageTypes] = useState('')
  const [msgFavicon, setMsgFavicon] = useState('')
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null)
  const [authorPhotoPreview, setAuthorPhotoPreview] = useState<string | null>(null)
  const [authorName, setAuthorName] = useState('')
  const [authorBio, setAuthorBio] = useState('')
  const [authorJob, setAuthorJob] = useState('')
  const [authorSocials, setAuthorSocials] = useState<{label: string, url: string}[]>([])
  const [confirmDelete, setConfirmDelete] = useState('')

  useEffect(() => {
    fetch(`/api/sites/${siteId}`).then(r => r.json()).then(d => {
      setSite(d)
      setForm({ name: d.name, domain: d.domain, cloudflare_project: d.cloudflare_project, description: d.description || '', status: d.status, sheet_csv_url: d.sheet_csv_url || '' })
    })
    // Charger logo et favicon via URL raw GitHub (GET avec Image)
    const rawBase = `https://raw.githubusercontent.com/afcavf54-cmd/comparatifs-platform/main`
    const ts = Date.now()

    // Essayer chaque extension pour le logo
    const logoExts = ['png', 'svg', 'jpg', 'webp']
    let logoFound = false
    logoExts.forEach(ext => {
      if (logoFound) return
      const url = `${rawBase}/platform/sites/${siteId}/public/logo.${ext}?t=${ts}`
      const img = new Image()
      img.onload = () => { if (!logoFound) { logoFound = true; setLogoPreview(url) } }
      img.src = url
    })

    // Essayer chaque extension pour le favicon
    const favExts = ['png', 'svg', 'ico']
    let favFound = false
    favExts.forEach(ext => {
      if (favFound) return
      const url = `${rawBase}/platform/sites/${siteId}/public/favicon.${ext}?t=${ts}`
      const img = new Image()
      img.onload = () => { if (!favFound) { favFound = true; setFaviconPreview(url) } }
      img.src = url
    })

    fetch(`/api/sites/${siteId}/config`).then(r => r.json()).then(d => {
      if (d) {
        if (d.theme) setThemeForm(t => ({ ...t, ...d.theme, cta_color: d.theme.cta_color || '#F59E0B', cta_text_color: d.theme.cta_text_color || '#ffffff' }))
        setSeoForm(f => ({ ...f, home_title: d.home_title || '', home_description: d.home_description || '',
              home_h1: d.home_h1 || '', seo_vs_title: d.seo?.title_pattern || f.seo_vs_title, seo_vs_meta: d.seo?.meta_pattern || f.seo_vs_meta, seo_avis_title: d.seo?.avis_title_pattern || f.seo_avis_title, seo_avis_meta: d.seo?.avis_meta_pattern || f.seo_avis_meta, seo_liste_comp_title: d.seo?.liste_comp_title || f.seo_liste_comp_title, seo_liste_avis_title: d.seo?.liste_avis_title || f.seo_liste_avis_title, www_preference: d.www_preference || 'www' }))
        if (d.page_types) setPageTypes(d.page_types)
      }
    }).catch(() => {})

    fetch('/api/github?path=platform/schemas').then(r => r.json()).then(async (files) => {
      if (!Array.isArray(files)) return
      const schemas = await Promise.all(files.filter((f: any) => f.name.endsWith('.json')).map(async (f: any) => {
        const r = await fetch(`/api/github?path=${encodeURIComponent(f.path)}`)
        const d = await r.json()
        try { return { ...JSON.parse(d.content), filename: f.name.replace('.json', '') } } catch { return null }
      }))
      setAvailableSchemas(schemas.filter(Boolean))
    }).catch(() => {})
  }, [siteId])

  async function save() { setSaving(true); setMsg(''); const r = await fetch(`/api/sites/${siteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); const d = await r.json(); setMsg(d.id ? '✓ Paramètres sauvegardés' : '✗ Erreur'); setSaving(false) }
  async function saveSeo() { setSavingSeo(true); setMsgSeo(''); const r = await fetch(`/api/sites/${siteId}/config`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(seoForm) }); const d = await r.json(); setMsgSeo(d.success ? '✓ SEO sauvegardé' : '✗ Erreur'); setSavingSeo(false) }
  async function saveSeoAndDeploy() { setDeployingSeo(true); setMsgSeo(''); try { const r = await fetch(`/api/sites/${siteId}/config`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(seoForm) }); const d = await r.json(); if (!d.success) throw new Error(d.error || 'Erreur sauvegarde'); const wr = await fetch(`/api/sites/${siteId}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skip_enrich: true }) }); const wd = await wr.json(); if (!wd.success) throw new Error(wd.error || 'Erreur workflow'); setMsgSeo('✓ SEO sauvegardé et redéploiement lancé') } catch (e: any) { setMsgSeo('✗ ' + e.message) } finally { setDeployingSeo(false) } }
  async function savePageTypes() { setSavingPageTypes(true); setMsgPageTypes(''); const r = await fetch(`/api/sites/${siteId}/config`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...seoForm, page_types: pageTypes }) }); const d = await r.json(); setMsgPageTypes(d.success ? '✓ Types de pages sauvegardés' : '✗ Erreur'); setSavingPageTypes(false) }
  async function uploadLogo() {
    if (!logoFile) return
    setUploadingLogo(true); setMsgLogo('')
    try {
      const ext = logoFile.name.split('.').pop()?.toLowerCase() || 'png'
      const filename = `logo.${ext}`
      const path = `platform/sites/${siteId}/public/${filename}`
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1]
        let sha: string | undefined
        try {
          const ex = await fetch(`/api/github?path=${encodeURIComponent(path)}`)
          const ed = await ex.json()
          if (ed.sha) sha = ed.sha
        } catch {}
        const r = await fetch('/api/github/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, content: base64, message: `HUB: Upload logo ${siteId}`, sha })
        })
        const d = await r.json()
        setMsgLogo(d.ok ? "✓ Logo uploadé - relancez un déploiement pour l'appliquer" : "✗ Erreur upload")
        setUploadingLogo(false)
      }
      reader.readAsDataURL(logoFile)
    } catch { setMsgLogo('✗ Erreur'); setUploadingLogo(false) }
  }

  async function uploadFavicon() { if (!faviconFile) return; setUploadingFavicon(true); setMsgFavicon(''); const fd = new FormData(); fd.append('favicon', faviconFile); const r = await fetch(`/api/sites/${siteId}/favicon`, { method: 'POST', body: fd }); const d = await r.json(); setMsgFavicon(d.success ? "✓ Favicon uploadé — relancez un déploiement pour l'appliquer" : '✗ ' + (d.error || 'Erreur')); setUploadingFavicon(false) }
  async function deleteSite() { if (confirmDelete !== site?.name) return; setDeleting(true); const r = await fetch(`/api/sites/${siteId}`, { method: 'DELETE' }); const d = await r.json(); if (d.ok) router.push('/sites'); else { setMsg('✗ Erreur suppression'); setDeleting(false) } }

  const inp = (label: string, key: string) => (<div style={{ marginBottom: 16 }}><div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div><input value={form[key] || ''} onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))} style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} /></div>)
  const seoInp = (label: string, key: string, hint = '') => (<div style={{ marginBottom: 14 }}><div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, marginBottom: 4 }}>{label} {hint && <span style={{ color: '#4A5568', fontWeight: 400 }}>{hint}</span>}</div><input value={(seoForm as any)[key] || ''} onChange={e => setSeoForm(f => ({ ...f, [key]: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' as const }} /></div>)

  async function saveTheme() {
    setSavingTheme(true); setMsgTheme('')
    const r = await fetch(`/api/sites/${siteId}/config`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: themeForm })
    })
    const d = await r.json()
    setMsgTheme(d.ok ? '✓ Thème sauvegardé - relancez un déploiement' : '✗ Erreur')
    setSavingTheme(false)
    setTimeout(() => setMsgTheme(''), 4000)
  }

  if (!site) return <div style={{ color: '#8B9CB0', textAlign: 'center', padding: 60 }}>Chargement...</div>

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 24, fontSize: 13, color: '#8B9CB0' }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Sites</Link><span style={{ margin: '0 8px' }}>›</span>
        <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none' }}>{siteId}</Link><span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: '#fff' }}>Paramètres</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 28 }}>Paramètres</h1>

      {/* Infos générales */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h3 style={{ color: '#fff', margin: '0 0 20px', fontSize: 15, fontWeight: 600 }}>Informations générales</h3>
        {inp('Nom du site', 'name')}{inp('Domaine', 'domain')}{inp('Projet Cloudflare Pages', 'cloudflare_project')}{inp('URL Google Sheet CSV', 'sheet_csv_url')}
        <div style={{ marginBottom: 16 }}><div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>Description</div><textarea value={form.description || ''} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} rows={3} style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical', fontFamily: 'inherit' }} /></div>
        <div style={{ marginBottom: 20 }}><div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>Statut</div><select value={form.status || 'draft'} onChange={e => setForm((f: any) => ({ ...f, status: e.target.value }))} style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none' }}><option value="draft">Draft</option><option value="pending_generation">En attente génération</option><option value="live">Live</option><option value="building">Building</option></select></div>
        {msg && <div style={{ fontSize: 13, color: msg.startsWith('✓') ? '#00D4AA' : '#FC8181', marginBottom: 12 }}>{msg}</div>}
        <button onClick={save} disabled={saving} style={{ padding: '11px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{saving ? 'Sauvegarde...' : '💾 Sauvegarder'}</button>
      </div>

      {/* Thème */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ color: '#fff', margin: 0, fontSize: 15, fontWeight: 600 }}>🎨 Thème & Couleurs</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {msgTheme && <span style={{ fontSize: 12, color: msgTheme.startsWith('✓') ? '#00D4AA' : '#FC8181' }}>{msgTheme}</span>}
            <button onClick={saveTheme} disabled={savingTheme} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              {savingTheme ? '...' : '💾 Sauvegarder'}
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {([['accent', 'Couleur principale'], ['accent2', 'Couleur secondaire'], ['bg', 'Fond de page'], ['ink', 'Couleur du texte'], ['cta_color', 'Couleur des boutons CTA'], ['cta_text_color', 'Texte des boutons CTA']] as [string, string][]).map(([key, label]) => (
            <div key={key}>
              <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 8 }}>{label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color" value={(themeForm as any)[key] || '#000000'}
                  onChange={e => setThemeForm(t => ({ ...t, [key]: e.target.value }))}
                  style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid #1E2D3D', cursor: 'pointer', padding: 2 }} />
                <input value={(themeForm as any)[key] || ''} onChange={e => setThemeForm(t => ({ ...t, [key]: e.target.value }))}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 7, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 12, fontFamily: 'monospace', outline: 'none' }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: 12, color: '#4A5568' }}>Aperçu :</span>
          <span style={{ padding: '4px 12px', borderRadius: 20, background: themeForm.accent, color: '#fff', fontSize: 12, fontWeight: 600 }}>Principal</span>
          <span style={{ padding: '4px 12px', borderRadius: 20, background: themeForm.accent2, color: '#fff', fontSize: 12, fontWeight: 600 }}>Secondaire</span>
          <span style={{ padding: '6px 14px', borderRadius: 8, background: themeForm.bg, color: themeForm.ink, fontSize: 12, border: '1px solid #1E2D3D' }}>Texte sur fond</span>
          <span style={{ padding: '6px 16px', borderRadius: 24, background: (themeForm as any).cta_color, color: (themeForm as any).cta_text_color, fontSize: 12, fontWeight: 700 }}>→ Bouton CTA</span>
        </div>
      </div>

      {/* SEO */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}>SEO</h3>
        <div style={{ fontSize: 11, color: '#4A5568', marginBottom: 16 }}>Variables : <code style={{ color: '#00D4AA' }}>{'{A}'}</code> <code style={{ color: '#00D4AA' }}>{'{B}'}</code> <code style={{ color: '#00D4AA' }}>{'{nom}'}</code> <code style={{ color: '#00D4AA' }}>{'{td}'}</code> <code style={{ color: '#00D4AA' }}>{'{year}'}</code> <code style={{ color: '#00D4AA' }}>{'{site_name}'}</code></div>
        <div style={{ fontSize: 12, color: '#00D4AA', fontWeight: 600, marginBottom: 10 }}>Page d'accueil</div>
        {seoInp('Meta title', 'home_title')}{seoInp('Meta description', 'home_description')}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, marginBottom: 4 }}>H1 page d'accueil</div>
          <input value={(seoForm as any)['home_h1'] || ''} onChange={e => setSeoForm(f => ({ ...f, home_h1: e.target.value }))}
            placeholder="Ex: Le comparateur de logiciels qui compare vraiment"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
          <div style={{ fontSize: 11, color: '#4A5568', marginTop: 4 }}>Vous pouvez utiliser &lt;em&gt;texte&lt;/em&gt; pour mettre en italique</div>
        </div>
        <div style={{ fontSize: 12, color: '#0090FF', fontWeight: 600, margin: '16px 0 10px' }}>Pages comparatifs (A vs B)</div>
        {seoInp('Title pattern', 'seo_vs_title')}{seoInp('Meta pattern', 'seo_vs_meta')}
        <div style={{ fontSize: 12, color: '#9F7AEA', fontWeight: 600, margin: '16px 0 10px' }}>Pages avis</div>
        {seoInp('Title pattern', 'seo_avis_title', '— {td} = rendement%')}{seoInp('Meta pattern', 'seo_avis_meta')}
        <div style={{ fontSize: 12, color: '#F6AD55', fontWeight: 600, margin: '16px 0 10px' }}>Pages listes</div>
        {seoInp('Title liste comparatifs', 'seo_liste_comp_title')}{seoInp('Title liste avis', 'seo_liste_avis_title')}
        <div style={{ fontSize: 12, color: '#8B9CB0', fontWeight: 600, margin: '16px 0 10px' }}>URL canonique</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {[{ val: 'www', label: 'www.monsite.fr' }, { val: 'naked', label: 'monsite.fr' }].map(opt => (
            <div key={opt.val} onClick={() => setSeoForm(f => ({ ...f, www_preference: opt.val }))} style={{ flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', textAlign: 'center' as const, border: seoForm.www_preference === opt.val ? '2px solid #00D4AA' : '2px solid #1E2D3D', background: seoForm.www_preference === opt.val ? 'rgba(0,212,170,0.08)' : 'transparent', color: '#fff', fontSize: 13 }}>{opt.label}</div>
          ))}
        </div>
        {msgSeo && <div style={{ fontSize: 13, color: msgSeo.startsWith('✓') ? '#00D4AA' : '#FC8181', marginBottom: 12 }}>{msgSeo}</div>}
        <button onClick={saveSeo} disabled={savingSeo} style={{ padding: '11px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{savingSeo ? 'Sauvegarde...' : '💾 Sauvegarder SEO'}</button>
        <button onClick={saveSeoAndDeploy} disabled={deployingSeo} style={{ marginLeft: 10, padding: '11px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #9F7AEA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{deployingSeo ? '🚀 Déploiement...' : '🚀 Sauvegarder et redéployer'}</button>
      </div>

      {/* Types de pages */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}>📐 Types de pages</h3>
        <p style={{ color: '#8B9CB0', fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>Associez un modèle de page à chaque type. Les modèles définissent la structure et les prompts de génération.</p>
        {['avis', 'vs', 'local', 'classement'].map(type => (
          <div key={type} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>{type}</div>
            <select value={pageTypes[type] || ''} onChange={e => setPageTypes(prev => ({ ...prev, [type]: e.target.value }))}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: pageTypes[type] ? '#fff' : '#4A5568', fontSize: 13, outline: 'none' }}>
              <option value=''>— Non utilisé —</option>
              {availableSchemas.filter(s => s.type === type).map(s => (
                <option key={s.filename} value={s.filename}>{s.label} ({s.filename})</option>
              ))}
            </select>
          </div>
        ))}
        {msgPageTypes && <div style={{ fontSize: 13, color: msgPageTypes.startsWith('✓') ? '#00D4AA' : '#FC8181', marginBottom: 12 }}>{msgPageTypes}</div>}
        <button onClick={savePageTypes} disabled={savingPageTypes} style={{ padding: '11px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00D4AA, #0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{savingPageTypes ? 'Sauvegarde...' : '💾 Sauvegarder les types'}</button>
      </div>

      {/* Favicon */}
      <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        {/* Logo */}
        <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}>🏷 Logo du site</h3>
        <p style={{ color: '#8B9CB0', fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>PNG transparent ou SVG · Recommandé : 200×50px</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 120, height: 48, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {logoPreview ? <img src={logoPreview} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 11, color: '#4A5568' }}>Aperçu</span>}
          </div>
          <div>
            <label style={{ padding: '9px 18px', borderRadius: 9, background: '#1E2D3D', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'inline-block' }}>
              📁 Choisir un logo
              <input type="file" accept=".svg,.png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={e => {
                const f = e.target.files?.[0]
                if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)) }
              }} />
            </label>
            {logoFile && <div style={{ fontSize: 11, color: '#8B9CB0', marginTop: 4 }}>{logoFile.name} · {Math.round(logoFile.size/1024)}kb</div>}
          </div>
        </div>
        {msgLogo && <div style={{ fontSize: 12, color: msgLogo.startsWith('✓') ? '#00D4AA' : '#FC8181', marginBottom: 10 }}>{msgLogo}</div>}
        <button onClick={uploadLogo} disabled={uploadingLogo || !logoFile} style={{ padding: '10px 22px', borderRadius: 9, border: 'none', fontWeight: 600, fontSize: 13, background: logoFile ? 'linear-gradient(135deg, #00D4AA, #0090FF)' : '#1E2D3D', color: logoFile ? '#fff' : '#4A5568', cursor: logoFile ? 'pointer' : 'not-allowed', marginBottom: 28 }}>
          {uploadingLogo ? '⏳ Upload...' : '💾 Sauvegarder le logo'}
        </button>

        {/* Favicon */}
        <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}>🖼 Favicon</h3>
        <p style={{ color: '#8B9CB0', fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>SVG ou PNG 32×32 · ICO accepté</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {faviconPreview ? <img src={faviconPreview} alt="favicon" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 11, color: '#4A5568' }}>🖼</span>}
          </div>
          <div>
            <label style={{ padding: '9px 18px', borderRadius: 9, background: '#1E2D3D', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'inline-block' }}>
              📁 Choisir un favicon
              <input type="file" accept=".svg,.png,.ico" style={{ display: 'none' }} onChange={e => {
                const f = e.target.files?.[0]
                if (f) { setFaviconFile(f); setFaviconPreview(URL.createObjectURL(f)) }
              }} />
            </label>
            {faviconFile && <div style={{ fontSize: 11, color: '#8B9CB0', marginTop: 4 }}>{faviconFile.name} · {Math.round(faviconFile.size/1024)}kb</div>}
          </div>
        </div>
        {msgFavicon && <div style={{ fontSize: 12, color: msgFavicon.startsWith('✓') ? '#00D4AA' : '#FC8181', marginBottom: 10 }}>{msgFavicon}</div>}
        <button onClick={uploadFavicon} disabled={uploadingFavicon || !faviconFile} style={{ padding: '10px 22px', borderRadius: 9, border: 'none', fontWeight: 600, fontSize: 13, background: faviconFile ? 'linear-gradient(135deg, #00D4AA, #0090FF)' : '#1E2D3D', color: faviconFile ? '#fff' : '#4A5568', cursor: faviconFile ? 'pointer' : 'not-allowed' }}>
          {uploadingFavicon ? '⏳ Upload...' : '💾 Sauvegarder le favicon'}
        </button>
      </div>

      {/* Danger zone */}
      <div style={{ background: '#0D1117', border: '1px solid rgba(252,129,129,0.3)', borderRadius: 16, padding: 24 }}>
        <h3 style={{ color: '#FC8181', margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>⚠️ Zone dangereuse</h3>
        <p style={{ color: '#8B9CB0', fontSize: 13, marginBottom: 16 }}>Supprimer ce site le retire du HUB. Les fichiers GitHub et le site Cloudflare ne sont pas supprimés automatiquement.</p>
        <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12, color: '#8B9CB0', marginBottom: 6 }}>Tapez <strong style={{ color: '#fff' }}>{site.name}</strong> pour confirmer</div><input value={confirmDelete} onChange={e => setConfirmDelete(e.target.value)} placeholder={site.name} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid rgba(252,129,129,0.3)', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} /></div>
        <button onClick={deleteSite} disabled={deleting || confirmDelete !== site.name} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', fontWeight: 600, fontSize: 13, background: confirmDelete === site.name ? '#FC8181' : '#1E2D3D', color: confirmDelete === site.name ? '#fff' : '#4A5568', cursor: confirmDelete === site.name ? 'pointer' : 'not-allowed' }}>{deleting ? 'Suppression...' : '🗑 Supprimer ce site'}</button>
      </div>
    </div>
  )
}
