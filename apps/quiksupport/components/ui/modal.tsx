'use client'

import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode   // pinned to bottom, never scrolls away
  width?: number
}

export function Modal({ title, onClose, children, footer, width = 560 }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: width,
        background: '#fff', borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
        maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        animation: 'fadeIn 0.15s ease',
      }}>
        {/* Fixed header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid #F1F5F9',
          flexShrink: 0,
        }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, border: 'none',
              background: '#F1F5F9', cursor: 'pointer', fontSize: 16, color: '#64748B',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {children}
        </div>

        {/* Pinned footer */}
        {footer && (
          <div style={{
            padding: '14px 24px',
            borderTop: '1px solid #F1F5F9',
            flexShrink: 0,
            background: '#fff',
            borderRadius: '0 0 20px 20px',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function FormField({
  label, required, error, hint, children, compact,
}: {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: ReactNode
  compact?: boolean
}) {
  return (
    <div style={{ marginBottom: compact ? 10 : 14 }}>
      <label style={{
        display: 'block', fontSize: 12, fontWeight: 600, color: '#374151',
        marginBottom: compact ? 4 : 5, letterSpacing: '0.01em',
      }}>
        {label}{required && <span style={{ color: '#EF4444', marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>{hint}</div>}
      {error && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 3 }}>{error}</div>}
    </div>
  )
}

export function Input({
  value, onChange, placeholder, error, type = 'text', style,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: boolean
  type?: string
  style?: React.CSSProperties
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '8px 11px', borderRadius: 8, boxSizing: 'border-box',
        border: `1px solid ${error ? '#EF4444' : '#E2E8F0'}`,
        fontSize: 13, fontFamily: 'inherit', outline: 'none',
        background: '#fff', color: '#1F2937',
        ...style,
      }}
    />
  )
}

export function Textarea({
  value, onChange, placeholder, rows = 4, style,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  style?: React.CSSProperties
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: '100%', padding: '8px 11px', borderRadius: 8, boxSizing: 'border-box',
        border: '1px solid #E2E8F0', fontSize: 13, fontFamily: 'inherit',
        outline: 'none', resize: 'vertical', lineHeight: 1.55,
        background: '#fff', color: '#1F2937',
        ...style,
      }}
    />
  )
}
