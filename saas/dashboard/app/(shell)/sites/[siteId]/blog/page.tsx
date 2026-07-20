'use client'
import { useEffect, useState, useMemo } from 'react'
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
  featured_image?: string
}

type TabKey = 'published' | 'scheduled' | 'draft'

// Classement d'un article dans un onglet : on regarde d'abord le status='draft'
// (champ explicite), sinon on compare la date à maintenant.
// IMPORTANT : on ne se fie pas à p.status pour distinguer 'published' vs
// 'scheduled' parce que le script Python blog_publish_scheduled.py écrit
// toujours 'published' dans le frontmatter, peu importe la date. C'est donc
// la date qui détermine si un article est accessible sur le site public
// (date <= now → publié) ou en attente (date > now → programmé).
function classifyPost(p: { date?: string; status?: string } | null | undefined, now: Date): TabKey {
  // Défensif : un post mal-formé (sans .date, ou .status d'un type bizarre)
  // ne fait pas crasher l'app.
  if (!p) return 'published'
  if (p.status === 'draft') return 'draft'
  if (p.date) {
    try {
      const d = new Date(p.date)
      if (!isNaN(d.getTime()) && d > now) return 'scheduled'
    } catch { /* date malformée → traité comme en ligne */ }
  }
  return 'published'
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
  // ── Onglet actif. Par défaut : "Publiés" (le plus consulté au quotidien).
  // Les boxes jaune (pending) et bleue (scheduled depuis sheet) restent
  // toujours visibles en haut quel que soit l'onglet.
  // Onglet par défaut : "Publiés" (le plus consulté). Si vide ET qu'il y a
  // des programmés, on switch automatiquement à l'init (UX : ne pas atterrir
  // sur un onglet vide).
  const [activeTab, setActiveTab] = useState<TabKey>('published')
  const [autoSwitched, setAutoSwitched] = useState(false)
  const [pending, setPending] = useState<{ title: string; createdAt: number }[]>([])
  const [scheduled, setScheduled] = useState<{ title: string; scheduledFor: string; createdAt: number }[]>([])
  const [publishingNow, setPublishingNow] = useState<string | null>(null)
  const [showSheetConfig, setShowSheetConfig] = useState(false)
  const [sheetUrl, setSheetUrl] = useState('')
  const [sheetUrlOriginal, setSheetUrlOriginal] = useState('')
  const [savingSheet, setSavingSheet] = useState(false)
  const [sheetMsg, setSheetMsg] = useState('')
  const [siteDomain, setSiteDomain] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState<any>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => { load(); loadConfig(); loadPending(); loadScheduled(); syncScheduledFromSheet() }, [siteId])

  // Auto-switch sur l'onglet "Programmés" SI l'onglet par défaut "Publiés"
  // est vide ET qu'il y a des programmés. Évite d'atterrir sur un onglet
  // vide quand 100% des articles ont une date future.
  useEffect(() => {
    if (autoSwitched || loading || posts.length === 0) return
    const now = new Date()
    const c = { published: 0, scheduled: 0, draft: 0 } as Record<TabKey, number>
    for (const p of posts) c[classifyPost(p, now)]++
    if (c.published === 0 && c.scheduled > 0) {
      setActiveTab('scheduled')
    }
    setAutoSwitched(true)
  }, [posts, loading, autoSwitched])

  async function syncScheduledFromSheet() {
    try {
      const r = await fetch(`/api/sites/${siteId}/blog/preview-sheet`)
      if (!r.ok) return
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
      setScheduled(prev => {
        const existingTitles = new Set(prev.map(p => normalizeTitle(p.title)))
        const newOnes = sheetScheduled.filter((s: any) => !existingTitles.has(normalizeTitle(s.title)))
        const refreshed = prev.map(p => {
          const found = sheetScheduled.find((s: any) => normalizeTitle(s.title) === normalizeTitle(p.title))
          return found ? { ...p, scheduledFor: found.scheduledFor } : p
        })
        const merged = [...refreshed, ...newOnes]
        saveScheduled(merged)
        return merged
      })
    } catch { /* silencieux */ }
  }

  useEffect(() => {
    if (pending.length === 0 && scheduled.length === 0) return
    const interval = pending.length > 0 ? 15000 : 5 * 60 * 1000
    const id = setInterval(() => { load() }, interval)
    return () => clearInterval(id)
  }, [pending.length, scheduled.length])

  useEffect(() => {
    if (pending.length === 0 && scheduled.length === 0) return
    // Match par signature (8 mots) + fallback norm exact, comme scheduledVisible
    const realSignatures = new Set(posts.map(p => titleSignature(p.title)))
    const realNorms = new Set(posts.map(p => normalizeTitle(p.title)))
    const isInPosts = (title: string) => {
      const sig = titleSignature(title)
      if (sig.length < 20) return realNorms.has(normalizeTitle(title))
      return realSignatures.has(sig)
    }
    const now = Date.now()
    const PENDING_MAX_AGE_MS = 10 * 60 * 1000
    const SCHEDULED_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000
    const newPending = pending.filter(p =>
      !isInPosts(p.title) &&
      now - p.createdAt < PENDING_MAX_AGE_MS
    )
    const newScheduled = scheduled.filter(p =>
      !isInPosts(p.title) &&
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
  function loadPending() { try { const raw = localStorage.getItem(pendingKey()); if (raw) setPending(JSON.parse(raw)) } catch {} }
  function loadScheduled() { try { const raw = localStorage.getItem(scheduledKey()); if (raw) setScheduled(JSON.parse(raw)) } catch {} }
  function savePending(p: any[]) { try { if (p.length > 0) localStorage.setItem(pendingKey(), JSON.stringify(p)); else localStorage.removeItem(pendingKey()) } catch {} }
  function saveScheduled(s: any[]) { try { if (s.length > 0) localStorage.setItem(scheduledKey(), JSON.stringify(s)); else localStorage.removeItem(scheduledKey()) } catch {} }

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/sites/${siteId}/blog`)
      const data = await r.json()
      setPosts(data.posts || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const [sheetEditUrlSaved, setSheetEditUrlSaved] = useState('')

  async function loadConfig() {
    try {
      const r = await fetch(`/api/sites/${siteId}/config`)
      const d = await r.json()
      setSheetUrl(d.blog_sheet_csv_url || '')
      setSheetUrlOriginal(d.blog_sheet_csv_url || '')
      setSheetEditUrlSaved(d.blog_sheet_edit_url || '')
      if (d.domain) {
        const dom = String(d.domain).replace(/\/+$/, '')
        setSiteDomain(dom.startsWith('http') ? dom : `https://${dom}`)
      }
    } catch {}
  }

  async function saveSheet() {
    setSavingSheet(true); setSheetMsg('')
    let urlToSave = sheetUrl.trim()
    if (urlToSave) {
      urlToSave = urlToSave.replace(/\/pubhtml(\?[^#]*)?(#.*)?$/, '/pub?output=csv')
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
        setSheetUrl(urlToSave); setSheetUrlOriginal(urlToSave)
        setSheetMsg(urlToSave !== sheetUrl.trim() ? '✓ URL normalisée et enregistrée' : '✓ Sheet enregistrée')
      } else { setSheetMsg(`✗ ${data.error || `Erreur ${r.status}`}`) }
    } catch (e: any) { setSheetMsg(`✗ ${e.message}`) }
    setSavingSheet(false)
    setTimeout(() => setSheetMsg(''), 4000)
  }

  async function openPreview() {
    setShowPreview(true); setPreviewLoading(true); setPreviewData(null)
    try {
      const r = await fetch(`/api/sites/${siteId}/blog/preview-sheet`)
      const data = await r.json()
      if (r.ok) setPreviewData(data)
      else setPreviewData({ error: data.error || `Erreur ${r.status}`, hint: data.hint })
    } catch (e: any) { setPreviewData({ error: e.message }) }
    setPreviewLoading(false)
  }

  async function confirmAndPublish() {
    setConfirming(true)
    try {
      const r = await fetch(`/api/sites/${siteId}/blog/check-sheet`, { method: 'POST' })
      const d = await r.json()
      if (r.ok) {
        const eligible = (previewData?.rows || [])
          .filter((row: any) => row.status === 'eligible')
          .map((row: any) => ({ title: row.titre as string, createdAt: Date.now() }))
        if (eligible.length > 0) {
          const merged = [...pending, ...eligible.filter((e: any) =>
            !pending.some(p => normalizeTitle(p.title) === normalizeTitle(e.title))
          )]
          setPending(merged); savePending(merged)
        }
        const scheduledRows = (previewData?.rows || [])
          .filter((row: any) => row.status === 'scheduled')
          .map((row: any) => ({ title: row.titre as string, scheduledFor: row.pub_at as string, createdAt: Date.now() }))
        if (scheduledRows.length > 0) {
          const merged = [...scheduled, ...scheduledRows.filter((e: any) =>
            !scheduled.some(p => normalizeTitle(p.title) === normalizeTitle(e.title))
          )]
          setScheduled(merged); saveScheduled(merged)
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
    } catch (e: any) { setPreviewData((prev: any) => ({ ...prev, error: e.message })) }
    setConfirming(false)
  }

  async function del(slug: string, title: string) {
    if (!confirm(`Supprimer l'article "${title}" ?`)) return
    const r = await fetch(`/api/sites/${siteId}/blog/${slug}`, { method: 'DELETE' })
    if (r.ok) { load(); return }
    let msg = 'Erreur suppression'
    try { const d = await r.json(); if (d?.error) msg = d.error } catch { /* noop */ }
    alert(msg)
  }

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
        const newScheduled = scheduled.filter(s => s.title !== title)
        setScheduled(newScheduled); saveScheduled(newScheduled)
        const merged = [...pending, { title, createdAt: Date.now() }]
        setPending(merged); savePending(merged)
      } else { alert('Erreur déclenchement : ' + (d.error || 'inconnue')) }
    } catch (e: any) { alert('Erreur réseau : ' + e.message) }
    setPublishingNow(null)
  }

  async function openSheetForEdit() {
    if (sheetEditUrlSaved) { window.open(sheetEditUrlSaved, '_blank', 'noopener,noreferrer'); return }
    const csv = sheetUrl || sheetUrlOriginal
    if (csv) {
      const direct = csv.match(/\/spreadsheets\/d\/(?!e\/)([a-zA-Z0-9_-]+)/)
      if (direct) {
        const editUrl = `https://docs.google.com/spreadsheets/d/${direct[1]}/edit`
        window.open(editUrl, '_blank', 'noopener,noreferrer')
        return
      }
    }
    const input = prompt(
      "Colle l'URL d'édition de ta Google Sheet :\n\n" +
      "(format : https://docs.google.com/spreadsheets/d/<ID>/edit)\n\n" +
      "Tu peux la trouver en ouvrant ta sheet dans Google Drive.\n" +
      "Elle sera mémorisée pour les prochaines fois.", '')
    if (!input) return
    const url = input.trim()
    if (!url.includes('/spreadsheets/d/')) { alert('URL invalide'); return }
    try {
      const r = await fetch(`/api/sites/${siteId}/config`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blog_sheet_edit_url: url }),
      })
      if (r.ok) { setSheetEditUrlSaved(url); window.open(url, '_blank', 'noopener,noreferrer') }
      else { alert('Erreur sauvegarde'); window.open(url, '_blank', 'noopener,noreferrer') }
    } catch (e: any) { alert('Erreur réseau : ' + e.message) }
  }
  const sheetEditUrl = sheetEditUrlSaved || (sheetUrl || sheetUrlOriginal) || 'prompt'

  // ── Comptages par onglet (mémoized pour éviter re-calcul à chaque keystroke) ──
  // Compteurs par onglet.
  // - published : .md à date passée
  // - scheduled : .md à date future + items de la sheet (dédup par titre normalisé)
  // - draft     : .md avec status='draft'
  // Le merge avec la sheet est important : tes articles "à venir" vivent
  // souvent dans la sheet uniquement (pas encore de .md), donc l'onglet
  // "Programmés" doit les inclure pour avoir un compteur non trompeur.
  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { published: 0, scheduled: 0, draft: 0 }
    try {
      const now = new Date()
      const realSignatures = new Set<string>()
      const realNorms = new Set<string>()
      // Posts (.md) : classés selon date/status, et leur signature/norm va
      // dans les Sets pour le rapprochement avec les items sheet.
      if (Array.isArray(posts)) {
        for (const p of posts) {
          const tab = classifyPost(p, now)
          c[tab]++
          realSignatures.add(titleSignature((p as any)?.title))
          realNorms.add(normalizeTitle((p as any)?.title))
        }
      }
      // Items de la sheet : ajoutés s'ils ne sont PAS déjà dans posts
      // (match par signature 8 mots, fallback exact pour titres très courts).
      if (Array.isArray(scheduled)) {
        for (const s of scheduled) {
          if (!s) continue
          const sig = titleSignature((s as any)?.title)
          const norm = normalizeTitle((s as any)?.title)
          const isMatched = sig.length < 20 ? realNorms.has(norm) : realSignatures.has(sig)
          if (!isMatched) c.scheduled++
        }
      }
    } catch (e) {
      console.error('counts computation failed', e)
    }
    return c
  }, [posts, scheduled])

  // Liste filtrée des "programmés depuis la sheet" affichables : on retire
  // les titres déjà présents dans posts (.md). Sans ce filtre, un article
  // publié via "Publier maintenant" continue d'apparaître dans la box bleue
  // tant que la sheet n'a pas été mise à jour (status changé en 'done').
  // Le useEffect de cleanup met aussi à jour `scheduled` côté localStorage,
  // mais à chaque syncScheduledFromSheet() la sheet ré-injecte les titres,
  // donc ce filtre dérivé est plus robuste pour l'affichage.
  const scheduledVisible = useMemo(() => {
    // Signature par préfixe (8 mots) au lieu du titre complet, pour gérer
    // les cas où la fin du titre diffère (ex. l'IA tronque "...conseils
    // pratiques" en "...conseils" lors de la génération du .md).
    const realSignatures = new Set(posts.map(p => titleSignature(p.title)))
    return scheduled.filter(s => {
      const sig = titleSignature(s.title)
      // Sig courte (< 20 chars = 2-3 mots) → on fallback sur normalize exact
      // pour éviter des faux positifs ("Avis 2026" pourrait matcher trop large)
      if (sig.length < 20) {
        const norm = normalizeTitle(s.title)
        return !posts.some(p => normalizeTitle(p.title) === norm)
      }
      return !realSignatures.has(sig)
    })
  }, [scheduled, posts])

  // Filtrage : onglet → puis recherche + catégorie (les filtres s'appliquent
  // dans l'onglet actif uniquement). Plus de filtre "statut" car redondant.
  const categories = useMemo(() => Array.from(new Set(posts.map(p => p.categorie).filter(Boolean))) as string[], [posts])
  const filtered = useMemo(() => {
    const now = new Date()
    return posts.filter(p => {
      if (classifyPost(p, now) !== activeTab) return false
      if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false
      if (catFilter && p.categorie !== catFilter) return false
      return true
    })
  }, [posts, activeTab, search, catFilter])

  // Safety : si on est sur un onglet qui est devenu vide (cas où le cron a
  // publié tous les .md programmés en arrière-plan), bascule sur "En ligne".
  // Doit être APRÈS le useMemo `counts` (temporal dead zone sinon — Next.js
  // évalue les deps au render et `counts` doit déjà être défini).
  useEffect(() => {
    if (activeTab === 'scheduled' && counts.scheduled === 0 && !loading) {
      setActiveTab('published')
    }
    if (activeTab === 'draft' && counts.draft === 0 && !loading) {
      setActiveTab('published')
    }
  }, [counts.scheduled, counts.draft, activeTab, loading])

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
          <div style={{ color: '#8B9CB0', fontSize: 14, marginTop: 6 }}>
            {posts.length} article{posts.length > 1 ? 's' : ''} au total
            {' · '}
            <span style={{ color: '#00D4AA' }}>{counts.published} en ligne</span>
            {counts.scheduled > 0 && <>{' · '}<span style={{ color: '#F6AD55' }}>{counts.scheduled} programmé{counts.scheduled > 1 ? 's' : ''}</span></>}
            {counts.draft > 0 && <>{' · '}<span style={{ color: '#8B9CB0' }}>{counts.draft} brouillon{counts.draft > 1 ? 's' : ''}</span></>}
          </div>
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

      {/* ── ONGLETS ─────────────────────────────────────────────────
          Sépare la longue liste en 2-3 vues distinctes pour ne pas
          mélanger publiés et programmés. Compteurs en temps réel. */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #1E2D3D' }}>
        <TabButton active={activeTab === 'published'} onClick={() => setActiveTab('published')} color={STATUS_COLOR.published}>
          🌐 En ligne <span style={{ opacity: 0.7 }}>({counts.published})</span>
        </TabButton>
        {/* L'onglet Programmés ne s'affiche que s'il y a des .md avec date
            future. Sinon (cas courant chez Julien : tout vient de la Google
            Sheet, aucun .md scheduled), l'utilisateur voit ses futurs articles
            dans la "box bleue" au-dessus du tableau, pas dans le tableau.
            Évite l'onglet trompeur "Programmés (0)". */}
        {counts.scheduled > 0 && (
          <TabButton active={activeTab === 'scheduled'} onClick={() => setActiveTab('scheduled')} color={STATUS_COLOR.scheduled}>
            📅 Programmés <span style={{ opacity: 0.7 }}>({counts.scheduled})</span>
          </TabButton>
        )}
        {counts.draft > 0 && (
          <TabButton active={activeTab === 'draft'} onClick={() => setActiveTab('draft')} color={STATUS_COLOR.draft}>
            ✏️ Brouillons <span style={{ opacity: 0.7 }}>({counts.draft})</span>
          </TabButton>
        )}
      </div>

      {/* Box "Programmés depuis la sheet" — affichée UNIQUEMENT dans l'onglet
          Programmés. C'est l'endroit logique pour la trouver vu qu'on parle
          d'articles à venir. Quand on est sur "En ligne", on ne veut pas voir
          la box (qui noyait le contenu avant). */}
      {activeTab === 'scheduled' && scheduledVisible.length > 0 && (
        <div style={{ background: 'rgba(94,158,214,.08)', border: '1px solid #5E9ED6', borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <strong style={{ color: '#5E9ED6', fontSize: 14 }}>
              📅 {scheduledVisible.length} article{scheduledVisible.length > 1 ? 's' : ''} programmé{scheduledVisible.length > 1 ? 's' : ''} (depuis la sheet)
            </strong>
            <span style={{ color: '#8B9CB0', fontSize: 12 }}>· seront publiés automatiquement à leur date</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 480, overflowY: 'auto' }}>
            {[...scheduledVisible].sort((a, b) => (a.scheduledFor || '').localeCompare(b.scheduledFor || '')).map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 8, gap: 12 }}>
                <span style={{ color: '#fff', fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📅 {p.title}</span>
                <span style={{ color: '#5E9ED6', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{formatScheduledDate(p.scheduledFor)}</span>
                <button onClick={() => openSheetForEdit()} disabled={!sheetEditUrl}
                  title={sheetEditUrl ? 'Modifier la date dans la Google Sheet' : 'URL sheet introuvable'}
                  style={{ padding: '5px 10px', borderRadius: 6, background: 'transparent', border: '1px solid #2A4A6D', color: sheetEditUrl ? '#5E9ED6' : '#4A5568', fontSize: 11, fontWeight: 600, cursor: sheetEditUrl ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
                  📝 Modifier
                </button>
                <button onClick={() => publishNow(p.title)} disabled={publishingNow === p.title}
                  title="Publier immédiatement (ignore la date programmée)"
                  style={{ padding: '5px 10px', borderRadius: 6, background: publishingNow === p.title ? '#1E2D3D' : '#00D4AA', border: 'none', color: publishingNow === p.title ? '#4A5568' : '#0A0E1A', fontSize: 11, fontWeight: 700, cursor: publishingNow === p.title ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                  {publishingNow === p.title ? '⏳ ...' : '🚀 Publier'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtres dans l'onglet courant — filtre statut supprimé (redondant avec les onglets) */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input type="text" placeholder="🔍 Rechercher dans cet onglet..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 220px', padding: '10px 14px', borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 }} />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 }}>
          <option value="">Toutes catégories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Tableau */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#4A5568' }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#4A5568', background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16 }}>
          {posts.length === 0
            ? "Aucun article. Clique sur ✨ Nouvel article pour commencer."
            : counts[activeTab] === 0
              ? `Aucun article ${activeTab === 'published' ? 'en ligne' : activeTab === 'scheduled' ? 'programmé' : 'en brouillon'}.`
              : "Aucun résultat avec ces filtres."}
        </div>
      ) : (
        <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0A0E1A', borderBottom: '1px solid #1E2D3D' }}>
                <th style={th}>Titre</th>
                <th style={th}>Catégorie</th>
                <th style={th}>Date</th>
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

      {/* Modale Preview Sheet (inchangée) */}
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

            {previewLoading && <div style={{ padding: 40, textAlign: 'center', color: '#8B9CB0' }}>⏳ Lecture de la sheet en cours…</div>}

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
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, fontSize: 12 }}>
                  <span style={pill('#00D4AA')}>✓ {previewData.summary.eligible} à publier</span>
                  {previewData.summary.scheduled > 0 && <span style={pill('#F6AD55')}>⏰ {previewData.summary.scheduled} programmés</span>}
                  {previewData.summary.already_done > 0 && <span style={pill('#8B9CB0')}>✓ {previewData.summary.already_done} déjà publiés</span>}
                  {previewData.summary.invalid > 0 && <span style={pill('#FC8181')}>⚠ {previewData.summary.invalid} invalides</span>}
                  <span style={pill('#4A5568')}>{previewData.summary.total} lignes au total</span>
                </div>

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

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: '#4A5568', flex: 1 }}>
                    {previewData.summary.eligible === 0
                      ? '⚠ Aucun article éligible — modifie la sheet ou ajoute des lignes.'
                      : `${previewData.summary.eligible} article${previewData.summary.eligible > 1 ? 's seront' : ' sera'} généré${previewData.summary.eligible > 1 ? 's' : ''} en arrière-plan via GitHub Actions (≈ 30-60s par article).`}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={openPreview} disabled={confirming || previewLoading}
                      title="Recharge la sheet"
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

// ─── Composant onglet ────────────────────────────────────────────────────
function TabButton({ active, onClick, color, children }: { active: boolean; onClick: () => void; color: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '10px 18px',
        background: 'transparent',
        border: 'none',
        color: active ? color : '#8B9CB0',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        borderBottom: active ? `2px solid ${color}` : '2px solid transparent',
        marginBottom: -1, // chevauche le borderBottom du parent pour effet "onglet"
        transition: 'color .15s',
      }}>
      {children}
    </button>
  )
}

function pill(color: string): React.CSSProperties {
  return { display: 'inline-block', padding: '4px 10px', borderRadius: 12, background: `${color}1A`, color, fontWeight: 600, border: `1px solid ${color}40` }
}

function renderStatus(r: any): React.ReactNode {
  const color = { eligible: '#00D4AA', scheduled: '#F6AD55', already_done: '#8B9CB0', invalid_date: '#FC8181', skip_no_title: '#FC8181' }[r.status as string] || '#8B9CB0'
  const label = { eligible: '✓ À publier', scheduled: '⏰ Programmé', already_done: '✓ Déjà publié', invalid_date: '⚠ Date invalide', skip_no_title: '⚠ Pas de titre' }[r.status as string] || r.status
  return (
    <div>
      <span style={{ color, fontWeight: 600 }}>{label}</span>
      {r.reason && <div style={{ color: '#4A5568', fontSize: 10, marginTop: 2 }}>{r.reason}</div>}
    </div>
  )
}

const tdSmall: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' }

function normalizeTitle(t: any): string {
  // Défensif : accepte n'importe quoi (string, undefined, null, number).
  // Si jamais un post a un title non-string (ancien .md corrompu), évite
  // un crash sur .normalize() qui n'existe que sur les strings.
  if (typeof t !== 'string') return ''
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Signature d'un titre = ses 8 premiers mots normalisés.
// Sert au rapprochement scheduled (sheet) ↔ posts (.md) qui peuvent avoir des
// titres légèrement différents (l'IA tronque parfois la fin lors de la génération,
// ex. sheet="...conseils pratiques" vs .md="...conseils"). 8 mots = signature
// suffisamment unique pour éviter les faux positifs tout en tolérant les
// variations sur les derniers mots.
function titleSignature(t: any): string {
  const norm = normalizeTitle(t)
  if (!norm) return ''
  return norm.split(' ').slice(0, 8).join(' ')
}

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
  try { const d = new Date(s); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return s }
}

const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', color: '#8B9CB0', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
const td: React.CSSProperties = { padding: '14px 16px', verticalAlign: 'top' }
