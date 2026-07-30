'use client'
import { useRef, useEffect, useState } from 'react'

interface RichEditorProps {
  value: string
  onChange: (html: string) => void
  onImageUpload?: () => void   // déclenche le file picker du parent
  placeholder?: string
  height?: number
  imagePreviewBase?: string    // base pour AFFICHER les images relatives (raw GitHub) sans changer le src stocké
}

/**
 * Éditeur WYSIWYG simple basé sur contentEditable.
 * - Sortie en HTML pur (pas de markdown)
 * - Toolbar avec B, I, H1, H2, H3, listes, lien, image, citation, paragraphe normal
 * - Zéro dépendance NPM
 *
 * Note : utilise document.execCommand qui est techniquement deprecated mais
 * fonctionne dans tous les navigateurs majeurs et reste l'API la plus simple
 * pour de l'édition rich-text basique.
 */
/**
 * Nettoie le HTML : rééquilibre les balises (via le parseur du navigateur) et
 * SUPPRIME les tableaux vides. Un tableau mal fermé / vide faisait perdre tout
 * le contenu au retour du mode source (le navigateur réorganise le DOM et
 * éjecte ce qui suit une table invalide). On normalise donc systématiquement.
 */
function sanitizeHtml(html: string): string {
  if (typeof document === 'undefined') return html
  const textLen = (s: string) => {
    const d = document.createElement('div'); d.innerHTML = s
    return (d.textContent || '').replace(/\s+/g, '').length
  }
  const before = textLen(html)
  // 1) Retrait des tableaux VIDES au niveau de la CHAÎNE, avant tout parse.
  //    On gère aussi les tableaux NON fermés (le cas qui casse tout) : on
  //    capture jusqu'à </table> OU jusqu'au prochain bloc (<h1-6>/<p>/fin).
  //    Sans ça, le navigateur « foster-parent » le contenu suivant hors du
  //    tableau et le déplace → l'utilisateur croit que le contenu a disparu.
  const cleaned = html.replace(
    /<table\b[^>]*>([\s\S]*?)(?:<\/table>|(?=<h[1-6]\b|<p\b|$))/gi,
    (m, inner) => {
      const txt = String(inner).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim()
      return txt === '' ? '' : m
    }
  )
  // 2) Rééquilibrage léger des balises via le DOM.
  const tmp = document.createElement('div')
  tmp.innerHTML = cleaned
  const out = tmp.innerHTML
  // 3) Garde-fou anti-perte : si malgré tout du texte a disparu, on renvoie
  //    la source d'origine (mieux vaut un tableau moche que du contenu perdu).
  if (textLen(out) < before - 2) return html
  return out
}

export default function RichEditor({ value, onChange, onImageUpload, placeholder = 'Écris ton article ici…', height = 500, imagePreviewBase = '' }: RichEditorProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [showSource, setShowSource] = useState(false)
  const [sourceValue, setSourceValue] = useState(value)
  const lastEmittedRef = useRef<string>('\u0000__INIT__\u0000')

  // Les images sont stockées avec un chemin RELATIF (/blog/...) pour le site
  // en ligne, mais l'éditeur tourne sur un autre domaine → l'image ne s'affiche
  // pas. On réécrit donc le src en URL raw GitHub POUR L'AFFICHAGE uniquement,
  // et on reconvertit en relatif à la sauvegarde (toStored).
  const _base = (imagePreviewBase || '').replace(/\/$/, '')
  const toPreview = (html: string) => _base
    ? html.replace(/(<img\b[^>]*\bsrc=["'])\/(?!\/)/gi, `$1${_base}/`)
    : html
  const toStored = (html: string) => _base
    ? html.replace(new RegExp('(<img\\b[^>]*\\bsrc=["\'])' + _base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/', 'gi'), '$1/')
    : html

  // ─── État de la modale "Insérer / éditer un lien" ──────────────────────
  // execCommand('createLink') ne permet ni target ni rel. On gère donc
  // l'insertion manuellement via insertHTML, avec une modale qui propose
  // - URL
  // - Texte d'ancre (auto-rempli depuis la sélection)
  // - Checkbox "Ouvrir dans un nouvel onglet" → target="_blank"
  // - Checkbox "Nofollow"                      → rel="nofollow"
  // Quand target=_blank, on ajoute automatiquement noopener+noreferrer
  // dans rel (best practice de sécurité contre window.opener hijacking).
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [linkBlank, setLinkBlank] = useState(false)
  const [linkNofollow, setLinkNofollow] = useState(false)
  const editingLinkRef = useRef<HTMLAnchorElement | null>(null) // <a> à éditer, ou null si nouveau lien
  const savedRangeRef = useRef<Range | null>(null)              // sélection sauvegardée à la restoration

  useEffect(() => {
    try { document.execCommand('defaultParagraphSeparator', false, 'p') } catch {}
  }, [])

  useEffect(() => {
    if (!ref.current) return
    const stored = toStored(ref.current.innerHTML)
    if (value !== lastEmittedRef.current && value !== stored) {
      ref.current.innerHTML = toPreview(value || '')
      lastEmittedRef.current = value
    }
  }, [value])

  function emit() {
    if (!ref.current) return
    let html = ref.current.innerHTML
    html = html.replace(/<div(\s[^>]*)?>/gi, '<p>').replace(/<\/div>/gi, '</p>')
    html = toStored(html)   // images preview -> chemin relatif (stocké)
    lastEmittedRef.current = html
    onChange(html)
  }

  function exec(cmd: string, arg?: string) {
    if (!ref.current) return
    ref.current.focus()
    document.execCommand(cmd, false, arg)
    emit()
  }

  function setBlock(tag: string) {
    exec('formatBlock', `<${tag}>`)
  }

  /** Ouvre la modale d'insertion/édition de lien.
   * Si le curseur est positionné dans un <a> existant, pré-remplit la modale
   * avec ses valeurs (URL, target, rel). Sinon, prépare un nouveau lien
   * en pré-remplissant le texte d'ancre avec la sélection courante. */
  function openLinkModal() {
    if (!ref.current) return
    ref.current.focus()

    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) {
      savedRangeRef.current = null
      editingLinkRef.current = null
      setLinkUrl('https://')
      setLinkText('')
      setLinkBlank(false)
      setLinkNofollow(false)
      setShowLinkModal(true)
      return
    }
    const range = sel.getRangeAt(0)

    // Cherche un <a> qui englobe le curseur (édition d'un lien existant)
    let node: Node | null = range.commonAncestorContainer
    let existingLink: HTMLAnchorElement | null = null
    while (node && node !== ref.current) {
      if (node.nodeType === 1 && (node as HTMLElement).tagName === 'A') {
        existingLink = node as HTMLAnchorElement
        break
      }
      node = node.parentNode
    }

    if (existingLink) {
      // Mode édition
      editingLinkRef.current = existingLink
      setLinkUrl(existingLink.getAttribute('href') || '')
      setLinkText(existingLink.textContent || '')
      setLinkBlank(existingLink.getAttribute('target') === '_blank')
      const rel = (existingLink.getAttribute('rel') || '').toLowerCase()
      setLinkNofollow(/\bnofollow\b/.test(rel))
    } else {
      // Mode création
      editingLinkRef.current = null
      setLinkUrl('https://')
      setLinkText(sel.toString())
      setLinkBlank(false)
      setLinkNofollow(false)
    }

    // Sauvegarder la range pour la restaurer après que la modale prenne
    // le focus. Sans ça, execCommand('insertHTML') insérerait au mauvais
    // endroit (ou rien du tout si plus de sélection).
    savedRangeRef.current = range.cloneRange()
    setShowLinkModal(true)
  }

  function applyLink() {
    const url = linkUrl.trim()
    if (!url || url === 'https://') {
      setShowLinkModal(false)
      return
    }
    if (!ref.current) return

    // Construire l'attribut rel (combine target + nofollow proprement)
    const relParts: string[] = []
    if (linkBlank) {
      // Sécurité : sans noopener, le nouvel onglet peut accéder à window.opener
      // et rediriger l'onglet source. Toujours ajouter quand target=_blank.
      relParts.push('noopener', 'noreferrer')
    }
    if (linkNofollow) relParts.push('nofollow')
    const relAttr = relParts.length > 0 ? relParts.join(' ') : ''

    const existing = editingLinkRef.current
    if (existing) {
      // Mode édition : mettre à jour les attrs sans recréer le <a>
      existing.setAttribute('href', url)
      if (linkBlank) existing.setAttribute('target', '_blank')
      else existing.removeAttribute('target')
      if (relAttr) existing.setAttribute('rel', relAttr)
      else existing.removeAttribute('rel')
      // Si on a changé le texte, mettre à jour (sinon laisser le contenu intact)
      const trimmedText = linkText.trim()
      if (trimmedText && trimmedText !== existing.textContent) {
        existing.textContent = trimmedText
      }
    } else {
      // Mode création : insérer un nouveau <a> à l'endroit de la sélection
      ref.current.focus()
      const sel = window.getSelection()
      if (sel && savedRangeRef.current) {
        sel.removeAllRanges()
        sel.addRange(savedRangeRef.current)
      }
      const text = linkText.trim() || url
      const attrs: string[] = [`href="${escapeAttr(url)}"`]
      if (linkBlank) attrs.push(`target="_blank"`)
      if (relAttr) attrs.push(`rel="${escapeAttr(relAttr)}"`)
      const html = `<a ${attrs.join(' ')}>${escapeText(text)}</a>`
      document.execCommand('insertHTML', false, html)
    }

    emit()
    setShowLinkModal(false)
    editingLinkRef.current = null
    savedRangeRef.current = null
  }

  function cancelLink() {
    setShowLinkModal(false)
    editingLinkRef.current = null
    savedRangeRef.current = null
  }

  function unlink() {
    exec('unlink')
  }

  function toggleSource() {
    if (!showSource) {
      setSourceValue(toStored(ref.current?.innerHTML || '')) // source montre le relatif
    } else {
      // Retour du mode source : on NETTOIE avant de réinjecter, sinon un
      // tableau mal fermé fait perdre le contenu.
      const clean = toStored(sanitizeHtml(sourceValue))
      onChange(clean)
      lastEmittedRef.current = clean
      if (ref.current) ref.current.innerHTML = toPreview(clean)
      setSourceValue(clean)
    }
    setShowSource(s => !s)
  }

  const currentText = (showSource ? sourceValue : value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const wordCount = currentText ? currentText.split(/\s+/).filter(Boolean).length : 0
  const charCount = currentText.length

  // Aperçu de la balise <a> qui sera générée (utile pour debug visuel)
  const linkPreview = (() => {
    const url = linkUrl.trim() || 'https://...'
    const attrs: string[] = [`href="${url}"`]
    if (linkBlank) attrs.push(`target="_blank"`)
    const relParts: string[] = []
    if (linkBlank) relParts.push('noopener', 'noreferrer')
    if (linkNofollow) relParts.push('nofollow')
    if (relParts.length > 0) attrs.push(`rel="${relParts.join(' ')}"`)
    return `<a ${attrs.join(' ')}>${linkText.trim() || 'texte'}</a>`
  })()

  return (
    <div style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 10, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={toolbar}>
        <BtnGroup>
          <Btn onClick={() => setBlock('p')} title="Paragraphe">¶</Btn>
          <Btn onClick={() => setBlock('h2')} title="Titre H2"><b>H2</b></Btn>
          <Btn onClick={() => setBlock('h3')} title="Titre H3"><b>H3</b></Btn>
        </BtnGroup>
        <Sep />
        <BtnGroup>
          <Btn onClick={() => exec('bold')} title="Gras (Ctrl+B)"><b>B</b></Btn>
          <Btn onClick={() => exec('italic')} title="Italique (Ctrl+I)"><i>I</i></Btn>
          <Btn onClick={() => exec('underline')} title="Souligné"><u>U</u></Btn>
        </BtnGroup>
        <Sep />
        <BtnGroup>
          <Btn onClick={() => exec('insertUnorderedList')} title="Liste à puces">• ≡</Btn>
          <Btn onClick={() => exec('insertOrderedList')} title="Liste numérotée">1. ≡</Btn>
          <Btn onClick={() => setBlock('blockquote')} title="Citation">❝</Btn>
        </BtnGroup>
        <Sep />
        <BtnGroup>
          <Btn onClick={openLinkModal} title="Insérer / éditer un lien">🔗</Btn>
          <Btn onClick={unlink} title="Supprimer le lien">⛓</Btn>
          {onImageUpload && <Btn onClick={onImageUpload} title="Insérer une image">📷</Btn>}
        </BtnGroup>
        <Sep />
        <BtnGroup>
          <Btn onClick={() => exec('removeFormat')} title="Effacer la mise en forme">⊘</Btn>
          <Btn onClick={() => exec('undo')} title="Annuler">↶</Btn>
          <Btn onClick={() => exec('redo')} title="Rétablir">↷</Btn>
        </BtnGroup>
        <div style={{ flex: 1 }} />
        <Btn onClick={toggleSource} title="Basculer en mode source HTML" style={{ background: showSource ? '#00D4AA' : '#1E2D3D', color: showSource ? '#0A0E1A' : '#fff' }}>
          {showSource ? '✓ Source' : '<HTML>'}
        </Btn>
      </div>

      {/* Zone d'édition */}
      {showSource ? (
        <textarea value={sourceValue} onChange={e => setSourceValue(e.target.value)}
          style={{ width: '100%', minHeight: height, padding: 18, background: '#0A0E1A', border: 'none', color: '#fff', fontFamily: 'Menlo, Monaco, Consolas, monospace', fontSize: 12, lineHeight: 1.6, resize: 'vertical', outline: 'none' }} />
      ) : (
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onPaste={e => {
            e.preventDefault()
            const text = e.clipboardData.getData('text/plain')
            document.execCommand('insertText', false, text)
          }}
          data-placeholder={placeholder}
          style={{
            minHeight: height, padding: 24, color: '#E5E7EB', fontSize: 15,
            lineHeight: 1.75, outline: 'none', overflowY: 'auto',
          }}
          className="rich-editor"
        />
      )}

      {/* Footer avec compteur de mots */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 16px', background: '#0A0E1A', borderTop: '1px solid #1E2D3D',
                    fontSize: 11, color: '#8B9CB0' }}>
        <span>{wordCount} mot{wordCount > 1 ? 's' : ''} · {charCount} caractère{charCount > 1 ? 's' : ''}</span>
        <span style={{ color: '#4A5568' }}>{showSource ? 'Mode source HTML' : 'Mode édition'}</span>
      </div>

      {/* ─── Modale Insertion / édition de lien ─────────────────────────── */}
      {showLinkModal && (
        <div onClick={cancelLink}
             style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()}
               style={{ background: '#0D1117', border: '1px solid #1E2D3D', borderRadius: 14,
                        padding: 28, width: '90%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: '0 0 4px' }}>
              {editingLinkRef.current ? '✏️ Modifier le lien' : '🔗 Insérer un lien'}
            </h3>
            <p style={{ color: '#8B9CB0', fontSize: 12, margin: '0 0 20px' }}>
              {editingLinkRef.current
                ? "Modifie l'URL, le texte ou les options du lien existant."
                : "Saisis l'URL et choisis les options (utile pour liens affiliés ou externes)."}
            </p>

            <label style={modalLabel}>URL *</label>
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                   placeholder="https://exemple.com" autoFocus
                   style={modalInput} />

            <label style={modalLabel}>Texte du lien {editingLinkRef.current ? '' : "(sinon affiche l'URL)"}</label>
            <input value={linkText} onChange={e => setLinkText(e.target.value)}
                   placeholder="ex: notre comparatif"
                   style={modalInput} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18,
                          padding: 14, background: '#0A0E1A', borderRadius: 10, border: '1px solid #1E2D3D' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', color: '#E5E7EB', fontSize: 13 }}>
                <input type="checkbox" checked={linkBlank} onChange={e => setLinkBlank(e.target.checked)}
                       style={{ marginTop: 3, accentColor: '#00D4AA' }} />
                <span>
                  <strong>Ouvrir dans un nouvel onglet</strong>{' '}
                  <code style={{ color: '#F6AD55', fontSize: 11 }}>target="_blank"</code>
                  <div style={{ fontSize: 11, color: '#8B9CB0', marginTop: 2 }}>
                    Recommandé pour les liens vers d'autres sites. Ajoute automatiquement{' '}
                    <code style={{ color: '#F6AD55' }}>noopener noreferrer</code> pour la sécurité.
                  </div>
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', color: '#E5E7EB', fontSize: 13 }}>
                <input type="checkbox" checked={linkNofollow} onChange={e => setLinkNofollow(e.target.checked)}
                       style={{ marginTop: 3, accentColor: '#00D4AA' }} />
                <span>
                  <strong>Nofollow</strong>{' '}
                  <code style={{ color: '#F6AD55', fontSize: 11 }}>rel="nofollow"</code>
                  <div style={{ fontSize: 11, color: '#8B9CB0', marginTop: 2 }}>
                    Recommandé pour les liens affiliés, sponsorisés ou non vérifiés. Indique à Google de ne pas transmettre de jus SEO.
                  </div>
                </span>
              </label>
            </div>

            {/* Aperçu du HTML qui sera inséré */}
            <div style={{ marginTop: 16, padding: 12, background: '#0A0E1A', borderRadius: 8,
                          border: '1px dashed #1E2D3D', fontSize: 11, color: '#8B9CB0',
                          fontFamily: 'Menlo, Monaco, Consolas, monospace', wordBreak: 'break-all' }}>
              <div style={{ color: '#4A5568', marginBottom: 4 }}>Aperçu HTML :</div>
              <div style={{ color: '#00D4AA' }}>{linkPreview}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={cancelLink}
                      style={{ padding: '10px 18px', borderRadius: 8, background: '#1E2D3D',
                               color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Annuler
              </button>
              <button onClick={applyLink}
                      style={{ padding: '10px 18px', borderRadius: 8, background: '#00D4AA',
                               color: '#0A0E1A', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {editingLinkRef.current ? '✓ Modifier' : '✓ Insérer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .rich-editor:empty::before {
          content: attr(data-placeholder);
          color: #4A5568;
          pointer-events: none;
        }
        .rich-editor h1 { font-size: 26px; font-weight: 600; color: #fff; margin: 18px 0 10px; }
        .rich-editor h2 { font-size: 22px; font-weight: 600; color: #fff; margin: 18px 0 10px; }
        .rich-editor h3 { font-size: 18px; font-weight: 600; color: #fff; margin: 14px 0 8px; }
        .rich-editor p,
        .rich-editor div { margin-bottom: 12px; }
        .rich-editor ul, .rich-editor ol { margin: 0 0 12px 24px; }
        .rich-editor li { margin-bottom: 4px; }
        .rich-editor a {
          color: #F6AD55;
          text-decoration: underline;
          text-decoration-color: #F6AD55;
          text-decoration-thickness: 2px;
          text-underline-offset: 3px;
          font-weight: 600;
          background: rgba(246,173,85,.1);
          padding: 0 4px;
          border-radius: 3px;
          transition: background .15s ease;
        }
        /* Affichage visuel des liens spéciaux pour repérage rapide dans l'éditeur */
        .rich-editor a[target="_blank"]::after {
          content: " ↗";
          font-size: 11px;
          opacity: .7;
        }
        .rich-editor a[rel*="nofollow"] {
          border-bottom: 2px dashed #F6AD55;
        }
        .rich-editor a:hover {
          background: rgba(246,173,85,.22);
        }
        .rich-editor strong, .rich-editor b { color: #fff; font-weight: 700; }
        .rich-editor em, .rich-editor i { font-style: italic; }
        .rich-editor blockquote {
          border-left: 3px solid #00D4AA; padding: 4px 14px; margin: 12px 0;
          color: #8B9CB0; font-style: italic;
        }
        .rich-editor code {
          background: #1E2D3D; padding: 2px 6px; border-radius: 4px;
          font-size: 13px; font-family: Menlo, Monaco, Consolas, monospace;
        }
        .rich-editor img {
          max-width: 100%; height: auto; border-radius: 6px;
          margin: 12px 0; border: 1px solid #1E2D3D;
        }
        /* Tableaux : bordures visibles pour voir les colonnes dans l'éditeur */
        .rich-editor table {
          border-collapse: collapse; width: 100%; margin: 14px 0;
          font-size: 14px; background: #0D1117;
        }
        .rich-editor th, .rich-editor td {
          border: 1px solid #2A3A4D; padding: 8px 12px;
          text-align: left; vertical-align: top; color: #fff;
        }
        .rich-editor th {
          background: #16202E; font-weight: 700;
        }
        .rich-editor tr:nth-child(even) td { background: rgba(255,255,255,0.02); }
      `}</style>
    </div>
  )
}

// Helpers d'échappement HTML pour construire le <a> manuellement
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const toolbar: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
  padding: 8, background: '#0A0E1A', borderBottom: '1px solid #1E2D3D',
}

const modalLabel: React.CSSProperties = {
  display: 'block', fontSize: 11, color: '#8B9CB0',
  textTransform: 'uppercase', letterSpacing: '.05em',
  marginBottom: 6, marginTop: 14,
}

const modalInput: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 8,
  background: '#0A0E1A', border: '1px solid #1E2D3D',
  color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box',
}

function BtnGroup({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'inline-flex', gap: 2 }}>{children}</div>
}

function Sep() {
  return <div style={{ width: 1, height: 22, background: '#1E2D3D', margin: '0 4px' }} />
}

function Btn({ onClick, title, children, style }: { onClick: () => void; title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button type="button" onClick={onClick} title={title} onMouseDown={e => e.preventDefault()}
      style={{
        padding: '6px 10px', borderRadius: 6, background: '#1E2D3D', color: '#fff',
        border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
        minWidth: 32, minHeight: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        ...style,
      }}>
      {children}
    </button>
  )
}
