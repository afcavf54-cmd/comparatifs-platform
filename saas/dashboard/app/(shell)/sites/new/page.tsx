'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type SiteType = '' | 'comparatif' | 'classement'

const STEPS_COMPARATIF = ['Type', 'Infos', 'Domaine', 'Modèles', 'Persona', 'SEO', 'Visuel', 'Récap']
const STEPS_CLASSEMENT = ['Type', 'Infos', 'Domaine', 'Modèles', 'Persona', 'Types', 'Visuel', 'Récap']

// ── Données du simulateur de persona ──────────────────────────────────────
const PRENOMS = ['Sophie', 'Thomas', 'Marie', 'Nicolas', 'Camille', 'Antoine', 'Julie', 'Pierre', 'Lucie', 'Julien', 'Emma', 'Alexandre', 'Léa', 'Maxime', 'Chloé', 'Vincent', 'Manon', 'Romain']
const NOMS = ['Dupont', 'Martin', 'Bernard', 'Lefebvre', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Leroy', 'Petit', 'Durand', 'Roux', 'David', 'Bertrand', 'Morel']
const VILLES = ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Toulouse', 'Nantes', 'Strasbourg', 'Montpellier', 'Nice', 'Rennes']
const METIERS: Record<string, any> = {
  'DAF / Directeur Financier': { niveau: 'expert', ton: 'expert', adresse: 'vouvoiement', phrases: 'longues', pedagogie: 'faible', biais: ['prix', 'performance'] },
  'Directeur RH': { niveau: 'expert', ton: 'expert', adresse: 'vouvoiement', phrases: 'longues', pedagogie: 'moyenne', biais: ['spécialisation métier', 'performance'] },
  'Gérant PME': { niveau: 'intermédiaire', ton: 'direct', adresse: 'vouvoiement', phrases: 'mixtes', pedagogie: 'moyenne', biais: ['prix', 'simplicité'] },
  'Artisan / Auto-entrepreneur': { niveau: 'débutant', ton: 'direct', adresse: 'tutoiement', phrases: 'courtes', pedagogie: 'élevée', biais: ['prix', 'simplicité'] },
  'Fondateur startup': { niveau: 'intermédiaire', ton: 'dynamique', adresse: 'tutoiement', phrases: 'courtes', pedagogie: 'faible', biais: ['automatisation', 'croissance entreprise'] },
  'Responsable comptable': { niveau: 'expert', ton: 'pédagogique', adresse: 'vouvoiement', phrases: 'mixtes', pedagogie: 'moyenne', biais: ['performance', 'prix'] },
  'Chef de projet': { niveau: 'intermédiaire', ton: 'accessible', adresse: 'tutoiement', phrases: 'mixtes', pedagogie: 'moyenne', biais: ['automatisation', 'performance'] },
  'Freelance consultant': { niveau: 'expert', ton: 'critique', adresse: 'tutoiement', phrases: 'courtes', pedagogie: 'faible', biais: ['prix', 'performance'] },
  'Responsable IT': { niveau: 'expert', ton: 'expert', adresse: 'vouvoiement', phrases: 'longues', pedagogie: 'faible', biais: ['performance', 'automatisation'] },
  'Dirigeant TPE': { niveau: 'débutant', ton: 'accessible', adresse: 'vouvoiement', phrases: 'courtes', pedagogie: 'élevée', biais: ['prix', 'simplicité'] },
}
const TAILLES = ['1-5 salariés', '5-20 salariés', '20-100 salariés', '100-500 salariés', '+500 salariés']
const ANGLES = ['prix', 'simplicité', 'performance', 'automatisation', 'spécialisation métier', 'alternative à un outil', 'croissance entreprise']

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }

function generatePersona() {
  const metier = rand(Object.keys(METIERS))
  const rules = METIERS[metier]
  const biais = rand(rules.biais)
  const angle = biais === 'prix' ? 'prix' : biais
  return {
    prenom: rand(PRENOMS), nom: rand(NOMS), age: randInt(25, 55),
    sexe: Math.random() > 0.5 ? 'Homme' : 'Femme',
    ville: rand(VILLES), metier, taille: rand(TAILLES),
    niveau: rules.niveau, experience: randInt(2, 20),
    objectifs: ['Gagner du temps sur les tâches répétitives', 'Réduire les coûts logiciels', 'Améliorer la productivité de mon équipe'].slice(0, randInt(2, 3)),
    contraintes: ['Budget limité', 'Équipe non technique', 'Peu de temps pour la formation'].slice(0, randInt(1, 3)),
    biais,
    // Style (cohérent avec métier)
    adresse: rules.adresse, ton: rules.ton, phrases: rules.phrases, pedagogie: rules.pedagogie,
    positionnement: rand(['mentor', 'expert', 'utilisateur terrain']),
    opinion: rand(['neutre', 'affirmé', 'tranché']),
    // Angle
    angle,
    // Méthodologie
    criteres: angle === 'prix' ? ['Prix', 'Rapport qualité/prix', 'Facilité d\'utilisation', 'Support client'] : ['Facilité d\'utilisation', 'Fonctionnalités', 'Prix', 'Intégrations'],
    scoring: rand(['note /5', 'score /100', 'classement simple']),
    gagnant: Math.random() > 0.4,
    // Structure
    faq: Math.random() > 0.3, tableau: Math.random() > 0.5, cas_concrets: Math.random() > 0.4,
    detail: rand(['synthétique', 'équilibré', 'approfondi']),
  }
}

function personaToPrompt(p: any): string {
  return `Tu écris en tant que ${p.prenom} ${p.nom}, ${p.age} ans, ${p.metier} basé(e) à ${p.ville} (entreprise de ${p.taille}). Niveau ${p.niveau}, ${p.experience} ans d'expérience. ${p.adresse === 'tutoiement' ? 'Tutoie' : 'Vouvoie'} le lecteur. Ton : ${p.ton}. Phrases ${p.phrases}. Niveau pédagogique : ${p.pedagogie}. Positionnement : ${p.positionnement}. Niveau d'opinion : ${p.opinion}. Angle éditorial prioritaire : ${p.angle}. Critères de classement par ordre de priorité : ${p.criteres.join(', ')}. Scoring : ${p.scoring}${p.gagnant ? ', avec un gagnant clairement désigné' : ''}. Objectifs du lecteur cible : ${p.objectifs.join(', ')}. Contraintes du lecteur : ${p.contraintes.join(', ')}. ${p.cas_concrets ? 'Inclure des cas concrets et exemples.' : ''} ${p.faq ? 'Inclure une FAQ.' : ''} Niveau de détail : ${p.detail}.`.trim()
}

export default function NewSitePage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [siteType, setSiteType] = useState<SiteType>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sheetPreview, setSheetPreview] = useState<any>(null)
  const [checkingSheet, setCheckingSheet] = useState(false)
  const [availableSchemas, setAvailableSchemas] = useState<any[]>([])
  const [persona, setPersona] = useState<any>(null)
  const [personaPrompt, setPersonaPrompt] = useState('')
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([])
  const [allKeywords, setAllKeywords] = useState<{name: string, categorie: string, count: number}[]>([])
  const [collapsedKwCats, setCollapsedKwCats] = useState<Record<string, boolean>>({})
  const [personaMode, setPersonaMode] = useState<'auto'|'manual'>('auto')
  const [authorName, setAuthorName] = useState('')
  const [authorJob, setAuthorJob] = useState('')
  const [authorBio, setAuthorBio] = useState('')
  const [generatingBio, setGeneratingBio] = useState(false)

  const STEPS = siteType === 'classement' ? STEPS_CLASSEMENT : STEPS_COMPARATIF

  const [form, setForm] = useState({
    name: '', domain: '', sheet_csv_url: '', description: '',
    logo_text: '', logo_accent: '',
    accent: '#1B4FD8', accent2: '#E8410A', bg: '#F4F6FB',
    www_preference: 'www',
    // ── Format des slugs d'articles blog ───────────────────────────────
    // 'prefix' (défaut historique) : ajoute /3847-mon-article/
    // 'clean'                       : URLs propres /mon-article/
    // Le 2e mode est nécessaire pour migrer un site WordPress existant
    // en conservant exactement les URLs (continuité SEO). Le paramètre
    // est lu côté Python par blog_publish_scheduled.py > _resolve_slug_format
    // depuis config.yaml (top-level ou section site:).
    blog_slug_format: 'prefix',
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

    fetch('/api/schemas/classement-saas').then(r => r.json()).then(schema => {
      if (schema?.keywords) {
        const kws = Object.entries(schema.keywords).map(([name, data]: [string, any]) => ({
          name, categorie: data.__categorie || 'Autres', count: (data.__products || []).length
        }))
        setAllKeywords(kws)
      }
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

  async function handleGenerate() {
    const p = generatePersona()
    setPersona(p)
    setPersonaPrompt(personaToPrompt(p))
    // Préremplir la box auteur
    setAuthorName(`${p.prenom} ${p.nom}`)
    setAuthorJob(p.metier)
    // Générer la bio via Claude
    setGeneratingBio(true)
    try {
      const bioPrompt = `Génère une courte biographie professionnelle (2-3 phrases maximum, 40-60 mots) pour ${p.prenom} ${p.nom}, ${p.metier} de ${p.experience} ans d'expérience basé(e) à ${p.ville}. Ton : ${p.ton}. Ne mentionne pas d'entreprise spécifique. Écris à la troisième personne. Pas de tirets longs.`
      const res = await fetch('/api/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: bioPrompt, max_tokens: 200 })
      })
      const d = await res.json()
      if (d.text) setAuthorBio(d.text.trim())
    } catch { }
    setGeneratingBio(false)
  }

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
        // ── FIX v2 : selected_keywords était lu côté API mais jamais envoyé.
        // À l'étape "Types" l'utilisateur cochait les classements à activer,
        // mais ils étaient perdus → enabled_classements.json jamais créé →
        // tous les keywords activés par défaut (mode legacy).
        // ── juin 2026 : blog_slug_format fait partie de form donc déjà
        // inclus via ...form. L'API doit lire ce champ et l'écrire dans
        // config.yaml pour que blog_publish_scheduled.py le respecte.
        body: JSON.stringify({
          ...form,
          page_types: pageTypes,
          site_type: siteType,
          persona_prompt: personaPrompt,
          author_name: authorName,
          author_job: authorJob,
          author_bio: authorBio,
          selected_keywords: selectedKeywords,
        })
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

  const badge = (label: string, color: string) => (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: `${color}22`, color, fontWeight: 700, marginRight: 6 }}>{label}</span>
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

        {/* ── STEP TYPE ── */}
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

        {/* ── STEP INFOS ── */}
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

        {/* ── STEP DOMAINE ── */}
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

            {/* ── Format des slugs d'articles blog ──────────────────────
                Permet de choisir comment les URLs des articles seront construites.
                - 'prefix' : URLs avec préfixe numérique (défaut historique)
                - 'clean'  : URLs propres, à utiliser pour migrer un site existant
                Ce champ est lu par blog_publish_scheduled.py au moment de la
                génération du slug. L'API /api/sites doit l'écrire dans config.yaml. */}
            {lbl('Format des slugs d\'articles blog')}
            <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
              {[
                { val: 'prefix', label: 'Avec préfixe numérique', sub: '/3847-mon-article/' },
                { val: 'clean', label: 'Slug propre', sub: '/mon-article/' }
              ].map(opt => (
                <div key={opt.val} onClick={() => set('blog_slug_format', opt.val)} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, cursor: 'pointer', border: form.blog_slug_format === opt.val ? '2px solid #00D4AA' : '2px solid #1E2D3D', background: form.blog_slug_format === opt.val ? 'rgba(0,212,170,0.08)' : 'transparent' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: '#8B9CB0', fontFamily: 'monospace', marginTop: 4 }}>{opt.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#4A5568', marginBottom: 20, lineHeight: 1.5 }}>
              💡 Choisissez <strong style={{ color: '#8B9CB0' }}>Slug propre</strong> si vous migrez un site existant (WordPress par ex.) et devez conserver les URLs pour ne pas perdre votre référencement.
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

        {/* ── STEP MODÈLES ── */}
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

        {/* ── STEP PERSONA ── */}
        {step === si('Persona') && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 4, marginTop: 0 }}>🎭 Persona éditorial</h2>
            <p style={{ color: '#8B9CB0', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
              Définissez le persona qui guidera la génération de contenu sur ce site. Ce profil rend chaque site unique et différencie votre voix éditoriale.
            </p>

            {/* Mode selector */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              {[{ id: 'auto', label: '🎲 Générer automatiquement' }, { id: 'manual', label: '✏️ Saisir manuellement' }].map(m => (
                <button key={m.id} onClick={() => setPersonaMode(m.id as any)}
                  style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: personaMode === m.id ? '2px solid #00D4AA' : '2px solid #1E2D3D', background: personaMode === m.id ? 'rgba(0,212,170,0.08)' : 'transparent', color: personaMode === m.id ? '#fff' : '#8B9CB0', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {m.label}
                </button>
              ))}
            </div>

            {personaMode === 'auto' && (
              <div>
                <button onClick={handleGenerate}
                  style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#9F7AEA,#0090FF)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 15, marginBottom: 20 }}>
                  🎲 Générer un persona cohérent
                </button>

                {persona && (
                  <div>
                    {/* Fiche persona */}
                    <div style={{ background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#9F7AEA,#0090FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                          {persona.sexe === 'Homme' ? '👨‍💼' : '👩‍💼'}
                        </div>
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{persona.prenom} {persona.nom}</div>
                          <div style={{ fontSize: 13, color: '#8B9CB0' }}>{persona.age} ans · {persona.ville} · {persona.taille}</div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        {[
                          { label: 'Métier', value: persona.metier },
                          { label: 'Niveau', value: persona.niveau },
                          { label: 'Ton', value: persona.ton },
                          { label: 'Adresse', value: persona.adresse },
                          { label: 'Phrases', value: persona.phrases },
                          { label: 'Angle éditorial', value: persona.angle },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ background: '#0D1117', borderRadius: 8, padding: '8px 12px' }}>
                            <div style={{ fontSize: 10, color: '#4A5568', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
                            <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{value}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: '#8B9CB0', marginBottom: 6 }}>Critères de classement</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                          {persona.criteres.map((c: string, i: number) => (
                            <span key={c} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: i === 0 ? 'rgba(0,212,170,0.2)' : '#1E2D3D', color: i === 0 ? '#00D4AA' : '#8B9CB0' }}>{i + 1}. {c}</span>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        {persona.faq && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(0,144,255,0.15)', color: '#0090FF' }}>FAQ ✓</span>}
                        {persona.tableau && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(159,122,234,0.15)', color: '#9F7AEA' }}>Tableau ✓</span>}
                        {persona.cas_concrets && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(246,173,85,0.15)', color: '#F6AD55' }}>Cas concrets ✓</span>}
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#1E2D3D', color: '#8B9CB0' }}>Détail : {persona.detail}</span>
                      </div>
                    </div>

                    {/* Box auteur préremplie */}
                    {(authorName || generatingBio) && (
                      <div style={{ background: '#0A0E1A', border: '1px solid rgba(159,122,234,0.3)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: '#9F7AEA', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase' as const }}>✍️ Box auteur pré-remplie</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 10, color: '#4A5568', textTransform: 'uppercase' as const, marginBottom: 4 }}>Nom</div>
                            <input value={authorName} onChange={e => setAuthorName(e.target.value)}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: '#4A5568', textTransform: 'uppercase' as const, marginBottom: 4 }}>Poste</div>
                            <input value={authorJob} onChange={e => setAuthorJob(e.target.value)}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: '#4A5568', textTransform: 'uppercase' as const, marginBottom: 4 }}>
                            Biographie {generatingBio && <span style={{ color: '#9F7AEA' }}>— génération en cours...</span>}
                          </div>
                          <textarea value={authorBio} onChange={e => setAuthorBio(e.target.value)} rows={3}
                            placeholder={generatingBio ? 'Génération de la biographie...' : ''}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
                        </div>
                      </div>
                    )}

                    {/* Prompt généré */}
                    <div style={{ background: '#0A0E1A', border: '1px solid #1E2D3D', borderRadius: 12, padding: 16 }}>
                      <div style={{ fontSize: 11, color: '#8B9CB0', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' as const }}>Prompt persona généré</div>
                      <textarea value={personaPrompt} onChange={e => setPersonaPrompt(e.target.value)} rows={5}
                        style={{ width: '100%', padding: '10px', borderRadius: 8, background: '#0D1117', border: '1px solid #1E2D3D', color: '#8B9CB0', fontSize: 12, outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
                    </div>
                  </div>
                )}

                {!persona && (
                  <div style={{ textAlign: 'center' as const, padding: '40px 20px', color: '#4A5568', fontSize: 14 }}>
                    Cliquez sur "Générer" pour créer un persona cohérent pour ce site.
                    <br /><br />
                    <span style={{ fontSize: 12 }}>Vous pourrez le modifier à tout moment dans les Paramètres du site.</span>
                  </div>
                )}
              </div>
            )}

            {personaMode === 'manual' && (
              <div>
                <div style={{ fontSize: 13, color: '#8B9CB0', marginBottom: 16 }}>Décrivez directement le persona éditorial de ce site :</div>
                <textarea value={personaPrompt} onChange={e => setPersonaPrompt(e.target.value)} rows={8}
                  placeholder="Ex: Tu écris en tant qu'expert comptable de 42 ans, basé à Lyon. Tu t'adresses à des dirigeants de PME avec un ton professionnel et direct. Tu vouvoies le lecteur. Ton angle éditorial prioritaire est le rapport qualité/prix..."
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: '#0D1117', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13, outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit', boxSizing: 'border-box' as const, lineHeight: 1.6 }} />
                <div style={{ fontSize: 11, color: '#4A5568', marginTop: 8 }}>Ce prompt sera injecté dans toutes les générations IA de ce site.</div>
              </div>
            )}

            <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(159,122,234,0.06)', border: '1px solid rgba(159,122,234,0.2)', borderRadius: 8, fontSize: 12, color: '#9F7AEA' }}>
              💡 Laisser vide = pas de persona spécifique (le prompt global du modèle s'applique seul)
            </div>
          </div>
        )}

        {/* ── STEP SEO ── */}
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

        {/* ── STEP TYPES (classement only) ── */}
        {siteType === 'classement' && step === si('Types') && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>🗂 Types de logiciels à inclure</h2>
            <p style={{ color: '#8B9CB0', fontSize: 13, marginBottom: 20 }}>Sélectionnez les types à générer. Vous pourrez en ajouter d'autres dans les paramètres.</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <button onClick={() => setSelectedKeywords(allKeywords.map(k => k.name))}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #00D4AA', background: 'transparent', color: '#00D4AA', cursor: 'pointer', fontSize: 12 }}>
                ✓ Tout sélectionner
              </button>
              <button onClick={() => setSelectedKeywords([])}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #4A5568', background: 'transparent', color: '#8B9CB0', cursor: 'pointer', fontSize: 12 }}>
                ✗ Tout désélectionner
              </button>
            </div>
            {allKeywords.length === 0 ? <div style={{ color: '#4A5568', fontSize: 13 }}>Chargement...</div> : (() => {
              const grouped: Record<string, typeof allKeywords> = {}
              allKeywords.forEach(kw => { if (!grouped[kw.categorie]) grouped[kw.categorie] = []; grouped[kw.categorie].push(kw) })
              return Object.entries(grouped).map(([cat, kws]) => {
                const allSel = kws.every(kw => selectedKeywords.includes(kw.name))
                const someSel = kws.some(kw => selectedKeywords.includes(kw.name))
                return (
                  <div key={cat} style={{ marginBottom: 10, background: '#0A0E1A', borderRadius: 8, overflow: 'hidden', border: '1px solid #1E2D3D' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: collapsedKwCats[cat] ? 'none' : '1px solid #1E2D3D', cursor: 'pointer' }}
                      onClick={() => setCollapsedKwCats(p => ({ ...p, [cat]: !p[cat] }))}>
                      <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel && !allSel }}
                        onChange={e => { e.stopPropagation(); if (allSel) setSelectedKeywords(prev => prev.filter(k => !kws.find(kw => kw.name === k))); else setSelectedKeywords(prev => [...new Set([...prev, ...kws.map(kw => kw.name)])]) }}
                        onClick={e => e.stopPropagation()} style={{ width: 14, height: 14, cursor: 'pointer' }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#9F7AEA', flex: 1 }}>{cat}</span>
                      <span style={{ fontSize: 11, color: '#4A5568' }}>{kws.filter(kw => selectedKeywords.includes(kw.name)).length}/{kws.length}</span>
                      <span style={{ color: '#4A5568', fontSize: 10 }}>{collapsedKwCats[cat] ? '▶' : '▼'}</span>
                    </div>
                    {!collapsedKwCats[cat] && kws.map(kw => (
                      <label key={kw.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 28px', borderBottom: '1px solid #1E2D3D', cursor: 'pointer', background: selectedKeywords.includes(kw.name) ? 'rgba(0,212,170,0.05)' : 'transparent' }}>
                        <input type="checkbox" checked={selectedKeywords.includes(kw.name)}
                          onChange={e => setSelectedKeywords(prev => e.target.checked ? [...prev, kw.name] : prev.filter(k => k !== kw.name))}
                          style={{ width: 14, height: 14, cursor: 'pointer' }} />
                        <span style={{ fontSize: 13, color: selectedKeywords.includes(kw.name) ? '#fff' : '#8B9CB0', flex: 1 }}>{kw.name}</span>
                        <span style={{ fontSize: 11, color: '#4A5568' }}>{kw.count} produits</span>
                      </label>
                    ))}
                  </div>
                )
              })
            })()}
            <div style={{ marginTop: 10, fontSize: 12, color: '#4A5568' }}>
              {selectedKeywords.length === 0 ? '⚠ Aucun type sélectionné — tous les types seront générés' : `${selectedKeywords.length} type(s) sélectionné(s)`}
            </div>
          </div>
        )}

        {/* ── STEP VISUEL ── */}
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

        {/* ── STEP RÉCAP ── */}
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
              { label: 'Format slugs blog', value: form.blog_slug_format === 'clean' ? 'Slug propre (/mon-article/)' : 'Avec préfixe (/3847-mon-article/)' },
              { label: 'Modèles', value: Object.entries(pageTypes).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ') || 'Aucun' },
              { label: 'Persona', value: personaPrompt ? `✓ Configuré (${personaPrompt.length} car.)` : '— Non défini' },
              ...(siteType === 'classement' ? [{ label: 'Types activés', value: selectedKeywords.length > 0 ? `${selectedKeywords.length} classement(s)` : '⚠ Tous (legacy)' }] : []),
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
