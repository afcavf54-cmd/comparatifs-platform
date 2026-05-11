'use client'
import { useRef, useEffect, useState } from 'react'

interface RichEditorProps {
  value: string
  onChange: (html: string) => void
  onImageUpload?: () => void   // déclenche le file picker du parent
  placeholder?: string
  height?: number
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
export default function RichEditor({ value, onChange, onImageUpload, placeholder = 'Écris ton article ici…', height = 500 }: RichEditorProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [showSource, setShowSource] = useState(false)
  const [sourceValue, setSourceValue] = useState(value)
  const lastEmittedRef = useRef<string>(value)

  // Sync value → DOM uniquement si le HTML est différent de ce qu'on a émis
  // (évite de reset le curseur à chaque keystroke).
  useEffect(() => {
    if (!ref.current) return
    if (value !== lastEmittedRef.current && value !== ref.current.innerHTML) {
      ref.current.innerHTML = value || ''
      lastEmittedRef.current = value
    }
  }, [value])

  function emit() {
    if (!ref.current) return
    const html = ref.current.innerHTML
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

  function insertLink() {
    const url = prompt('URL du lien :', 'https://')
    if (!url) return
    exec('createLink', url)
  }

  function unlink() {
    exec('unlink')
  }

  function toggleSource() {
    if (!showSource) {
      setSourceValue(ref.current?.innerHTML || '')
    } else {
      // Quand on quitte le mode source, on applique le contenu édité
      onChange(sourceValue)
      lastEmittedRef.current = sourceValue
      if (ref.current) ref.current.innerHTML = sourceValue
    }
    setShowSource(s => !s)
  }

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
          <Btn onClick={insertLink} title="Insérer un lien">🔗</Btn>
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
            // Coller du texte brut par défaut (évite les styles bizarres)
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

      <style jsx global>{`
        .rich-editor:empty::before {
          content: attr(data-placeholder);
          color: #4A5568;
          pointer-events: none;
        }
        .rich-editor h1 { font-size: 26px; font-weight: 600; color: #fff; margin: 18px 0 10px; }
        .rich-editor h2 { font-size: 22px; font-weight: 600; color: #fff; margin: 18px 0 10px; }
        .rich-editor h3 { font-size: 18px; font-weight: 600; color: #fff; margin: 14px 0 8px; }
        .rich-editor p { margin-bottom: 12px; }
        .rich-editor ul, .rich-editor ol { margin: 0 0 12px 24px; }
        .rich-editor li { margin-bottom: 4px; }
        .rich-editor a { color: #00D4AA; text-decoration: underline; }
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
      `}</style>
    </div>
  )
}

const toolbar: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
  padding: 8, background: '#0A0E1A', borderBottom: '1px solid #1E2D3D',
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
