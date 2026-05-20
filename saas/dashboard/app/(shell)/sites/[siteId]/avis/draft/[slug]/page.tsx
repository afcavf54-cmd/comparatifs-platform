'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

// Page d'édition d'un brouillon d'avis.
// Le brouillon = une ligne dans la Google Sheet qui n'est pas encore publiée
// (pas de fichier .md dans posts_avis/). Sur cette page, Julien définit :
//   1. Un prompt custom (structure Hn imposée) → utilisé pour générer le bloc
//      HTML des sections H2 entre le sommaire et "Retours d'expérience des
//      utilisateurs".
//   2. Une liste de questions FAQ imposées → si non vide, c'est cette liste qui
//      sera utilisée et NON celle inventée par Claude (évite le doublon).
// Le reste du contenu (intro, en bref, points forts/faibles, verdict) est
// généré automatiquement avec les paramètres standards.
//
// Workflow utilisateur :
//   1. Édite le prompt + les questions FAQ (autosauvegardé dans _drafts.json)
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
  // ─── Questions FAQ imposées ──────────────────────────────────────────────
  // Tableau de strings, chaque entrée = 1 question. Vide tant que l'éditeur
  // n'en a pas ajouté. Si la liste est vide à la publication → comportement
  // historique (Claude invente 4 questions + réponses). Sinon → Claude utilise
  // ces questions verbatim et ne génère QUE les réponses.
  const [faqQuestions, setFaqQuestions] = useState<string[]>([])
  const [originalFaq, setOriginalFaq] = useState<string[]>([])

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
          if (matching.status === 'published') {
            router.replace(`/sites/${siteId}/avis/${slug}`)
            return
          }
        }
      } catch {}

      // 2) Charger le prompt custom + questions FAQ sauvegardés
      try {
        const draftRes = await fetch(`/api/sites/${siteId}/avis/draft/${slug}`)
        const d = await draftRes.json()
        if (cancelled) return
        const p = d?.draft?.prompt_custom || ''
        setPromptCustom(p)
        setOriginalPrompt(p)
        const fq = Array.isArray(d?.draft?.faq_questions) ? d.draft.faq_questions : []
        setFaqQuestions(fq)
        setOriginalFaq(fq)
      } catch {}

      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [siteId, slug, router])

  // ─── Helpers FAQ ────────────────────────────────────────────────────────
  function addFaqQuestion() {
    setFaqQuestions(prev => [...prev, ''])
  }
  function updateFaqQuestion(idx: number, val: string) {
    setFaqQuestions(prev => prev.map((q, i) => (i === idx ? val : q)))
  }
  function removeFaqQuestion(idx: number) {
    setFaqQuestions(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveDraft(): Promise<boolean> {
    setSaving(true); setMsg('')
    try {
      // On filtre les questions vides côté client avant envoi
      const cleanedFaq = faqQuestions.map(q => q.trim()).filter(Boolean)
      const r = await fetch(`/api/sites/${siteId}/avis/draft/${slug}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_custom: promptCustom, faq_questions: cleanedFaq }),
      })
      const d = await r.json()
      if (d.ok) {
        setOriginalPrompt(promptCustom)
        setOriginalFaq([...faqQuestions])
        setMsg('✓ Brouillon sauvegardé')
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
    const cleanedFaq = faqQuestions.map(q => q.trim()).filter(Boolean)
    const faqInfo = cleanedFaq.length > 0
      ? `• FAQ : ${cleanedFaq.length} question(s) imposée(s) — Claude génère uniquement les réponses\n`
      : `• FAQ : Claude inventera 4 questions + réponses (standard)\n`
    if (!confirm(
      `Lancer la génération et publication de "${sheetRow.marque}" ?\n\n` +
      `• Intro, en bref, points forts/faibles, verdict : générés automatiquement\n` +
      `• Sections H2 entre sommaire et avis utilisateurs : selon ton prompt custom\n` +
      faqInfo +
      `• Puis l'avis sera commité dans posts_avis/ et le site redéployé\n\n` +
      `Durée totale : ~3 minutes.`
    )) return

    if (isDirty) {
      const ok = await saveDraft()
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

  // ─── Dirty detection ─────────────────────────────────────────────────────
  // On considère qu'il y a des modifs non sauvegardées si le prompt OU la
  // liste FAQ (en JSON pour comparer ses contenus) a changé.
  const promptDirty = promptCustom !== originalPrompt
  const faqDirty = JSON.stringify(faqQuestions) !== JSON.stringify(originalFaq)
  const isDirty = promptDirty || faqDirty
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
        Définis ton prompt custom (titres H2) ET tes questions FAQ imposées.
        Le reste du contenu (intro, en bref, points forts/faibles, verdict) sera généré automatiquement.
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
            🎯 Prompt custom + titres H2
          </div>
          {promptDirty && <span style={{ fontSize: 11, color: '#F6AD55', fontWeight: 600 }}>● Modifié</span>}
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
          rows={18}
          style={{
            width: '100%', padding: 14, borderRadius: 8,
            background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0',
            fontSize: 13, lineHeight: 1.6, fontFamily: 'monospace',
            outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical' as const,
          }}
        />

        <div style={{ marginTop: 10, fontSize: 11, color: '#8B9CB0', lineHeight: 1.6 }}>
          💡 Décris les sections H2 (et éventuellement H3) à générer. Claude rédige tout en HTML brut.
        </div>
      </div>

      {/* Questions FAQ imposées */}
      <div style={{ background: '#0E1422', border: '1px solid #1E2D3D', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#8B9CB0', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
            ❓ Questions FAQ imposées ({faqQuestions.filter(q => q.trim()).length})
          </div>
          {faqDirty && <span style={{ fontSize: 11, color: '#F6AD55', fontWeight: 600 }}>● Modifié</span>}
        </div>

        <div style={{ fontSize: 12, color: '#8B9CB0', lineHeight: 1.6, marginBottom: 14 }}>
          Saisis ici les questions exactes que tu veux voir dans la FAQ de l'avis. Claude générera UNIQUEMENT les réponses
          (pas de questions inventées). Si tu laisses la liste vide, Claude crée 4 questions automatiquement.
        </div>

        {faqQuestions.length === 0 && (
          <div style={{ fontSize: 12, color: '#4A5568', fontStyle: 'italic' as const, marginBottom: 12 }}>
            Aucune question imposée. Claude générera 4 questions standards.
          </div>
        )}

        {faqQuestions.map((q, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <div style={{ flexShrink: 0, fontSize: 11, color: '#4A5568', width: 24, textAlign: 'center' as const }}>
              {idx + 1}.
            </div>
            <input
              type="text"
              value={q}
              onChange={e => updateFaqQuestion(idx, e.target.value)}
              placeholder={`Question ${idx + 1} ? (doit se terminer par '?')`}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 6,
                background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#E2E8F0',
                fontSize: 13, outline: 'none', boxSizing: 'border-box' as const,
              }}
            />
            <button
              onClick={() => removeFaqQuestion(idx)}
              title="Supprimer cette question"
              style={{
                padding: '8px 12px', borderRadius: 6,
                background: 'transparent', border: '1px solid #1E2D3D',
                color: '#FC8181', fontSize: 13, cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        ))}

        <button
          onClick={addFaqQuestion}
          style={{
            marginTop: 6, padding: '8px 14px', borderRadius: 6,
            background: 'transparent', border: '1px dashed #5E9ED6',
            color: '#5E9ED6', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Ajouter une question
        </button>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' as const }}>
        <button onClick={() => saveDraft()} disabled={saving || !isDirty}
          style={{
            padding: '10px 18px', borderRadius: 8,
            background: isDirty ? '#5E9ED6' : '#1E2D3D',
            color: isDirty ? '#fff' : '#4A5568',
            border: 'none', fontWeight: 700, fontSize: 13,
            cursor: (saving || !isDirty) ? 'default' : 'pointer',
          }}>
          {saving ? '⏳ Sauvegarde...' : '💾 Sauvegarder le brouillon'}
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
