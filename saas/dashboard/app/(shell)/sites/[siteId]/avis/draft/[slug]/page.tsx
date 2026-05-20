'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

// Page d'édition d'un brouillon d'avis.
// Le brouillon = une ligne dans la Google Sheet qui n'est pas encore publiée
// (pas de fichier .md dans posts_avis/). Sur cette page, Julien définit un
// prompt custom (avec sa structure Hn imposée) qui sera utilisé par le script
// Python pour générer les sections H2 entre le sommaire et "Retours d'expérience
// des utilisateurs". Le reste du contenu (intro, en bref, points forts/faibles,
// FAQ, verdict) est généré automatiquement avec les paramètres standards.
//
// Workflow utilisateur :
//   1. Édite le prompt (autosauvegardé dans posts_avis/_drafts.json)
//   2. Clique "🚀 Générer & Publier" → déclenche le workflow GitHub Actions
//   3. Attente ~3 min, puis l'avis devient publié et apparaît dans /sites/<id>/avis

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
  mot_minimum?: string
  status: 'published' | 'scheduled' | 'pending'
}

export default function AvisDraftPage() {
  const params = useParams()
  const siteId = params?.siteId as string
  const slug = params?.slug as string
  const router = useRouter()

  const [sheetRow, setSheetRow] = useState<SheetRow | null>(null)
  const [promptCustom, setPromptCustom] = useState('')
  const [originalPrompt, setOriginalPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // 1) Récupérer la ligne de la sheet correspondante
      try {
        const sheetRes = await fetch(`/api/sites/${siteId}/avis/preview-sheet`)
        const sheetData = await sheetRes.json()
        const rows: SheetRow[] = sheetData?.rows || []
        const matching = rows.find(r => r.slug === slug)
        if (cancelled) return
        if (matching) {
          setSheetRow(matching)
          // Si l'avis a déjà été publié, rediriger vers l'éditeur d'avis publié
          if (matching.status === 'published') {
            router.replace(`/sites/${siteId}/avis/${slug}`)
            return
          }
        }
      } catch {}

      // 2) Charger le prompt custom déjà sauvegardé (s'il existe)
      try {
        const draftRes = await fetch(`/api/sites/${siteId}/avis/draft/${slug}`)
        const d = await draftRes.json()
        if (cancelled) return
        const p = d?.draft?.prompt_custom || ''
        setPromptCustom(p)
        setOriginalPrompt(p)
      } catch {}

      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [siteId, slug, router])

  async function savePrompt(): Promise<boolean> {
    setSaving(true); setMsg('')
    try {
      const r = await fetch(`/api/sites/${siteId}/avis/draft/${slug}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_custom: promptCustom }),
      })
      const d = await r.json()
      if (d.ok) {
        setOriginalPrompt(promptCustom)
        setMsg('✓ Prompt sauvegardé')
        setSaving(false)
        setTimeout(() => setMsg(''), 4000)
        return true
      }
      setMsg('✗ ' + (d.error || 'Erreur sauvegarde'))
    } catch (e: any) {
      setMsg('✗ ' + (e?.message || e))
    }
    setSaving(false)
    return false
  }

  async function generateAndPublish() {
    if (!sheetRow) return
    if (!promptCustom.trim()) {
      setMsg('✗ Saisis d\'abord un prompt')
      return
    }
    if (!confirm(
      `Lancer la génération et publication de "${sheetRow.marque}" ?\n\n` +
      `• Claude va générer l'intro, en bref, points forts/faibles, FAQ, verdict (standard)\n` +
      `• Et les sections H2 entre sommaire et avis utilisateurs (selon ton prompt custom)\n` +
      `• Puis l'avis sera commité dans posts_avis/ et le site redéployé\n\n` +
      `Durée totale : ~3 minutes.`
    )) return

    // Sauvegarder le prompt avant de publier si non sauvegardé
    if (promptCustom !== originalPrompt) {
      const ok = await savePrompt()
      if (!ok) return
    }

    setPublishing(true); setMsg('')
    try {
      const r = await fetch(`/api/sites/${siteId}/avis/publish-now`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marques: [sheetRow.marque] }),
      })
      const d = await r.json()
      if (d.ok) {
        setMsg('✓ Publication lancée. Workflow GitHub en cours (~3 min). Redirection...')
        setTimeout(() => router.push(`/sites/${siteId}/avis`), 3500)
      } else {
        setMsg('✗ ' + (d.error || 'Erreur'))
      }
    } catch (e: any) {
      setMsg('✗ ' + (e?.message || e))
    }
    setPublishing(false)
  }

  if (loading) {
    return <div style={{ padding: 32, color: '#8B9CB0' }}>Chargement...</div>
  }
  if (!sheetRow) {
    return (
      <div style={{ padding: 32, color: '#FC8181' }}>
        Brouillon introuvable. Vérifie que la marque existe bien dans la Google Sheet.
        <div style={{ marginTop: 16 }}>
          <Link href={`/sites/${siteId}/avis`} style={{ color: '#5E9ED6' }}>← Retour aux avis</Link>
        </div>
      </div>
    )
  }

  const isDirty = promptCustom !== originalPrompt
  const canPublish = !!promptCustom.trim() && !publishing

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto', color: '#fff' }}>
      <div style={{ marginBottom: 12, fontSize: 13, color: '#8B9CB0' }}>
        <Link href={`/sites/${siteId}/avis`} style={{ color: '#8B9CB0', textDecoration: 'none' }}>← Tous les avis</Link>
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 6px' }}>
        ✏️ Brouillon : {sheetRow.marque}
      </h1>
      <p style={{ color: '#8B9CB0', fontSize: 13, margin: '0 0 24px', maxWidth: 800 }}>
        Définis ton prompt custom pour les sections H2 entre le sommaire et le bloc « Retours d'expérience des utilisateurs ».
        Le reste du contenu (intro, en bref, points forts/faibles, FAQ, verdict) sera généré automatiquement avec les paramètres standards.
      </p>

      {/* Métadonnées sheet (lecture seule) */}
      <div style={{ background: '#0E1422', border: '1px solid #1E2D3D', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 12 }}>
          📊 Données issues de la sheet (lecture seule)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, fontSize: 13 }}>
          <Field label="Marque" value={sheetRow.marque} />
          <Field label="Catégorie" value={sheetRow.categorie} />
          <Field label="Sentiment" value={sheetRow.sentiment} />
          <Field label="Note" value={sheetRow.note_globale ? `${sheetRow.note_globale}/5 ⭐` : ''} />
          <Field label="Date de publication" value={sheetRow.date_publication || '(immédiate)'} />
          <Field label="Status actuel" value={sheetRow.status === 'pending' ? '⏳ En attente' : (sheetRow.status === 'scheduled' ? '📅 Programmé' : sheetRow.status)} />
          <Field label="CTA" value={sheetRow.cta_url} />
          <Field label="Cible" value={sheetRow.cible} />
          <Field label="Mots min" value={sheetRow.mot_minimum || '800'} />
        </div>
      </div>

      {/* Prompt custom */}
      <div style={{ background: '#0E1422', border: '1px solid #1E2D3D', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
            🎯 Prompt custom + structure Hn
          </div>
          {isDirty && <span style={{ fontSize: 11, color: '#F6AD55', fontWeight: 600 }}>● Modifications non sauvegardées</span>}
          {!isDirty && originalPrompt && <span style={{ fontSize: 11, color: '#3D7A4F', fontWeight: 600 }}>✓ Sauvegardé</span>}
        </div>

        <textarea
          value={promptCustom}
          onChange={e => setPromptCustom(e.target.value)}
          placeholder={`Exemple de prompt à adapter :

Rédige des sections H2 sur ${sheetRow.marque} (${sheetRow.categorie}) avec cette structure :

<h2>Présentation de ${sheetRow.marque}</h2>
  <h3>Origine et positionnement</h3>
  <h3>À qui ça s'adresse</h3>

<h2>Fonctionnalités principales</h2>
  (détaille 3 fonctionnalités phares en sous-paragraphes)

<h2>Tarifs et offres</h2>
  (compare les paliers, indique le rapport qualité/prix)

<h2>Sécurité et conformité</h2>
  (RGPD, certifications, support technique)

Contraintes :
- HTML pur uniquement (<h2>, <h3>, <p>, <strong>, <ul>, <li>)
- Pas de markdown, pas de tirets longs
- Ton factuel, sans superlatifs
- ~800 mots au total pour ces sections`}
          rows={20}
          style={{
            width: '100%', padding: 14, borderRadius: 8,
            background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0',
            fontSize: 13, lineHeight: 1.6, fontFamily: 'monospace',
            outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical' as const,
          }}
        />

        <div style={{ marginTop: 10, fontSize: 11, color: '#8B9CB0', lineHeight: 1.6 }}>
          💡 Le prompt doit décrire les sections H2 (et éventuellement H3) à générer. Claude rédige tout en HTML brut.
          <br />
          📝 Sauvegarde aussi souvent que tu veux — la publication ne se déclenche que via le bouton « Générer & Publier ».
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' as const }}>
        <button onClick={() => savePrompt()} disabled={saving || !isDirty}
          style={{
            padding: '10px 18px', borderRadius: 8,
            background: isDirty ? '#5E9ED6' : '#1E2D3D',
            color: isDirty ? '#fff' : '#4A5568',
            border: 'none', fontWeight: 700, fontSize: 13,
            cursor: (saving || !isDirty) ? 'default' : 'pointer',
          }}>
          {saving ? '⏳ Sauvegarde...' : '💾 Sauvegarder le prompt'}
        </button>

        <button onClick={generateAndPublish} disabled={!canPublish}
          title={!promptCustom.trim() ? 'Renseigne d\'abord un prompt' : 'Génère le contenu via Claude et publie l\'avis'}
          style={{
            padding: '10px 18px', borderRadius: 8,
            background: !canPublish ? '#1E2D3D' : '#3D7A4F',
            color: !canPublish ? '#4A5568' : '#fff',
            border: 'none', fontWeight: 700, fontSize: 13,
            cursor: !canPublish ? 'not-allowed' : 'pointer',
          }}>
          {publishing ? '⏳ Lancement workflow...' : '🚀 Générer & Publier'}
        </button>

        {msg && (
          <span style={{ fontSize: 13, color: msg.startsWith('✓') ? '#3D7A4F' : '#C0392B', marginLeft: 8 }}>
            {msg}
          </span>
        )}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#4A5568', fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 2, letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ color: value ? '#E2E8F0' : '#4A5568', fontSize: 13, wordBreak: 'break-all' as const }}>
        {value || '—'}
      </div>
    </div>
  )
}
