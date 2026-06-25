'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

// ─── Helper : extrait le filename "propre" depuis n'importe quelle valeur ─
// La valeur stockée dans config.yaml.author.photo peut être :
//   - un filename simple : "author-photo.jpg"
//   - un path : "/author-photo.jpg" ou "/public/author-photo.jpg"
//   - une URL absolue (corruption causée par d'anciennes versions du dashboard
//     qui stockaient `authorPhotoPreview` au lieu du filename) :
//     "https://raw.githubusercontent.com/.../public/author-photo.jpg?t=..."
// Dans tous les cas on veut juste le filename pour stockage propre.
function extractFilename(raw: string): string {
  if (!raw) return ''
  let s = String(raw).trim()
  // Rejeter les URLs éphémères du navigateur (jamais persistables) :
  // un blob:/data: ne correspond à AUCUN fichier réel sur le repo.
  if (/^(blob:|data:)/i.test(s)) {
    console.warn('[author photo] URL éphémère ignorée (non persistable) :', raw)
    return ''
  }
  // Strip query string si présent (?t=...)
  s = s.split('?')[0]
  // Si URL absolue → prendre le dernier segment du path
  if (s.includes('://')) {
    s = s.split('/').pop() || ''
  } else {
    // Path relatif : prendre le dernier segment (gère "/public/foo.jpg" → "foo.jpg")
    if (s.includes('/')) s = s.split('/').pop() || ''
  }
  // Validation finale : autoriser uniquement [a-zA-Z0-9._-] ET exiger une
  // vraie extension de fichier (sinon ex. l'UUID d'un blob "ca6f3..." passerait).
  if (!/^[a-zA-Z0-9._-]+\.[a-zA-Z0-9]{2,5}$/.test(s)) {
    console.warn('[author photo] filename invalide après normalisation :', raw, '→', s)
    return ''
  }
  return s
}

export default function SettingsPage() {
  const { siteId } = useParams()
  const router = useRouter()
  const [site, setSite] = useState<any>(null)
  const [form, setForm] = useState<any>({})
  const [themeForm, setThemeForm] = useState({ accent: '#2563EB', accent2: '#F59E0B', bg: '#F8FAFC', ink: '#0F172A', cta_color: '#F59E0B', cta_text_color: '#ffffff' })
  const [savingTheme, setSavingTheme] = useState(false)
  const [msgTheme, setMsgTheme] = useState('')
  const [seoForm, setSeoForm] = useState({ home_title: '', home_description: '', home_h1: '', footer_description: '', social_facebook: '', social_linkedin: '', social_x: '', social_youtube: '', seo_vs_title: '{A} vs {B} : comparatif {year}', seo_vs_meta: 'Comparatif complet {A} vs {B} {year} : rendements, frais, avis.', seo_avis_title: 'Avis {nom} {year} : faut-il investir ?', seo_avis_meta: 'Notre avis complet sur {nom} {year} : rendement {td}%, frais, points forts et risques.', seo_liste_comp_title: 'Tous les comparatifs {site_name} {year}', seo_liste_avis_title: 'Avis {site_name} {year} : analyses independantes', seo_classement_title: 'Meilleur {categorie} {year} : Top {count}', seo_classement_meta: 'Comparez les meilleurs {categorie} en {year}.', seo_classement_h1: '', seo_classement_titre_analyse: 'Comparatif complet {categorie}', www_preference: 'www' })
  const [pageTypes, setPageTypes] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [savingSeo, setSavingSeo] = useState(false)
  const [deployingSeo, setDeployingSeo] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [faviconFile, setFaviconFile] = useState<File | null>(null)
  const [uploadingFavicon, setUploadingFavicon] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [msgLogo, setMsgLogo] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [msgSeo, setMsgSeo] = useState('')
  const [msgFavicon, setMsgFavicon] = useState('')
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null)

  // ─── ÉTAT PHOTO AUTEUR ────────────────────────────────────────────────
  // Découpler le filename (stocké dans config.yaml) et l'URL preview (pour
  // l'<img>). Sans ce découplage, le save écrit l'URL absolue dans
  // config.yaml, qui est ensuite re-préfixée au reload → 404 récurrent.
  const [authorPhotoFilename, setAuthorPhotoFilename] = useState<string>('')   // ← stocké dans config
  const [authorPhotoPreview, setAuthorPhotoPreview] = useState<string | null>(null) // ← URL pour <img>

  const [personaPrompt, setPersonaPrompt] = useState('')
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
    fetch(`/api/github?path=${encodeURIComponent(`platform/sites/${siteId}/public`)}`)
      .then(r => r.json())
      .then(files => {
        if (!Array.isArray(files)) return
        const rawBase = `https://raw.githubusercontent.com/afcavf54-cmd/comparatifs-platform/main`
        const ts = Date.now()
        const logoF = files.find((f: any) => /^logo\.[a-z0-9]+$/i.test(f.name))
        const favF = files.find((f: any) => /^favicon\.[a-z0-9]+$/i.test(f.name))
        if (logoF) setLogoPreview(`${rawBase}/${logoF.path}?t=${ts}`)
        if (favF) setFaviconPreview(`${rawBase}/${favF.path}?t=${ts}`)
      })
      .catch(() => {})

    fetch(`/api/sites/${siteId}/config?t=${Date.now()}`).then(r => r.json()).then(d => {
      if (d) {
        if (d.theme) setThemeForm(t => ({ ...t, ...d.theme, cta_color: d.theme.cta_color || '#F59E0B', cta_text_color: d.theme.cta_text_color || '#ffffff' }))
        setSeoForm(f => ({ ...f, home_title: d.home_title || '', home_description: d.home_description || '',
              home_h1: d.home_h1 || '', footer_description: d.footer_description || '', social_facebook: d.social_facebook || '', social_linkedin: d.social_linkedin || '', social_x: d.social_x || '', social_youtube: d.social_youtube || '', seo_vs_title: d.seo?.title_pattern || f.seo_vs_title, seo_vs_meta: d.seo?.meta_pattern || f.seo_vs_meta, seo_avis_title: d.seo?.avis_title_pattern || f.seo_avis_title, seo_avis_meta: d.seo?.avis_meta_pattern || f.seo_avis_meta, seo_liste_comp_title: d.seo?.liste_comp_title || f.seo_liste_comp_title, seo_liste_avis_title: d.seo?.liste_avis_title || f.seo_liste_avis_title, seo_classement_title: d.seo?.classement_title_pattern || f.seo_classement_title, seo_classement_meta: d.seo?.classement_meta_pattern || f.seo_classement_meta, seo_classement_h1: d.seo?.classement_h1_pattern || f.seo_classement_h1, seo_classement_titre_analyse: d.seo?.classement_titre_analyse_pattern || f.seo_classement_titre_analyse, www_preference: d.www_preference || 'www' }))
        if (d.page_types) setPageTypes(d.page_types)
        // Charger auteur
        if (d.author) {
          setAuthorName(d.author.name || '')
          setAuthorJob(d.author.job_title || '')
          setAuthorBio(d.author.bio || '')
          setAuthorSocials(d.author.socials || [])
          if (d.author.photo) {
            // Extraire le filename (tolérant : gère filenames simples, paths,
            // ET les URLs absolues corrompues par d'anciennes versions du
            // dashboard — auto-migration au prochain save).
            const filename = extractFilename(d.author.photo)
            if (filename) {
              setAuthorPhotoFilename(filename)
              // Construire l'URL preview à partir du filename
              const rawUrl = `https://raw.githubusercontent.com/afcavf54-cmd/comparatifs-platform/main/platform/sites/${siteId}/public/${filename}?t=${Date.now()}`
              setAuthorPhotoPreview(rawUrl)
            } else {
              console.warn('[author photo] valeur config invalide :', d.author.photo)
              setAuthorPhotoFilename('')
              setAuthorPhotoPreview(null)
            }
          }
        }
        setPersonaPrompt(d.persona_prompt || '')
      }
    }).catch(() => {})
  }, [siteId])

  async function save() { setSaving(true); setMsg(''); const r = await fetch(`/api/sites/${siteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); const d = await r.json(); setMsg(d.id ? '✓ Paramètres sauvegardés' : '✗ Erreur'); setSaving(false) }
  async function saveSeo() { setSavingSeo(true); setMsgSeo(''); const r = await fetch(`/api/sites/${siteId}/config`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(seoForm) }); const d = await r.json(); setMsgSeo(d.ok ? '✓ SEO sauvegardé' : '✗ Erreur'); setSavingSeo(false) }
  async function saveSeoAndDeploy() { setDeployingSeo(true); setMsgSeo(''); try { const r = await fetch(`/api/sites/${siteId}/config`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(seoForm) }); const d = await r.json(); if (!d.ok) throw new Error(d.error || 'Erreur sauvegarde'); const wr = await fetch(`/api/sites/${siteId}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skip_enrich: true }) }); const wd = await wr.json(); if (!wd.ok) throw new Error(wd.error || 'Erreur workflow'); setMsgSeo('✓ SEO sauvegardé et redéploiement lancé') } catch (e: any) { setMsgSeo('✗ ' + e.message) } finally { setDeployingSeo(false) } }
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
        {inp('Nom du site', 'name')}{inp('Domaine', 'domain')}
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
        <div style={{ fontSize: 11, color: '#4A5568', marginBottom: 16 }}>Variables : <code style={{ color: '#00D4AA' }}>{'{A}'}</code> <code style={{ color: '#00D4AA' }}>{'{B}'}</code> <code style={{ color: '#00D4AA' }}>{'{nom}'}</code> <code style={{ color: '#00D4AA' }}>{'{td}'}</code> <code style={{ color: '#00D4AA' }}>{'{year}'}</code> <code style={{ color: '#00D4AA' }}>{'{site_name}'}</code> <code style={{ color: '#00D4AA' }}>{'{count}'}</code><br/><code style={{ color: '#00D4AA' }}>{'{categorie}'}</code> <code style={{ color: '#00D4AA' }}>{'{Categorie}'}</code> <code style={{ color: '#00D4AA' }}>{'{categories}'}</code> <code style={{ color: '#00D4AA' }}>{'{Categories}'}</code><br/><span style={{ fontSize: 10, opacity: 0.7 }}>Singulier / pluriel × minuscule / Majuscule. Ex: <code>{'{Categories}'}</code> → "Logiciels de paie"</span></div>
        <div style={{ fontSize: 12, color: '#00D4AA', fontWeight: 600, marginBottom: 10 }}>Page d'accueil</div>
        {seoInp('Meta title', 'home_title')}{seoInp('Meta description', 'home_description')}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, marginBottom: 4 }}>H1 page d'accueil</div>
          <input value={(seoForm as any)['home_h1'] || ''} onChange={e => setSeoForm(f => ({ ...f, home_h1: e.target.value }))}
            placeholder="Ex: Le comparateur de logiciels qui compare vraiment"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
          <div style={{ fontSize: 11, color: '#4A5568', marginTop: 4 }}>Vous pouvez utiliser &lt;em&gt;texte&lt;/em&gt; pour mettre en italique</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 600, marginBottom: 4 }}>Footer — description</div>
          <textarea value={(seoForm as any)['footer_description'] || ''} onChange={e => setSeoForm(f => ({ ...f, footer_description: e.target.value }))}
            rows={2}
            placeholder="Ex: Le média qui aide les entrepreneurs à choisir les bons outils."
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical', fontFamily: 'inherit' }} />
          <div style={{ fontSize: 11, color: '#4A5568', marginTop: 4 }}>Texte affiché sous le logo dans le footer de chaque page. Vide = texte par défaut («&nbsp;Comparatifs {'{site_name}'} {'{year}'}&nbsp;»).</div>
        </div>
        <div style={{ fontSize: 12, color: '#00D4AA', fontWeight: 600, margin: '4px 0 10px' }}>Réseaux sociaux (footer)</div>
        <div style={{ fontSize: 11, color: '#4A5568', marginBottom: 10 }}>Affichés en icônes sous la description du footer (ouverture dans un nouvel onglet). Laisser vide pour masquer un réseau.</div>
        {seoInp('Facebook — URL', 'social_facebook', '— ex : https://facebook.com/votrepage')}
        {seoInp('LinkedIn — URL', 'social_linkedin', '— ex : https://linkedin.com/company/...')}
        {seoInp('X (Twitter) — URL', 'social_x', '— ex : https://x.com/votrecompte')}
        {seoInp('YouTube — URL', 'social_youtube', '— ex : https://youtube.com/@votrechaine')}
        <div style={{ fontSize: 12, color: '#0090FF', fontWeight: 600, margin: '16px 0 10px' }}>Pages comparatifs (A vs B)</div>
        {seoInp('Title pattern', 'seo_vs_title')}{seoInp('Meta pattern', 'seo_vs_meta')}
        <div style={{ fontSize: 12, color: '#9F7AEA', fontWeight: 600, margin: '16px 0 10px' }}>Pages avis</div>
        {seoInp('Title pattern', 'seo_avis_title', '— {td} = rendement%')}{seoInp('Meta pattern', 'seo_avis_meta')}
        <div style={{ fontSize: 12, color: '#F6AD55', fontWeight: 600, margin: '16px 0 10px' }}>Pages listes</div>
        {seoInp('Title liste comparatifs', 'seo_liste_comp_title')}{seoInp('Title liste avis', 'seo_liste_avis_title')}
        {pageTypes.classement && (
          <>
            <div style={{ fontSize: 12, color: '#F687B3', fontWeight: 600, margin: '16px 0 10px' }}>Pages classement (Top {'{categorie}'})</div>
            <div style={{ fontSize: 11, color: '#4A5568', marginBottom: 8 }}>Patterns par défaut pour les pages <code style={{ color: '#00D4AA' }}>/meilleur-{'{categorie}'}</code>. Les valeurs éditées par catégorie depuis la page Classements ont la priorité.</div>
            {seoInp('Title pattern', 'seo_classement_title', '— ex : Meilleur {categorie} {year} : Top {count}')}
            {seoInp('Meta pattern', 'seo_classement_meta')}
            {seoInp('H1 pattern (vide = utilise le Title)', 'seo_classement_h1', '— ex : Mon top {count} des {categorie} {year}')}
            {seoInp('H2 avant classement', 'seo_classement_titre_analyse', '— ex : Comparatif complet {categorie}')}
          </>
        )}
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

      {/* ── PERSONA ── */}
      <div style={{background:'#0D1117',border:'1px solid #1E2D3D',borderRadius:12,padding:24,marginBottom:24}}>
        <h3 style={{color:'#fff',fontSize:16,fontWeight:600,marginBottom:6}}>🎭 Persona éditorial</h3>
        <p style={{color:'#8B9CB0',fontSize:13,marginBottom:16,lineHeight:1.6}}>
          Ce prompt persona est injecté dans toutes les générations IA de ce site, en surcouche du prompt global du modèle. Il rend ce site unique.
        </p>
        <textarea value={personaPrompt} onChange={e => setPersonaPrompt(e.target.value)} rows={6}
          placeholder="Ex: Tu écris en tant qu'expert comptable de 42 ans, basé à Lyon. Tu t'adresses à des dirigeants de PME avec un ton professionnel et direct..."
          style={{width:'100%',padding:'12px 14px',borderRadius:8,background:'#0A0E1A',border:'1px solid #1E2D3D',color:'#fff',fontSize:13,outline:'none',resize:'vertical' as const,fontFamily:'inherit',boxSizing:'border-box' as const,lineHeight:1.6,marginBottom:12}} />
        <button onClick={async () => {
          const r = await fetch(`/api/sites/${siteId}/config`, {
            method:'PATCH', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ persona_prompt: personaPrompt })
          })
          const d = await r.json()
          if (d.ok) {
            alert('✓ Persona sauvegardé')
          } else {
            alert('✗ Erreur : ' + (d.error || 'inconnue'))
          }
        }} style={{padding:'10px 20px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#9F7AEA,#0090FF)',color:'#fff',cursor:'pointer',fontWeight:600,fontSize:13}}>
          💾 Sauvegarder le persona
        </button>
        {personaPrompt && <span style={{fontSize:12,color:'#9F7AEA',marginLeft:12}}>{personaPrompt.length} caractères ✓</span>}
      </div>

      {/* ── BOX AUTEUR ── */}
      <div style={{background:'#0D1117',border:'1px solid #1E2D3D',borderRadius:12,padding:24,marginBottom:24}}>
        <h3 style={{color:'#fff',fontSize:16,fontWeight:600,marginBottom:20}}>✍️ Box auteur</h3>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
          <div>
            <label style={{fontSize:12,color:'#8B9CB0',display:'block',marginBottom:6}}>NOM DE L'AUTEUR</label>
            <input value={authorName} onChange={e => setAuthorName(e.target.value)} placeholder="Ex: Marie Dupont"
              style={{width:'100%',padding:'10px 12px',borderRadius:8,background:'#0A0E1A',border:'1px solid #1E2D3D',color:'#fff',fontSize:13,outline:'none',boxSizing:'border-box' as const}} />
          </div>
          <div>
            <label style={{fontSize:12,color:'#8B9CB0',display:'block',marginBottom:6}}>TITRE / POSTE</label>
            <input value={authorJob} onChange={e => setAuthorJob(e.target.value)} placeholder="Ex: Expert logiciels SaaS"
              style={{width:'100%',padding:'10px 12px',borderRadius:8,background:'#0A0E1A',border:'1px solid #1E2D3D',color:'#fff',fontSize:13,outline:'none',boxSizing:'border-box' as const}} />
          </div>
        </div>

        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,color:'#8B9CB0',display:'block',marginBottom:6}}>BIOGRAPHIE</label>
          <textarea value={authorBio} onChange={e => setAuthorBio(e.target.value)} rows={3}
            placeholder="Courte biographie de l'auteur (2-3 phrases)..."
            style={{width:'100%',padding:'10px 12px',borderRadius:8,background:'#0A0E1A',border:'1px solid #1E2D3D',color:'#fff',fontSize:13,outline:'none',resize:'vertical' as const,fontFamily:'inherit',boxSizing:'border-box' as const}} />
        </div>

        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,color:'#8B9CB0',display:'block',marginBottom:6}}>
            PHOTO DE L'AUTEUR
            {authorPhotoFilename && <span style={{color:'#4A5568',fontWeight:400,marginLeft:8,fontSize:11}}>· {authorPhotoFilename}</span>}
          </label>
          <div style={{display:'flex',alignItems:'center',gap:16}}>
            <div style={{width:64,height:64,borderRadius:'50%',overflow:'hidden',background:'#1E2D3D',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              {authorPhotoPreview ? (
                <img
                  src={authorPhotoPreview}
                  alt="Auteur"
                  style={{width:'100%',height:'100%',objectFit:'cover'}}
                  onError={() => {
                    // Photo référencée dans config mais introuvable sur le repo :
                    // on retire l'aperçu pour afficher le placeholder ✍️.
                    console.warn('[author photo] image introuvable :', authorPhotoPreview)
                    setAuthorPhotoPreview(null)
                  }}
                />
              ) : <span style={{fontSize:24}}>✍️</span>}
            </div>
            <label style={{padding:'9px 16px',borderRadius:8,background:'#1E2D3D',color:'#F6AD55',cursor:'pointer',fontSize:13,fontWeight:600}}>
              📁 Choisir une photo
              <input type="file" accept="image/*" style={{display:'none'}} onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return
                const fd = new FormData(); fd.append('file', file)
                // Aperçu immédiat avec l'objet local (transitoire, jamais sauvegardé)
                const localPreview = URL.createObjectURL(file)
                setAuthorPhotoPreview(localPreview)
                try {
                  const r = await fetch(`/api/sites/${siteId}/author-photo`, {method:'POST',body:fd})
                  const d = await r.json()
                  if (!r.ok || !d.rawUrl) throw new Error(d.error || 'upload échoué')
                  // Extraire le filename de rawUrl (= ce qu'on stocke dans config)
                  // pour s'assurer qu'au prochain save on n'écrit pas l'URL complète.
                  const filename = extractFilename(d.rawUrl)
                  if (!filename) throw new Error('nom de fichier invalide')
                  setAuthorPhotoFilename(filename)
                  // Preview avec cache-bust (URL réelle, pas le blob)
                  setAuthorPhotoPreview(d.rawUrl + '?t=' + Date.now())
                } catch (err: any) {
                  // L'upload a échoué : on NE garde PAS l'aperçu blob (sinon il
                  // pourrait être pris pour une photo enregistrée → blob: dans config).
                  alert('✗ Échec de l\'upload de la photo : ' + (err?.message || 'inconnue') + '\nLa photo n\'a pas été enregistrée, réessayez.')
                  setAuthorPhotoPreview(null)
                  setAuthorPhotoFilename('')
                } finally {
                  URL.revokeObjectURL(localPreview)
                  e.target.value = ''
                }
              }} />
            </label>
          </div>
        </div>

        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,color:'#8B9CB0',display:'block',marginBottom:8}}>RÉSEAUX SOCIAUX</label>
          {authorSocials.map((s, i) => (
            <div key={i} style={{display:'flex',gap:8,marginBottom:8}}>
              <input value={s.label} onChange={e => { const n=[...authorSocials]; n[i]={...n[i],label:e.target.value}; setAuthorSocials(n) }}
                placeholder="Label (ex: LinkedIn)"
                style={{width:140,padding:'8px 10px',borderRadius:6,background:'#0A0E1A',border:'1px solid #1E2D3D',color:'#fff',fontSize:12,outline:'none'}} />
              <input value={s.url} onChange={e => { const n=[...authorSocials]; n[i]={...n[i],url:e.target.value}; setAuthorSocials(n) }}
                placeholder="https://linkedin.com/in/..."
                style={{flex:1,padding:'8px 10px',borderRadius:6,background:'#0A0E1A',border:'1px solid #1E2D3D',color:'#fff',fontSize:12,outline:'none'}} />
              <button onClick={() => setAuthorSocials(authorSocials.filter((_,j)=>j!==i))}
                style={{padding:'8px 12px',borderRadius:6,border:'none',background:'#1E2D3D',color:'#FC8181',cursor:'pointer',fontSize:14}}>×</button>
            </div>
          ))}
          <button onClick={() => setAuthorSocials([...authorSocials,{label:'',url:''}])}
            style={{padding:'8px 14px',borderRadius:6,border:'1px dashed #1E2D3D',background:'transparent',color:'#00D4AA',cursor:'pointer',fontSize:12,fontWeight:600}}>+ Ajouter un réseau</button>
        </div>

        <button onClick={async () => {
          // CRITIQUE : on save authorPhotoFilename (juste le filename), JAMAIS
          // authorPhotoPreview (URL absolue). Sans ça, au prochain reload le
          // path serait re-préfixé par le code de chargement → 404 récurrent.
          const r = await fetch(`/api/sites/${siteId}/config`, {
            method:'PATCH', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ author: { name: authorName, bio: authorBio, job_title: authorJob, photo: authorPhotoFilename, socials: authorSocials } })
          })
          const d = await r.json()
          if (d.ok) alert('✓ Auteur sauvegardé')
          else alert('✗ Erreur : ' + (d.error || 'inconnue'))
        }} style={{padding:'10px 20px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#00D4AA,#0090FF)',color:'#fff',cursor:'pointer',fontWeight:600,fontSize:13}}>
          💾 Sauvegarder l'auteur
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
