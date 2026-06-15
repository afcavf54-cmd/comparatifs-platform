'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface BrandSummary {
  marque: string
  slug: string
  categorie_marque: string
  logo_url: string
  status: 'draft' | 'published'
  date_maj: string
  n_codes: number
  n_offres: number
  n_total: number
  best_offer_label: string
  filename: string
}

const styles = {
  shell: { padding: '32px 40px', maxWidth: 1280, margin: '0 auto', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' } as const,
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' as const },
  title: { fontSize: 28, fontWeight: 700, color: '#1a1a1a' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  search: { padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, minWidth: 280, outline: 'none' },
  btn: { padding: '10px 18px', borderRadius: 8, border: '0', cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 },
  btnPrimary: { background: '#00D4AA', color: '#fff' },
  btnGhost: { background: 'transparent', color: '#666', border: '1px solid #ddd' },
  filters: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' as const },
  chip: { padding: '6px 14px', borderRadius: 999, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#555' },
  chipActive: { background: '#1a1a1a', color: '#fff', borderColor: '#1a1a1a' },
  table: { width: '100%', borderCollapse: 'collapse' as const, background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  th: { textAlign: 'left' as const, padding: '12px 16px', fontSize: 12, color: '#666', fontWeight: 600, textTransform: 'uppercase' as const, background: '#fafafa', borderBottom: '1px solid #eee' },
  td: { padding: '14px 16px', borderBottom: '1px solid #f0f0f0', fontSize: 14, color: '#1a1a1a', verticalAlign: 'middle' as const },
  row: { cursor: 'pointer', transition: 'background .15s' },
  logoCell: { width: 44, height: 44, borderRadius: 8, background: '#fff5f8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, border: '1px solid #f0e3e9' },
  badge: { display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.04em' },
  badgePub: { background: '#e6f7ef', color: '#16a065' },
  badgeDraft: { background: '#fff4e0', color: '#a76b00' },
  catTag: { display: 'inline-block', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#fff5f8', color: '#cf2c61' },
  empty: { textAlign: 'center' as const, padding: '80px 20px', color: '#888' },
  modal: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 460, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' },
  modalTitle: { fontSize: 20, fontWeight: 700, marginBottom: 6 },
  modalSub: { fontSize: 13, color: '#666', marginBottom: 18 },
  field: { display: 'flex', flexDirection: 'column' as const, gap: 6, marginBottom: 14 },
  label: { fontSize: 12, color: '#555', fontWeight: 600 },
  input: { padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, outline: 'none' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 },
}

export default function CodesPromoListPage() {
  const params = useParams<{ siteId: string }>()
  const router = useRouter()
  const siteId = params.siteId
  const [brands, setBrands] = useState<BrandSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newMarque, setNewMarque] = useState('')
  const [newUrlAff, setNewUrlAff] = useState('')
  const [newCategorie, setNewCategorie] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function loadBrands() {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/sites/${siteId}/codes-promo`, { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setBrands(Array.isArray(data.brands) ? data.brands : [])
    } catch (e: any) {
      setError(e?.message || 'Chargement échoué')
      setBrands([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadBrands() }, [siteId])

  async function handleCreate() {
    if (!newMarque.trim()) {
      setCreateError('Le nom de la marque est requis')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const r = await fetch(`/api/sites/${siteId}/codes-promo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marque: newMarque.trim(),
          url_affiliation: newUrlAff.trim() || undefined,
          categorie_marque: newCategorie.trim() || undefined,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
      router.push(`/sites/${siteId}/codes-promo/${data.slug}`)
    } catch (e: any) {
      setCreateError(e?.message || 'Création échouée')
    } finally {
      setCreating(false)
    }
  }

  const filtered = brands.filter(b => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false
    if (search.trim()) {
      const s = search.toLowerCase()
      if (!b.marque.toLowerCase().includes(s)
          && !(b.categorie_marque || '').toLowerCase().includes(s)
          && !b.slug.toLowerCase().includes(s)) return false
    }
    return true
  })

  const counts = {
    all: brands.length,
    published: brands.filter(b => b.status === 'published').length,
    draft: brands.filter(b => b.status === 'draft').length,
  }

  return (
    <div style={styles.shell}>
      <div style={styles.topBar}>
        <div>
          <div style={styles.title}>Codes promo</div>
          <div style={styles.subtitle}>Gestion des marques et de leurs codes promo · {siteId}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            placeholder="Rechercher une marque…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={styles.search}
          />
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => setShowAddModal(true)}>
            + Ajouter une marque
          </button>
        </div>
      </div>

      <div style={styles.filters}>
        {(['all', 'published', 'draft'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{ ...styles.chip, ...(statusFilter === s ? styles.chipActive : {}) }}
          >
            {s === 'all' ? 'Toutes' : s === 'published' ? 'Publiées' : 'Brouillons'} ({counts[s]})
          </button>
        ))}
      </div>

      {loading ? (
        <div style={styles.empty}>Chargement…</div>
      ) : error ? (
        <div style={styles.empty}>
          <div style={{ color: '#c00', marginBottom: 8 }}>⚠ {error}</div>
          <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={loadBrands}>Réessayer</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>
          <div style={{ fontSize: 16, marginBottom: 6, color: '#1a1a1a', fontWeight: 600 }}>
            {brands.length === 0 ? 'Aucune marque pour ce site' : 'Aucune marque ne correspond aux filtres'}
          </div>
          {brands.length === 0 && (
            <div>Clique sur « Ajouter une marque » pour démarrer.</div>
          )}
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Marque</th>
              <th style={styles.th}>Catégorie</th>
              <th style={styles.th}>Codes</th>
              <th style={styles.th}>Meilleure offre</th>
              <th style={styles.th}>Statut</th>
              <th style={styles.th}>Maj</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => (
              <tr
                key={b.slug}
                style={styles.row}
                onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
                onClick={() => router.push(`/sites/${siteId}/codes-promo/${b.slug}`)}
              >
                <td style={styles.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={styles.logoCell}>
                      {b.logo_url ? (
                        <img src={b.logo_url} alt={b.marque} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#cf2c61' }}>{b.marque.slice(0, 4)}</span>
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{b.marque}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>/{b.slug}</div>
                    </div>
                  </div>
                </td>
                <td style={styles.td}>
                  {b.categorie_marque ? <span style={styles.catTag}>{b.categorie_marque}</span> : <span style={{ color: '#bbb' }}>—</span>}
                </td>
                <td style={styles.td}>
                  <span style={{ fontWeight: 700 }}>{b.n_total}</span>
                  <span style={{ color: '#999', fontSize: 12 }}> ({b.n_codes} codes · {b.n_offres} offres)</span>
                </td>
                <td style={styles.td}>
                  {b.best_offer_label ? <span style={{ color: '#cf2c61', fontWeight: 600 }}>{b.best_offer_label}</span> : <span style={{ color: '#bbb' }}>—</span>}
                </td>
                <td style={styles.td}>
                  <span style={{ ...styles.badge, ...(b.status === 'published' ? styles.badgePub : styles.badgeDraft) }}>
                    {b.status === 'published' ? 'Publié' : 'Brouillon'}
                  </span>
                </td>
                <td style={styles.td}>
                  <span style={{ fontSize: 13, color: '#666' }}>{b.date_maj || '—'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAddModal && (
        <div style={styles.modal} onClick={() => !creating && setShowAddModal(false)}>
          <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>Ajouter une marque</div>
            <div style={styles.modalSub}>Tu pourras compléter tous les détails (codes, FAQ, historique…) dans la fiche.</div>

            <div style={styles.field}>
              <label style={styles.label}>Nom de la marque *</label>
              <input
                type="text"
                value={newMarque}
                onChange={e => setNewMarque(e.target.value)}
                placeholder="ex: SHEIN, Zalando, Asos…"
                style={styles.input}
                autoFocus
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Catégorie de marque (optionnel)</label>
              <input
                type="text"
                value={newCategorie}
                onChange={e => setNewCategorie(e.target.value)}
                placeholder="ex: Mode, Beauté, Tech, Voyage…"
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>URL d'affiliation (optionnel)</label>
              <input
                type="text"
                value={newUrlAff}
                onChange={e => setNewUrlAff(e.target.value)}
                placeholder="https://www.shein.com/?ref=…"
                style={styles.input}
              />
            </div>

            {createError && <div style={{ color: '#c00', fontSize: 13, marginTop: 6 }}>{createError}</div>}

            <div style={styles.modalActions}>
              <button
                style={{ ...styles.btn, ...styles.btnGhost }}
                onClick={() => setShowAddModal(false)}
                disabled={creating}
              >
                Annuler
              </button>
              <button
                style={{ ...styles.btn, ...styles.btnPrimary, opacity: creating ? 0.6 : 1 }}
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? 'Création…' : 'Créer la marque'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
