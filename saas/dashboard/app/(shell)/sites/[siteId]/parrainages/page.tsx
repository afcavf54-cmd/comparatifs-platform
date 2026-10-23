'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type Offer = {
  id?: string; marque: string; slug?: string; categorie?: string | null
  montant?: number | null; sans_depot?: boolean; montant_sans_depot?: number | null
  conditions?: string | null; lien: string; code_parrainage?: string | null
  logo_url?: string | null; couleur?: string | null; nouveau?: boolean
  en_avant?: boolean; acces_libre?: boolean; ordre?: number; actif?: boolean; verifie_le?: string | null
}
const BLANK: Offer = { marque: '', slug: '', categorie: '', montant: null, sans_depot: false, montant_sans_depot: null, conditions: '', lien: '', code_parrainage: '', logo_url: '', couleur: '', nouveau: false, en_avant: false, acces_libre: false, ordre: 0, actif: true }

const card = { background: '#0F1724', border: '1px solid #1E2D3D', borderRadius: 12, padding: 18 }
const input = { width: '100%', padding: '9px 12px', borderRadius: 8, background: '#0A0E1A', border: '1px solid #1E2D3D', color: '#fff', fontSize: 13 } as const
const label = { display: 'block', fontSize: 11, color: '#8B9CB0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }
const btn = (bg: string) => ({ padding: '9px 16px', borderRadius: 8, background: bg, color: '#fff', border: 0, fontSize: 13, fontWeight: 600, cursor: 'pointer' } as const)

export default function ParrainagesAdmin() {
  const { siteId } = useParams<{ siteId: string }>()
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<Offer | null>(null)

  async function load() {
    setLoading(true); setErr('')
    const r = await fetch(`/api/sites/${siteId}/parrainages`)
    const d = await r.json()
    if (!r.ok) { setErr(d.error || 'Erreur de chargement'); setOffers([]) }
    else setOffers(d.offers || [])
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [siteId])

  async function save(o: Offer) {
    const method = o.id ? 'PUT' : 'POST'
    const url = o.id ? `/api/sites/${siteId}/parrainages/${o.id}` : `/api/sites/${siteId}/parrainages`
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) })
    const d = await r.json()
    if (!r.ok) { alert(d.error || 'Erreur'); return }
    setEditing(null); load()
  }
  async function del(id?: string) {
    if (!id || !confirm('Supprimer cette offre ?')) return
    const r = await fetch(`/api/sites/${siteId}/parrainages/${id}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json(); alert(d.error || 'Erreur') } else load()
  }

  if (siteId !== 'captain-parrainage') return <div style={{ padding: 24, color: '#8B9CB0' }}>Cet onglet est réservé à captain-parrainage.</div>

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 24px', color: '#fff' }}>
      <Link href={`/sites/${siteId}`} style={{ color: '#8B9CB0', textDecoration: 'none', fontSize: 13 }}>← {siteId}</Link>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 20px', gap: 12 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>🎁 Offres de parrainage</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href={`/sites/${siteId}/parrainages-newsletter`} style={{ ...btn('#1E2D3D'), textDecoration: 'none', display: 'inline-block' }}>✉️ Newsletter</Link>
          <button onClick={() => setEditing({ ...BLANK })} style={btn('linear-gradient(135deg,#00D4AA,#0090FF)')}>+ Ajouter une offre</button>
        </div>
      </div>

      {editing && <OfferForm key={editing.id || 'new'} offer={editing} siteId={siteId} onCancel={() => setEditing(null)} onSave={save} />}

      {err && <div style={{ ...card, borderColor: '#5c2b2e', color: '#ff8a80', marginBottom: 16 }}>{err}</div>}
      {loading ? <div style={{ color: '#8B9CB0' }}>Chargement…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {offers.length === 0 && <div style={{ color: '#8B9CB0' }}>Aucune offre. Cliquez sur « Ajouter une offre ».</div>}
          {offers.map(o => (
            <div key={o.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, opacity: o.actif ? 1 : 0.5, outline: editing && editing.id === o.id ? '2px solid #0090FF' : 'none' }}>
              {o.logo_url
                ? <img src={o.logo_url} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', flexShrink: 0, background: '#0A0E1A' }} />
                : <div style={{ width: 40, height: 40, borderRadius: 10, background: o.couleur || '#142B4F', display: 'grid', placeItems: 'center', fontWeight: 700, flexShrink: 0 }}>{(o.marque || '?').slice(0, 2).toUpperCase()}</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{o.marque} {o.nouveau && <span style={{ fontSize: 10, color: '#F59E0B' }}>NOUVEAU</span>} {o.en_avant && <span style={{ fontSize: 10, color: '#00D4AA' }}>★</span>}</div>
                <div style={{ fontSize: 12, color: '#8B9CB0' }}>{o.categorie} · {o.montant ? o.montant + '€' : '—'} · {o.sans_depot ? 'sans dépôt' : 'dépôt requis'} · {o.acces_libre ? 'accès libre' : 'verrouillée'}</div>
              </div>
              <button onClick={() => setEditing(editing && editing.id === o.id ? null : o)} style={btn('#1E2D3D')}>{editing && editing.id === o.id ? 'Fermer' : 'Éditer'}</button>
              <button onClick={() => del(o.id)} style={btn('#3a1215')}>Supprimer</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OfferForm({ offer, siteId, onCancel, onSave }: { offer: Offer; siteId: string; onCancel: () => void; onSave: (o: Offer) => void }) {
  const [o, setO] = useState<Offer>(offer)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k: keyof Offer, v: any) => setO({ ...o, [k]: v })
  const num = (v: string) => (v === '' ? null : Number(v))

  async function uploadLogo(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('logo', file)
      if (o.slug || o.marque) fd.append('slug', (o.slug || o.marque) as string)
      const r = await fetch(`/api/sites/${siteId}/parrainages/logo`, { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) { alert(d.error || 'Upload échoué'); return }
      setO({ ...o, logo_url: d.url })
    } catch { alert('Upload échoué') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  return (
    <div style={{ ...card, marginBottom: 20 }}>
      <div style={{ fontWeight: 700, marginBottom: 14 }}>{o.id ? 'Éditer l\'offre' : 'Nouvelle offre'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={label}>Marque *</label><input style={input} value={o.marque} onChange={e => set('marque', e.target.value)} /></div>
        <div><label style={label}>Catégorie</label><input style={input} value={o.categorie || ''} onChange={e => set('categorie', e.target.value)} placeholder="Banque, Néobanque, Bourse…" /></div>
        <div><label style={label}>Montant (€)</label><input style={input} type="number" value={o.montant ?? ''} onChange={e => set('montant', num(e.target.value))} /></div>
        <div><label style={label}>Montant sans dépôt (€)</label><input style={input} type="number" value={o.montant_sans_depot ?? ''} onChange={e => set('montant_sans_depot', num(e.target.value))} /></div>
        <div style={{ gridColumn: '1 / -1' }}><label style={label}>Lien d'affiliation *</label><input style={input} value={o.lien} onChange={e => set('lien', e.target.value)} /></div>
        <div><label style={label}>Code parrainage</label><input style={input} value={o.code_parrainage || ''} onChange={e => set('code_parrainage', e.target.value)} /></div>
        <div><label style={label}>Couleur (#hex)</label><input style={input} value={o.couleur || ''} onChange={e => set('couleur', e.target.value)} placeholder="#E6007E" /></div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={label}>Logo</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {o.logo_url
              ? <img src={o.logo_url} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', background: '#0A0E1A', flexShrink: 0 }} />
              : <div style={{ width: 44, height: 44, borderRadius: 10, background: o.couleur || '#142B4F', display: 'grid', placeItems: 'center', fontWeight: 700, flexShrink: 0 }}>{(o.marque || '?').slice(0, 2).toUpperCase()}</div>}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} />
            <button type="button" onClick={() => fileRef.current?.click()} style={btn('#1E2D3D')} disabled={uploading}>{uploading ? 'Upload…' : 'Choisir un logo'}</button>
            {o.logo_url && <button type="button" onClick={() => set('logo_url', '')} style={btn('#3a1215')}>Retirer</button>}
          </div>
          <input style={{ ...input, marginTop: 8 }} value={o.logo_url || ''} onChange={e => set('logo_url', e.target.value)} placeholder="…ou colle une URL de logo" />
        </div>
        <div><label style={label}>Ordre</label><input style={input} type="number" value={o.ordre ?? 0} onChange={e => set('ordre', Number(e.target.value))} /></div>
        <div style={{ gridColumn: '1 / -1' }}><label style={label}>Conditions (une par ligne)</label><textarea style={{ ...input, minHeight: 70 }} value={o.conditions || ''} onChange={e => set('conditions', e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '14px 0' }}>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!o.sans_depot} onChange={e => set('sans_depot', e.target.checked)} /> Sans dépôt</label>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!o.nouveau} onChange={e => set('nouveau', e.target.checked)} /> Nouveau</label>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!o.en_avant} onChange={e => set('en_avant', e.target.checked)} /> Mis en avant</label>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!o.acces_libre} onChange={e => set('acces_libre', e.target.checked)} /> Accès libre (visible sans inscription)</label>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={o.actif !== false} onChange={e => set('actif', e.target.checked)} /> Active</label>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => onSave(o)} style={btn('linear-gradient(135deg,#00D4AA,#0090FF)')}>Enregistrer</button>
        <button onClick={onCancel} style={btn('#1E2D3D')}>Annuler</button>
      </div>
    </div>
  )
}
