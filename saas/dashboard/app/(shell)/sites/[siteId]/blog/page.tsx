'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Post {
  title: string
  slug: string
  date: string
  categorie?: string
  status?: string
  meta_description?: string
  excerpt?: string
}

const STATUS_LABEL: Record<string, string> = {
  published: '✓ Publié',
  scheduled: '⏰ Programmé',
  draft: '✏️ Brouillon',
}

const STATUS_COLOR: Record<string, string> = {
  published: '#00D4AA',
  scheduled: '#F6AD55',
  draft: '#8B9CB0',
}

export default function BlogListPage() {
  const { siteId } = useParams()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  // Articles en cours de génération (titres attendus depuis le déclenchement
  // d'un workflow). Stockés en localStorage pour survivre aux reloads.
  // Format : { title, createdAt: number }[] — pas de slug car il n'est connu
  // qu'après génération. Rapprochement par normalisation du titre.
  const [pending, setPending] = useState<{ title: string; createdAt: number }[]>([])
  // Articles programmés pour une date future (status === 'scheduled' dans la sheet).
  // Ils restent visibles jusqu'à ce que la date soit atteinte et qu'ils
  // apparaissent dans la liste publiée. Stockés en localStorage séparé.
  const [scheduled, setScheduled] = useState<{ title: string; scheduledFor: string; createdAt: number }[]>([])
  // Bouton "🚀 Publier maintenant" — titre en cours de déclenchement (sinon null)
  const [publishingNow, setPublishingNow] = useState<string | null>(null)
  // Configuration sheet de programmation
  const [showSheetConfig, setShowSheetConfig] = useState(false)
  const [sheetUrl, setSheetUrl] = useState('')
  const [sheetUrlOriginal, setSheetUrlOriginal] = useState('')
  const [savingSheet, setSavingSheet] = useState(false)
  const [checkingSheet, setCheckingSheet] = useState(false)
  const [sheetMsg, setSheetMsg] = useState('')
  // Domaine public du site (ex: "https://www.editions-dp.com") pour afficher
  // les thumbnails featured_image dans la liste blog.
  const [siteDomain, setSiteDomain] = useState('')
  // Modale preview de la sheet (affiche les articles à publier avant de déclencher le workflow)
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState<any>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => { load(); loadConfig(); loadPending(); loadScheduled(); syncScheduledFromSheet() }, [siteId])

  // Récupère la liste des articles programmés directement depuis la sheet
  // (sans afficher la modale). Permet d'avoir la box bleue à jour même si
  // l'utilisateur n'a jamais cliqué "Lancer la génération" depuis le déploiement
  // de la feature, OU si le localStorage a été vidé.
  async function syncScheduledFromSheet() {
    try {
      const r = await fetch(`/api/sites/${siteId}/blog/preview-sheet`)
      if (!r.ok) return  // sheet non configurée ou inaccessible : silencieux
      const data = await r.json()
      if (!data.rows) return
      const sheetScheduled = data.rows
        .filter((row: any) => row.status === 'scheduled' && row.titre && row.pub_at)
        .map((row: any) => ({
          title: row.titre as string,
          scheduledFor: row.pub_at as string,
          createdAt: Date.now(),
        }))
      if (sheetScheduled.length === 0) return
      // Merger avec ce qui est en localStorage (sans doublons par titre normalisé)
      setScheduled(prev => {
        const existingTitles = new Set(prev.map(p => normalizeTitle(p.title)))
        const newOnes = sheetScheduled.filter((s: any) => !existingTitles.has(normalizeTitle(s.title)))
        // On rafraîchit aussi les dates pour les titres déjà connus (au cas où
        // l'utilisateur ait modifié la date dans la sheet)
        const refreshed = prev.map(p => {
          const found = sheetScheduled.find((s: any) => normalizeTitle(s.title) === normalizeTitle(p.title))
          return found ? { ...p, scheduledFor: found.scheduledFor } : p
        })
        const merged = [...refreshed, ...newOnes]
        saveScheduled(merged)
        return merged
      })
    } catch { /* silencieux : pas de sheet configurée, pas grave */ }
  }

  // Polling : tant qu'il y a des articles en attente OU programmés, on
  // recharge la liste toutes les 15s (rapide) ou 5min (pour les programmés
  // sans pending). Le rapprochement par titre normalisé nettoie les
  // placeholders quand leur article apparaît vraiment.
  useEffect(() => {
    if (pending.length === 0 && scheduled.length === 0) return
    const interval = pending.length > 0 ? 15000 : 5 * 60 * 1000
    const id = setInterval(() => { load() }, interval)
    return () => clearInterval(id)
  }, [pending.length, scheduled.length])

  // Au chargement de la liste, on rapproche les titres attendus avec les
  // articles réels et on nettoie les placeholders périmés.
  // - pending : timeout 10 min (échec probable au-delà)
  // - scheduled : timeout 60 jours (au-delà, abandonné)
  useEffect(() => {
    if (pending.length === 0 && scheduled.length === 0) return
    const realTitles = new Set(posts.map(p => normalizeTitle(p.title)))
    const now = Date.now()
    const PENDING_MAX_AGE_MS = 10 * 60 * 1000
    const SCHEDULED_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000
    const newPending = pending.filter(p =>
      !realTitles.has(normalizeTitle(p.title)) &&
      now - p.createdAt < PENDING_MAX_AGE_MS
    )
    const newScheduled = scheduled.filter(p =>
      !realTitles.has(normalizeTitle(p.title)) &&
      now - p.createdAt < SCHEDULED_MAX_AGE_MS
    )
    if (newPending.length !== pending.length) {
      setPending(newPending); savePending(newPending)
    }
    if (newScheduled.length !== scheduled.length) {
      setScheduled(newScheduled); saveScheduled(newScheduled)
    }
  }, [posts])

  function pendingKey() { return `pending-blog-${siteId}` }
  function scheduledKey() { return `scheduled-blog-${siteId}` }
  function loadPending() {
    try {
      const raw = localStorage.getItem(pendingKey())
      if (raw) setPending(JSON.parse(raw))
    } catch { /* ignore */ }
  }
  function loadScheduled() {
    try {
      const raw = localStorage.getItem(scheduledKey())
      if (raw) setScheduled(JSON.parse(raw))
    } catch { /* ignore */ }
  }
  function savePending(p: { title: string; createdAt: number }[]) {
    try {
      if (p.length > 0) localStorage.setItem(pendingKey(), JSON.stringify(p))
      else localStorage.removeItem(pendingKey())
    } catch { /* ignore */ }
  }
  function saveScheduled(s: { title: string; scheduledFor: string; createdAt: number }[]) {
    try {
      if (s.length > 0) localStorage.setItem(scheduledKey(), JSON.stringify(s))
      else localStorage.removeItem(scheduledKey())
    } catch { /* ignore */ }
  }

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/sites/${siteId}/blog`)
      const data = await r.json()
      setPosts(data.posts || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // URL d'édition de la sheet (différente de l'URL CSV de publication).
  // Demandée au premier clic sur "📝 Modifier" et persistée dans config.yaml.
  const [sheetEditUrlSaved, setSheetEditUrlSaved] = useState('')

  async function loadConfig() {
    try {
      const r = await fetch(`/api/sites/${siteId}/config`)
      const d = await r.json()
      setSheetUrl(d.blog_sheet_csv_url || '')
      setSheetUrlOriginal(d.blog_sheet_csv_url || '')
      setSheetEditUrlSaved(d.blog_sheet_edit_url || '')
      if (d.domain) {
        // Normalise : on retire le trailing slash et on s'assure du scheme
        const dom = String(d.domain).replace(/\/+$/, '')
        setSiteDomain(dom.startsWith('http') ? dom : `https://${dom}`)
      }
    } catch (e) { /* ignore */ }
  }

  async function saveSheet() {
    setSavingSheet(true); setSheetMsg('')
    // Normaliser l'URL : Google Sheets publie soit en /pubhtml (page web)
    // soit en /pub?output=csv (CSV brut). Le script Python a besoin du CSV.
    // On corrige automatiquement /pubhtml → /pub?output=csv pour éviter
    // que l'utilisateur ait à choisir le bon format dans Google Sheets.
    let urlToSave = sheetUrl.trim()
    if (urlToSave) {
      // /pubhtml(?...) → /pub?output=csv
      urlToSave = urlToSave.replace(/\/pubhtml(\?[^#]*)?(#.*)?$/, '/pub?output=csv')
      // Si l'URL contient déjà /pub mais sans output=csv, on l'ajoute
      if (/\/pub(\?|$)/.test(urlToSave) && !/output=csv/.test(urlToSave)) {
        urlToSave = urlToSave.replace(/\/pub(\?|$)/, '/pub?output=csv$1').replace('?$1', '')
      }
    }
    try {
      const r = await fetch(`/api/sites/${siteId}/config`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blog_sheet_csv_url: urlToSave }),
      })
      const data = await r.json().catch(() => ({}))
      if (r.ok) {
        setSheetUrl(urlToSave)
        setSheetUrlOriginal(urlToSave)
        const msg = urlToSave !== sheetUrl.trim() ? '✓ URL normalisée et enregistrée' : '✓ Sheet enregistrée'
        setSheetMsg(msg)
      } else {
        setSheetMsg(`✗ ${data.error || `Erreur ${r.status}`}`)
      }
    } catch (e: any) { setSheetMsg(`✗ ${e.message}`) }
    setSavingSheet(false)
    setTimeout(() => setSheetMsg(''), 4000)
  }

  async function openPreview() {
    setShowPreview(true)
    setPreviewLoading(true)
    setPreviewData(null)
    try {
      const r = await fetch(`/api/sites/${siteId}/blog/preview-sheet`)
      const data = await r.json()
      if (r.ok) {
        setPreviewData(data)
      } else {
        setPreviewData({ error: data.error || `Erreur ${r.status}`, hint: data.hint })
      }
    } catch (e: any) {
      setPreviewData({ error: e.message })
    }
    setPreviewLoading(false)
  }

  async function confirmAndPublish() {
    setConfirming(true)
    try {
      const r = await fetch(`/api/sites/${siteId}/blog/check-sheet`, { method: 'POST' })
      const d = await r.json()
      if (r.ok) {
        // Mémoriser les titres éligibles comme "en cours de génération"
        const eligible = (previewData?.rows || [])
          .filter((row: any) => row.status === 'eligible')
          .map((row: any) => ({ title: row.titre as string, createdAt: Date.now() }))
        if (eligible.length > 0) {
          const merged = [...pending, ...eligible.filter(e =>
            !pending.some(p => normalizeTitle(p.title) === normalizeTitle(e.title))
          )]
          setPending(merged)
          savePending(merged)
        }
        // Mémoriser les titres programmés (date future)
        const scheduledRows = (previewData?.rows || [])
          .filter((row: any) => row.status === 'scheduled')
          .map((row: any) => ({
            title: row.titre as string,
            scheduledFor: row.pub_at as string,
            createdAt: Date.now(),
          }))
        if (scheduledRows.length > 0) {
          const merged = [...scheduled, ...scheduledRows.filter(e =>
            !scheduled.some(p => normalizeTitle(p.title) === normalizeTitle(e.title))
          )]
          setScheduled(merged)
          saveScheduled(merged)
        }
        setShowPreview(false)
        const parts: string[] = []
        if (eligible.length > 0) parts.push(`${eligible.length} en cours de génération`)
        if (scheduledRows.length > 0) parts.push(`${scheduledRows.length} programmé${scheduledRows.length > 1 ? 's' : ''}`)
        setSheetMsg(`✓ ${parts.join(' · ')}`)
        setTimeout(() => setSheetMsg(''), 8000)
      } else {
        setPreviewData((prev: any) => ({ ...prev, error: d.error || 'Erreur déclenchement' }))
      }
    } catch (e: any) {
      setPreviewData((prev: any) => ({ ...prev, error: e.message }))
    }
    setConfirming(false)
  }

  async function del(slug: string, title: string) {
    if (!confirm(`Supprimer l'article "${title}" ?`)) return
    const r = await fetch(`/api/sites/${siteId}/blog/${slug}`, { method: 'DELETE' })
    if (r.ok) load()
    else alert('Erreur suppression')
  }

  /**
   * Force la publication immédiate d'un article programmé. Déclenche le
   * workflow blog-cron.yml avec FORCE_TITLES, qui ignore la date programmée
   * pour cet article et le publie tout de suite. Retire l'article de la box
   * scheduled et l'ajoute en pending (génération en cours).
   */
  async function publishNow(title: string) {
    if (!confirm(`Publier maintenant "${title}" ?\n\nL'article sera généré immédiatement, sans attendre sa date programmée.`)) return
    setPublishingNow(title)
    try {
      const r = await fetch(`/api/sites/${siteId}/blog/publish-now`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const d = await r.json()
      if (r.ok) {
        // Retirer du scheduled, ajouter au pending pour le suivi
        const newScheduled = scheduled.filter(s => s.title !== title)
        setScheduled(newScheduled)
        saveScheduled(newScheduled)
        const merged = [...pending, { title, createdAt: Date.now() }]
        setPending(merged)
        savePending(merged)
      } else {
        alert('Erreur déclenchement : ' + (d.error || 'inconnue'))
      }
    } catch (e: any) {
      alert('Erreur réseau : ' + e.message)
    }
    setPublishingNow(null)
  }

  /**
   * Ouvre la Google Sheet dans un nouvel onglet en mode édition.
   *
   * L'URL CSV de publication (`/d/e/<publish_id>/pub?output=csv`) n'est pas
   * dérivable vers l'URL d'édition car les 2 IDs sont différents. On demande
   * donc à l'utilisateur l'URL d'édition au premier clic et on la persiste
   * dans config.yaml (clé `blog_sheet_edit_url`) pour les fois suivantes.
   *
   * Si l'URL CSV est en format `/d/<id>/...` (partage direct sans publication),
   * on peut dériver directement sans prompt.
   */
  async function openSheetForEdit() {
    // Cas 1 : URL d'édition déjà sauvegardée
    if (sheetEditUrlSaved) {
      window.open(sheetEditUrlSaved, '_blank', 'noopener,noreferrer')
      return
    }
    // Cas 2 : URL CSV en format direct (pas /pub) → dérivable
    const csv = sheetUrl || sheetUrlOriginal
    if (csv) {
      const direct = csv.match(/\/spreadsheets\/d\/(?!e\/)([a-zA-Z0-9_-]+)/)
      if (direct) {
        const editUrl = `https://docs.google.com/spreadsheets/d/${direct[1]}/edit`
        window.open(editUrl, '_blank', 'noopener,noreferrer')
        return
      }
    }
    // Cas 3 : URL en /pub publish_id non dérivable → on demande
    const input = prompt(
      "Colle l'URL d'édition de ta Google Sheet :\n\n" +
      "(format : https://docs.google.com/spreadsheets/d/<ID>/edit)\n\n" +
      "Tu peux la trouver en ouvrant ta sheet dans Google Drive — l'URL dans la barre d'adresse.\n" +
      "Elle sera mémorisée pour les prochaines fois."
    , '')
    if (!input) return
    const url = input.trim()
    if (!url.includes('/spreadsheets/d/')) {
      alert('URL invalide : doit contenir /spreadsheets/d/')
      return
    }
    // Sauve dans config.yaml
    try {
      const r = await fetch(`/api/sites/${siteId}/config`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blog_sheet_edit_url: url }),
      })
      if (r.ok) {
        setSheetEditUrlSaved(url)
        window.open(url, '_blank', 'noopener,noreferrer')
      } else {
        alert('Erreur sauvegarde — URL utilisée mais non persistée')
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (e: any) {
      alert('Erreur réseau : ' + e.message)
    }
  }
  // sheetEditUrl reste pour le `disabled` du bouton — on l'active si on a une URL
  // sauvegardée OU une URL CSV dérivable OU rien (auquel cas le prompt s'ouvrira).
  const sheetEditUrl = sheetEditUrlSaved || (sheetUrl || sheetUrlOriginal) || 'prompt'

  const categories = Array.from(new Set(posts.map(p => p.categorie).filter(Boolean))) as string[]
  const filtered = posts.filter(p => {
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false
    if (catFilter && p.categorie !== catFilter) return false
    if (statusFilter && (p.status || 'published') !== statusFilter) return false
    return true
  })

  return (
    <div style={{ padding: '32px 5vw', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, fontSize: 13 }}>
        <Link href="/sites" style={{ color: '#8B9CB0', textDecoration: 'none' }}>Sites</Link>
        <span style={{ color: '#4A5568' }}>›</span>
        <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none' }}>{siteId}</Link>
        <span style={{ color: '#4A5568' }}>›</span>
        <span style={{ color: '#fff' }}>Blog</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 28px', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 600, margin: 0 }}>📝 Gérer le blog</h1>
          <div style={{ color: '#8B9CB0', fontSize: 14, marginTop: 6 }}>{posts.length} article{posts.length > 1 ? 's' : ''} au total</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowSheetConfig(s => !s)} style={{ padding: '12px 18px', borderRadius: 10, background: '#1E2D3D', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            📊 Config sheet {showSheetConfig ? '▲' : '▼'}
          </button>
          <Link href={`/sites/${siteId}/blog/new`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderRadius: 10, background: '#00D4AA', color: '#0A0E1A', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            ✨ Nouvel article
          </Link>
        </div>
      </div>

      {/* Bloc configuration sheet (collapsible) */}
      {showSheetConfig && (
        <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>📊 Publication programmée via Google Sheet</div>
          <div style={{ color: '#8B9CB0', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
            Indique l'URL d'export CSV publié d'une Google Sheet. Les articles sont publiés automatiquement à la date/heure indiquée, vérifié toutes les heures.
            <br/>Colonnes attendues : <code style={{ color: '#00D4AA' }}>titre</code>, <code style={{ color: '#00D4AA' }}>categorie</code>, <code style={{ color: '#00D4AA' }}>date_publication</code>, <code style={{ color: '#00D4AA' }}>heure_publication</code>, <code style={{ color: '#00D4AA' }}>prompt_custom</code>, <code style={{ color: '#00D4AA' }}>slug</code>, <code style={{ color: '#00D4AA' }}>meta_title</code>, <code style={{ color: '#00D4AA' }}>meta_description</code>.
          </div>
          <label style={{ display: 'block', fontSize: 11, color: '#8B9CB0', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>URL Google Sheet CSV</label>
          <input type="text" value={sheetUrl} onChange={e => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/.../pub?output=csv"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, marginBottom: 12 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={saveSheet} disabled={savingSheet || sheetUrl === sheetUrlOriginal}
              style={{ padding: '10px 18px', borderRadius: 8, background: sheetUrl === sheetUrlOriginal ? '#1E2D3D' : '#00D4AA', color: sheetUrl === sheetUrlOriginal ? '#4A5568' : '#0A0E1A', fontSize: 13, fontWeight: 700, border: 'none', cursor: sheetUrl === sheetUrlOriginal ? 'default' : 'pointer' }}>
              {savingSheet ? '⏳' : '💾 Enregistrer'}
            </button>
            <button onClick={openPreview} disabled={!sheetUrlOriginal}
              style={{ padding: '10px 18px', borderRadius: 8, background: !sheetUrlOriginal ? '#1E2D3D' : '#F6AD55', color: !sheetUrlOriginal ? '#4A5568' : '#0A0E1A', fontSize: 13, fontWeight: 700, border: 'none', cursor: !sheetUrlOriginal ? 'default' : 'pointer' }}>
              🔄 Vérifier la sheet maintenant
            </button>
            {sheetMsg && <span style={{ fontSize: 12, color: sheetMsg.startsWith('✗') ? '#FC8181' : '#00D4AA' }}>{sheetMsg}</span>}
          </div>
        </div>
      )}

      {/* Articles en cours de génération */}
      {pending.length > 0 && (
        <div style={{ background: 'rgba(246,173,85,.08)', border: '1px solid #F6AD55', borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: '#F6AD55', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <strong style={{ color: '#F6AD55', fontSize: 14 }}>
              🤖 {pending.length} article{pending.length > 1 ? 's' : ''} en cours de génération
            </strong>
            <span style={{ color: '#8B9CB0', fontSize: 12 }}>· la liste se met à jour automatiquement</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pending.map((p, i) => {
              const ageSec = Math.floor((Date.now() - p.createdAt) / 1000)
              const ageLabel = ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}min ${ageSec % 60}s`
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 8 }}>
                  <span style={{ color: '#fff', fontSize: 13 }}>⏳ {p.title}</span>
                  <span style={{ color: '#4A5568', fontSize: 11 }}>il y a {ageLabel}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* Articles programmés pour une date future */}
      {scheduled.length > 0 && (
        <div style={{ background: 'rgba(94,158,214,.08)', border: '1px solid #5E9ED6', borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <strong style={{ color: '#5E9ED6', fontSize: 14 }}>
              📅 {scheduled.length} article{scheduled.length > 1 ? 's' : ''} programmé{scheduled.length > 1 ? 's' : ''}
            </strong>
            <span style={{ color: '#8B9CB0', fontSize: 12 }}>· seront publiés automatiquement à leur date</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...scheduled].sort((a, b) => (a.scheduledFor || '').localeCompare(b.scheduledFor || '')).map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 8, gap: 12 }}>
                <span style={{ color: '#fff', fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📅 {p.title}</span>
                <span style={{ color: '#5E9ED6', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{formatScheduledDate(p.scheduledFor)}</span>
                <button
                  onClick={() => openSheetForEdit()}
                  disabled={!sheetEditUrl}
                  title={sheetEditUrl ? 'Modifier la date dans la Google Sheet' : 'URL sheet introuvable'}
                  style={{ padding: '5px 10px', borderRadius: 6, background: 'transparent', border: '1px solid #2A4A6D', color: sheetEditUrl ? '#5E9ED6' : '#4A5568', fontSize: 11, fontWeight: 600, cursor: sheetEditUrl ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
                  📝 Modifier
                </button>
                <button
                  onClick={() => publishNow(p.title)}
                  disabled={publishingNow === p.title}
                  title="Publier immédiatement (ignore la date programmée)"
                  style={{ padding: '5px 10px', borderRadius: 6, background: publishingNow === p.title ? '#1E2D3D' : '#00D4AA', border: 'none', color: publishingNow === p.title ? '#4A5568' : '#0A0E1A', fontSize: 11, fontWeight: 700, cursor: publishingNow === p.title ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                  {publishingNow === p.title ? '⏳ ...' : '🚀 Publier'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input type="text" placeholder="🔍 Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 220px', padding: '10px 14px', borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 }} />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 }}>
          <option value="">Toutes catégories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 }}>
          <option value="">Tous statuts</option>
          <option value="published">Publié</option>
          <option value="scheduled">Programmé</option>
          <option value="draft">Brouillon</option>
        </select>
      </div>

      {/* Tableau */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#4A5568' }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#4A5568', background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16 }}>
          {posts.length === 0 ? "Aucun article. Clique sur ✨ Nouvel article pour commencer." : "Aucun résultat avec ces filtres."}
        </div>
      ) : (
        <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0A0E1A', borderBottom: '1px solid #1E2D3D' }}>
                <th style={th}>Titre</th>
                <th style={th}>Catégorie</th>
                <th style={th}>Date</th>
                <th style={th}>Statut</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.slug} style={{ borderBottom: '1px solid #1E2D3D' }}>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      {p.featured_image && siteDomain ? (
                        <img src={`${siteDomain}${p.featured_image}`} alt=""
                          loading="lazy"
                          title="Image à la une définie"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                          style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #1E2D3D', flexShrink: 0 }} />
                      ) : (
                        <div title="Pas d'image à la une"
                          style={{ width: 56, height: 56, borderRadius: 6, border: '1px dashed #2A3A4D', background: '#0A0E1A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3A4A5D', fontSize: 22, flexShrink: 0 }}>
                          🖼️
                        </div>
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ color: '#fff', fontSize: 14, fontWeight: 500, marginBottom: 3 }}>{p.title}</div>
                        {p.excerpt && <div style={{ color: '#4A5568', fontSize: 12 }}>{p.excerpt.slice(0, 90)}{p.excerpt.length > 90 ? '…' : ''}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={td}>
                    {p.categorie ? <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 12, background: '#1E2D3D', color: '#00D4AA', fontSize: 11, fontWeight: 600 }}>{p.categorie}</span> : <span style={{ color: '#4A5568' }}>—</span>}
                  </td>
                  <td style={{ ...td, color: '#8B9CB0', fontSize: 13 }}>{formatDate(p.date)}</td>
                  <td style={td}>
                    <span style={{ color: STATUS_COLOR[p.status || 'published'] || '#8B9CB0', fontSize: 12, fontWeight: 600 }}>
                      {STATUS_LABEL[p.status || 'published'] || p.status}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Link href={`/sites/${siteId}/blog/${p.slug}`} style={{ padding: '6px 12px', borderRadius: 6, background: '#1E2D3D', color: '#fff', fontSize: 12, textDecoration: 'none', marginRight: 6 }}>Éditer</Link>
                    <button onClick={() => del(p.slug, p.title)} style={{ padding: '6px 12px', borderRadius: 6, background: 'transparent', border: '1px solid #FC8181', color: '#FC8181', fontSize: 12, cursor: 'pointer' }}>Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modale Preview Sheet */}
      {showPreview && (
        <div onClick={() => !confirming && setShowPreview(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 14, padding: 28, maxWidth: 900, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: '0 0 4px' }}>📊 Aperçu de la sheet</h3>
                <div style={{ fontSize: 12, color: '#8B9CB0' }}>
                  Vérifie les articles avant de lancer la génération automatique.
                  {previewData?.fetched_at && (
                    <span style={{ marginLeft: 6, color: '#4A5568' }}>· lu à {new Date(previewData.fetched_at).toLocaleTimeString('fr-FR')}</span>
                  )}
                </div>
              </div>
              <button onClick={() => !confirming && setShowPreview(false)} disabled={confirming}
                style={{ background: 'transparent', border: 'none', color: '#8B9CB0', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
            </div>

            {previewLoading && (
              <div style={{ padding: 40, textAlign: 'center', color: '#8B9CB0' }}>
                ⏳ Lecture de la sheet en cours…
              </div>
            )}

            {!previewLoading && previewData?.error && (
              <div style={{ padding: 20, background: 'rgba(252,129,129,.08)', border: '1px solid #FC8181', borderRadius: 10, color: '#FC8181' }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>✗ {previewData.error}</div>
                {previewData.hint && <div style={{ fontSize: 13, color: '#FCA5A5', lineHeight: 1.5 }}>{previewData.hint}</div>}
                {previewData.sheet_url && (
                  <div style={{ fontSize: 11, color: '#8B9CB0', marginTop: 8, wordBreak: 'break-all' }}>URL testée : {previewData.sheet_url}</div>
                )}
              </div>
            )}

            {!previewLoading && previewData?.rows && (
              <>
                {/* Résumé */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, fontSize: 12 }}>
                  <span style={pill('#00D4AA')}>✓ {previewData.summary.eligible} à publier</span>
                  {previewData.summary.scheduled > 0 && <span style={pill('#F6AD55')}>⏰ {previewData.summary.scheduled} programmés</span>}
                  {previewData.summary.already_done > 0 && <span style={pill('#8B9CB0')}>✓ {previewData.summary.already_done} déjà publiés</span>}
                  {previewData.summary.invalid > 0 && <span style={pill('#FC8181')}>⚠ {previewData.summary.invalid} invalides</span>}
                  <span style={pill('#4A5568')}>{previewData.summary.total} lignes au total</span>
                </div>

                {/* Tableau des lignes */}
                <div style={{ overflow: 'auto', flex: 1, border: '1px solid #1E2D3D', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#0A0E1A', position: 'sticky', top: 0 }}>
                        <th style={th}>Titre</th>
                        <th style={th}>Catégorie</th>
                        <th style={th}>Date publication</th>
                        <th style={th}>Mots min.</th>
                        <th style={th}>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.rows.map((r: any, i: number) => (
                        <tr key={i} style={{ borderTop: '1px solid #1E2D3D', opacity: r.status === 'already_done' || r.status === 'skip_no_title' ? 0.5 : 1 }}>
                          <td style={tdSmall}>
                            <div style={{ color: '#fff', fontWeight: 500 }}>{r.titre || <span style={{ color: '#FC8181' }}>(vide)</span>}</div>
                            {r.meta_description && <div style={{ color: '#4A5568', fontSize: 11, marginTop: 2 }}>{r.meta_description.slice(0, 80)}{r.meta_description.length > 80 ? '…' : ''}</div>}
                          </td>
                          <td style={{ ...tdSmall, color: '#8B9CB0' }}>{r.categorie || '—'}</td>
                          <td style={{ ...tdSmall, color: '#8B9CB0' }}>
                            {r.date_publication ? `${r.date_publication}${r.heure_publication ? ' ' + r.heure_publication : ' 09:00'}` : <span style={{ color: '#00D4AA' }}>maintenant</span>}
                          </td>
                          <td style={{ ...tdSmall, color: '#8B9CB0' }}>{r.nombre_mots_minimum || '750'}</td>
                          <td style={tdSmall}>{renderStatus(r)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer modale */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: '#4A5568', flex: 1 }}>
                    {previewData.summary.eligible === 0
                      ? '⚠ Aucun article éligible — modifie la sheet ou ajoute des lignes.'
                      : `${previewData.summary.eligible} article${previewData.summary.eligible > 1 ? 's seront' : ' sera'} généré${previewData.summary.eligible > 1 ? 's' : ''} en arrière-plan via GitHub Actions (≈ 30-60s par article).`}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={openPreview} disabled={confirming || previewLoading}
                      title="Recharge la sheet (utile si tu viens de la modifier — Google cache peut prendre 5-15 min)"
                      style={{ padding: '10px 14px', borderRadius: 8, background: '#1E2D3D', color: '#8B9CB0', fontSize: 13, fontWeight: 600, border: 'none', cursor: previewLoading ? 'wait' : 'pointer' }}>
                      🔄 Recharger
                    </button>
                    <button onClick={() => setShowPreview(false)} disabled={confirming}
                      style={{ padding: '10px 18px', borderRadius: 8, background: '#1E2D3D', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      Annuler
                    </button>
                    <button onClick={confirmAndPublish} disabled={confirming || previewData.summary.eligible === 0}
                      style={{ padding: '10px 18px', borderRadius: 8, background: (confirming || previewData.summary.eligible === 0) ? '#1E2D3D' : '#00D4AA', color: (confirming || previewData.summary.eligible === 0) ? '#4A5568' : '#0A0E1A', fontSize: 13, fontWeight: 700, border: 'none', cursor: (confirming || previewData.summary.eligible === 0) ? 'default' : 'pointer' }}>
                      {confirming ? '⏳ Déclenchement…' : `🚀 Lancer la génération${previewData.summary.eligible > 0 ? ` (${previewData.summary.eligible})` : ''}`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function pill(color: string): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: 12,
    background: `${color}1A`,
    color,
    fontWeight: 600,
    border: `1px solid ${color}40`,
  }
}

function renderStatus(r: any): React.ReactNode {
  const color = {
    eligible: '#00D4AA',
    scheduled: '#F6AD55',
    already_done: '#8B9CB0',
    invalid_date: '#FC8181',
    skip_no_title: '#FC8181',
  }[r.status as string] || '#8B9CB0'
  const label = {
    eligible: '✓ À publier',
    scheduled: '⏰ Programmé',
    already_done: '✓ Déjà publié',
    invalid_date: '⚠ Date invalide',
    skip_no_title: '⚠ Pas de titre',
  }[r.status as string] || r.status
  return (
    <div>
      <span style={{ color, fontWeight: 600 }}>{label}</span>
      {r.reason && <div style={{ color: '#4A5568', fontSize: 10, marginTop: 2 }}>{r.reason}</div>}
    </div>
  )
}

const tdSmall: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' }

// Normalisation pour rapprocher titres attendus ↔ articles réels :
// minuscules, sans accents, espaces normalisés.
function normalizeTitle(t: string): string {
  return (t || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Formatte une date ISO pour la box "programmés" en relatif quand c'est proche :
// "Demain à 09:00", "Dans 3 jours · 09:00", "Le 15 mai à 09:00".
function formatScheduledDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((dDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 0) return `Aujourd'hui à ${time}`
  if (diffDays === 1) return `Demain à ${time}`
  if (diffDays > 1 && diffDays <= 7) return `Dans ${diffDays} jours · ${time}`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) + ` · ${time}`
}

function formatDate(s: string): string {
  if (!s) return '—'
  try {
    const d = new Date(s)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return s }
}

const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', color: '#8B9CB0', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
const td: React.CSSProperties = { padding: '14px 16px', verticalAlign: 'top' }
