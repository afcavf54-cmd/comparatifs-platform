'use client'
import { useRef } from 'react'

interface HtmlEditorProps {
  value: string
  onChange: (val: string) => void
  rows?: number
  placeholder?: string
}

export default function HtmlEditor({ value, onChange, rows = 8, placeholder }: HtmlEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)

  function wrap(before: string, after: string) {
    const ta = taRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end)
    const newVal = value.slice(0, start) + before + selected + after + value.slice(end)
    onChange(newVal)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + before.length, end + before.length)
    }, 0)
  }

  function insertBlock(tag: string) {
    const ta = taRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end) || 'Titre'
    const block = `<${tag}>${selected}</${tag}>\n`
    const newVal = value.slice(0, start) + block + value.slice(end)
    onChange(newVal)
  }

  const btnStyle = {
    padding: '4px 10px', borderRadius: 5, border: '1px solid #1E2D3D',
    background: '#0A0E1A', color: '#8B9CB0', cursor: 'pointer', fontSize: 12,
    fontWeight: 600, transition: 'all .15s', lineHeight: '1.4'
  }

  return (
    <div style={{ border: '1px solid #1E2D3D', borderRadius: 8, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 8px', background: '#0A0E1A', borderBottom: '1px solid #1E2D3D', flexWrap: 'wrap' as const }}>
        <button style={btnStyle} onMouseEnter={e => { (e.currentTarget.style.color = '#fff'); (e.currentTarget.style.borderColor = '#00D4AA') }} onMouseLeave={e => { (e.currentTarget.style.color = '#8B9CB0'); (e.currentTarget.style.borderColor = '#1E2D3D') }} onClick={() => wrap('<strong>', '</strong>')} title="Gras"><b>B</b></button>
        <button style={btnStyle} onMouseEnter={e => { (e.currentTarget.style.color = '#fff'); (e.currentTarget.style.borderColor = '#00D4AA') }} onMouseLeave={e => { (e.currentTarget.style.color = '#8B9CB0'); (e.currentTarget.style.borderColor = '#1E2D3D') }} onClick={() => wrap('<em>', '</em>')} title="Italique"><i>I</i></button>
        <div style={{ width: 1, background: '#1E2D3D', margin: '0 2px' }} />
        <button style={btnStyle} onMouseEnter={e => { (e.currentTarget.style.color = '#fff'); (e.currentTarget.style.borderColor = '#00D4AA') }} onMouseLeave={e => { (e.currentTarget.style.color = '#8B9CB0'); (e.currentTarget.style.borderColor = '#1E2D3D') }} onClick={() => insertBlock('h2')} title="Titre H2">H2</button>
        <button style={btnStyle} onMouseEnter={e => { (e.currentTarget.style.color = '#fff'); (e.currentTarget.style.borderColor = '#00D4AA') }} onMouseLeave={e => { (e.currentTarget.style.color = '#8B9CB0'); (e.currentTarget.style.borderColor = '#1E2D3D') }} onClick={() => insertBlock('h3')} title="Titre H3">H3</button>
        <button style={btnStyle} onMouseEnter={e => { (e.currentTarget.style.color = '#fff'); (e.currentTarget.style.borderColor = '#00D4AA') }} onMouseLeave={e => { (e.currentTarget.style.color = '#8B9CB0'); (e.currentTarget.style.borderColor = '#1E2D3D') }} onClick={() => insertBlock('h4')} title="Titre H4">H4</button>
        <div style={{ width: 1, background: '#1E2D3D', margin: '0 2px' }} />
        <button style={btnStyle} onMouseEnter={e => { (e.currentTarget.style.color = '#fff'); (e.currentTarget.style.borderColor = '#00D4AA') }} onMouseLeave={e => { (e.currentTarget.style.color = '#8B9CB0'); (e.currentTarget.style.borderColor = '#1E2D3D') }} onClick={() => wrap('<p>', '</p>\n')} title="Paragraphe">¶</button>
        <button style={btnStyle} onMouseEnter={e => { (e.currentTarget.style.color = '#fff'); (e.currentTarget.style.borderColor = '#00D4AA') }} onMouseLeave={e => { (e.currentTarget.style.color = '#8B9CB0'); (e.currentTarget.style.borderColor = '#1E2D3D') }} onClick={() => { const ta = taRef.current; if (!ta) return; const pos = ta.selectionStart; const newVal = value.slice(0, pos) + '<li></li>\n' + value.slice(pos); onChange(newVal) }} title="Item liste">• li</button>
        <button style={btnStyle} onMouseEnter={e => { (e.currentTarget.style.color = '#fff'); (e.currentTarget.style.borderColor = '#00D4AA') }} onMouseLeave={e => { (e.currentTarget.style.color = '#8B9CB0'); (e.currentTarget.style.borderColor = '#1E2D3D') }} onClick={() => wrap('<ul>\n', '\n</ul>')} title="Liste">ul</button>
        <div style={{ width: 1, background: '#1E2D3D', margin: '0 2px' }} />
        <button style={{ ...btnStyle, color: '#FC8181' }} onMouseEnter={e => { (e.currentTarget.style.borderColor = '#FC8181') }} onMouseLeave={e => { (e.currentTarget.style.borderColor = '#1E2D3D') }} onClick={() => { if (window.confirm('Effacer tout le contenu ?')) onChange('') }} title="Effacer">✕</button>
      </div>
      {/* Textarea */}
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: 12, background: '#0D1117', border: 'none',
          color: '#E2E8F0', fontSize: 13, lineHeight: 1.6, outline: 'none',
          fontFamily: 'monospace', resize: 'vertical', minHeight: `${rows * 22}px`,
          boxSizing: 'border-box' as const, display: 'block'
        }}
      />
    </div>
  )
}
