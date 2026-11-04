'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type Offre = {
  id?: string; type: 'credit' | 'parrainage'; organisme: string; slug?: string; categorie?: string | null
  montant_min?: number | null; montant_max?: number | null; durees?: string | null; taeg?: string | null
  prime?: string | null; depot?: string | null; description?: string | null; conditions?: string | null
  logo_url?: string | null; url: string; mise_en_avant?: boolean; ordre?: number
  valide_du?: string | null; valide_au?: string | null; verifie_le?: string | null; demo?: boolean; actif?: boolean
}
const BLANK: Offre = { type: 'credit', organisme: '', slug: '', categorie: '', montant_min: null, montant_max: null, durees: '', taeg: '', prime: '', depot: '', description: '', conditions: '', logo_url: '', url: '', mise_en_avant: false, ordre: 0, valide_du: '', valide_au: '', verifie_le: '', demo: false, actif: true }

const card = { background: '#0F1724', border: '1px solid #1E2D3D', borderRadius: 12, padding: 18 }
const input = { width: '100%', padding: '9px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 } as const
const label = { display: 'block', fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }
const btn = (bg: string) => ({ padding: '9px 16px', borderRadius: 8, background: bg, color: '#fff', border: 0, fontSize: 13, fontWeight: 600, cursor: 'pointer' } as const)
// Les logos uploadés ont une URL relative au SITE (/offres-logos/…). Dans le
// dashboard (autre domaine), on la préfixe par le domaine du site pour l'aperçu.
const SITE_BASE = 'https://www.mon-credit-facile.fr'
const logoSrc = (u?: string | null) => (u ? (u.startsWith('/') ? SITE_BASE + u : u) : '')
function slugify(s: string) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default function OffresAdmin() {
  const { siteId } = useParams<{ siteId: string }>()
  const [offers, setOffers] = useState<Offre[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<Offre | null>(null)

  async function load() {
    setLoading(true); setErr('')
    const [ro, rs] = await Promise.all([
      fetch(`/api/sites/${siteId}/offres`),
      fetch(`/api/sites/${siteId}/offres/settings`),
    ])
    const do_ = await ro.json(); const ds = await rs.json()
    if (!ro.ok) { setErr(do_.error || 'Erreur de chargement'); setOffers([]) } else setOffers(do_.offers || [])
    if (rs.ok) setSettings(ds.settings || {})
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [siteId])

  async function save(o: Offre) {
    const method = o.id ? 'PUT' : 'POST'
    const url = o.id ? `/api/sites/${siteId}/offres/${o.id}` : `/api/sites/${siteId}/offres`
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) })
    const d = await r.json(); if (!r.ok) { alert(d.error || 'Erreur'); return }
    setEditing(null); load()
  }
  async function del(id?: string) {
    if (!id || !confirm('Supprimer cette offre ?')) return
    const r = await fetch(`/api/sites/${siteId}/offres/${id}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json(); alert(d.error || 'Erreur') } else load()
  }
  async function saveSettings(patch: Record<string, string>) {
    const next = { ...settings, ...patch }; setSettings(next)
    await fetch(`/api/sites/${siteId}/offres/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
  }

  if (siteId !== 'mon-credit-facile-fr') return <div style={{ padding: 24, color: '#8B9CB0' }}>Cet onglet est réservé à mon-credit-facile.</div>

  const credit = offers.filter(o => o.type === 'credit')
  const parrain = offers.filter(o => o.type === 'parrainage')

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 24px', color: '#fff' }}>
      <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none', fontSize: 13 }}>← {siteId}</Link>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 20px', gap: 12 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>💳 Offres du simulateur</h1>
        <button onClick={() => setEditing({ ...BLANK })} style={btn('linear-gradient(135deg,#FF8A3D,#234B3C)')}>+ Ajouter une offre</button>
      </div>

      {/* Réglages */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>⚙️ Réglages du simulateur</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'end' }}>
          <div>
            <label style={label}>URL partenaire « regroupement de crédits »</label>
            <input style={input} value={settings.consolidation_partner_url || ''} placeholder="https://partenaire.example/regroupement"
              onChange={e => setSettings({ ...settings, consolidation_partner_url: e.target.value })}
              onBlur={e => saveSettings({ consolidation_partner_url: e.target.value })} />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#C9D4E5', fontSize: 13, whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={settings.demo_mode === 'true'} onChange={e => saveSettings({ demo_mode: e.target.checked ? 'true' : 'false' })} />
            Badge « DÉMO » global
          </label>
        </div>
      </div>

      {editing && <OfferForm key={editing.id || 'new'} offer={editing} siteId={siteId} onCancel={() => setEditing(null)} onSave={save} />}
      {err && <div style={{ ...card, borderColor: '#5c2b2e', color: '#ff8a80', marginBottom: 16 }}>{err}</div>}

      {loading ? <div style={{ color: '#8B9CB0' }}>Chargement…</div> : (
        <>
          <Section title={`Offres de crédit (${credit.length})`} offers={credit} onEdit={setEditing} onDel={del} />
          <Section title={`Offres de parrainage (${parrain.length})`} offers={parrain} onEdit={setEditing} onDel={del} />
          {offers.length === 0 && <div style={{ color: '#8B9CB0' }}>Aucune offre. Cliquez sur « Ajouter une offre ».</div>}
        </>
      )}
    </div>
  )
}

function Section({ title, offers, onEdit, onDel }: { title: string; offers: Offre[]; onEdit: (o: Offre) => void; onDel: (id?: string) => void }) {
  if (offers.length === 0) return null
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 12, color: '#8B9CB0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>{title}</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {offers.map(o => (
          <div key={o.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, opacity: o.actif ? 1 : 0.5 }}>
            {o.logo_url ? <img src={logoSrc(o.logo_url)} alt="" style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'cover', background: '#0A0E1A', flexShrink: 0 }} /> : null}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {o.organisme}
                {o.mise_en_avant && <span style={{ marginLeft: 8, fontSize: 10, background: '#FF8A3D', color: '#2A1400', padding: '2px 7px', borderRadius: 99, fontWeight: 700 }}>MIS EN AVANT</span>}
                {o.demo && <span style={{ marginLeft: 6, fontSize: 10, background: '#2b3a4d', color: '#9fcbe5', padding: '2px 7px', borderRadius: 99 }}>démo</span>}
                {!o.actif && <span style={{ marginLeft: 6, fontSize: 10, color: '#8B9CB0' }}>· inactif</span>}
              </div>
              <div style={{ fontSize: 12, color: '#8B9CB0', marginTop: 3 }}>
                {o.categorie || '—'}
                {o.type === 'credit' && (o.montant_min != null || o.montant_max != null) ? ` · ${o.montant_min ?? 0}–${o.montant_max ?? '∞'} €` : ''}
                {o.type === 'parrainage' && o.prime ? ` · ${o.prime}` : ''}
                {` · ordre ${o.ordre ?? 0}`}
              </div>
            </div>
            <button onClick={() => onEdit(o)} style={btn('#1E2D3D')}>Éditer</button>
            <button onClick={() => onDel(o.id)} style={btn('#3a1f22')}>Suppr.</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function OfferForm({ offer, siteId, onCancel, onSave }: { offer: Offre; siteId: string; onCancel: () => void; onSave: (o: Offre) => void }) {
  const [o, setO] = useState<Offre>({ ...offer })
  const set = (k: keyof Offre, v: any) => setO(prev => ({ ...prev, [k]: v }))
  const num = (v: string) => (v === '' ? null : Number(v))
  const isCredit = o.type === 'credit'
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // Upload façon blog/codes-promo : commit du fichier dans le repo
  // (public/offres-logos/<slug>/) via /api/github/upload. L'URL est servie
  // depuis le NDD du site. Nécessite un redéploiement du site pour l'afficher.
  async function uploadLogo(file: File) {
    const base = slugify(o.slug || o.organisme || '')
    if (!base) { alert("Renseigne d'abord l'organisme avant d'uploader un logo."); if (fileRef.current) fileRef.current.value = ''; return }
    setUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
      const filename = `logo.${ext}`
      const path = `platform/sites/${siteId}/public/offres-logos/${base}/${filename}`
      const content: string = await new Promise((resolve, reject) => {
        const rd = new FileReader(); rd.onload = () => resolve(String(rd.result).split(',')[1]); rd.onerror = reject; rd.readAsDataURL(file)
      })
      let sha: string | undefined
      try { const ex = await fetch(`/api/github?path=${encodeURIComponent(path)}`); if (ex.ok) { const ed = await ex.json(); if (ed.sha) sha = ed.sha } } catch { /* création */ }
      const r = await fetch('/api/github/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content, sha, message: `HUB: Upload logo offre ${o.organisme} (${base})` }),
      })
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`) }
      setO(prev => ({ ...prev, logo_url: `/offres-logos/${base}/${filename}?v=${Date.now().toString(36)}` }))
      alert("Logo uploadé ✓ — enregistre l'offre, puis relance un déploiement du site pour l'afficher.")
    } catch (e: any) { alert('Upload échoué : ' + (e?.message || 'inconnue')) }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }
  return (
    <div style={{ ...card, marginBottom: 20, borderColor: '#FF8A3D' }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>{o.id ? 'Modifier' : 'Nouvelle'} offre</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
        <div><label style={label}>Type</label>
          <select style={input} value={o.type} onChange={e => set('type', e.target.value)}>
            <option value="credit">Crédit</option><option value="parrainage">Parrainage (offre de bienvenue)</option>
          </select></div>
        <div><label style={label}>Organisme *</label><input style={input} value={o.organisme} onChange={e => set('organisme', e.target.value)} /></div>
        <div><label style={label}>Catégorie</label><input style={input} value={o.categorie || ''} placeholder={isCredit ? 'Prêt personnel, Crédit auto…' : 'Banque, Néobanque…'} onChange={e => set('categorie', e.target.value)} /></div>
        <div><label style={label}>Lien affilié *</label><input style={input} value={o.url} onChange={e => set('url', e.target.value)} /></div>

        {isCredit ? <>
          <div><label style={label}>Montant min (€)</label><input style={input} type="number" value={o.montant_min ?? ''} onChange={e => set('montant_min', num(e.target.value))} /></div>
          <div><label style={label}>Montant max (€)</label><input style={input} type="number" value={o.montant_max ?? ''} onChange={e => set('montant_max', num(e.target.value))} /></div>
          <div><label style={label}>Durées (texte)</label><input style={input} value={o.durees || ''} placeholder="12 à 84 mois" onChange={e => set('durees', e.target.value)} /></div>
          <div><label style={label}>TAEG (affiché si renseigné)</label><input style={input} value={o.taeg || ''} placeholder="à partir de 4,9 %" onChange={e => set('taeg', e.target.value)} /></div>
        </> : <>
          <div><label style={label}>Prime</label><input style={input} value={o.prime || ''} placeholder="Jusqu'à 150 € offerts" onChange={e => set('prime', e.target.value)} /></div>
          <div><label style={label}>Dépôt</label><input style={input} value={o.depot || ''} placeholder="Sans dépôt requis / Avec premier versement" onChange={e => set('depot', e.target.value)} /></div>
        </>}

        <div style={{ gridColumn: '1 / -1' }}><label style={label}>Description (caractéristiques, 1 ligne)</label><input style={input} value={o.description || ''} onChange={e => set('description', e.target.value)} /></div>
        <div style={{ gridColumn: '1 / -1' }}><label style={label}>Conditions (courtes)</label><input style={input} value={o.conditions || ''} onChange={e => set('conditions', e.target.value)} /></div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={label}>Logo</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {o.logo_url
              ? <img src={logoSrc(o.logo_url)} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', background: '#0A0E1A', flexShrink: 0 }} />
              : <div style={{ width: 44, height: 44, borderRadius: 10, background: '#234B3C', display: 'grid', placeItems: 'center', fontWeight: 700, flexShrink: 0 }}>{(o.organisme || '?').slice(0, 2).toUpperCase()}</div>}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} />
            <button type="button" onClick={() => fileRef.current?.click()} style={btn('#1E2D3D')} disabled={uploading}>{uploading ? 'Upload…' : 'Choisir un logo'}</button>
            {o.logo_url && <button type="button" onClick={() => set('logo_url', '')} style={btn('#3a1215')}>Retirer</button>}
          </div>
          <input style={{ ...input, marginTop: 8 }} value={o.logo_url || ''} onChange={e => set('logo_url', e.target.value)} placeholder="…ou colle une URL de logo" />
        </div>
        <div><label style={label}>Ordre (priorité, asc)</label><input style={input} type="number" value={o.ordre ?? 0} onChange={e => set('ordre', Number(e.target.value))} /></div>
        <div><label style={label}>Valide du</label><input style={input} type="date" value={o.valide_du || ''} onChange={e => set('valide_du', e.target.value)} /></div>
        <div><label style={label}>Valide au</label><input style={input} type="date" value={o.valide_au || ''} onChange={e => set('valide_au', e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 18, margin: '16px 0', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#C9D4E5', fontSize: 13 }}><input type="checkbox" checked={!!o.actif} onChange={e => set('actif', e.target.checked)} /> Active</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#C9D4E5', fontSize: 13 }}><input type="checkbox" checked={!!o.mise_en_avant} onChange={e => set('mise_en_avant', e.target.checked)} /> Mise en avant</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#C9D4E5', fontSize: 13 }}><input type="checkbox" checked={!!o.demo} onChange={e => set('demo', e.target.checked)} /> Démo (fictive)</label>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => { if (!o.organisme || !o.url) { alert('Organisme et lien obligatoires.'); return } onSave(o) }} style={btn('linear-gradient(135deg,#FF8A3D,#234B3C)')}>Enregistrer</button>
        <button onClick={onCancel} style={btn('#1E2D3D')}>Annuler</button>
      </div>
    </div>
  )
}
