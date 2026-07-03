'use client'

import { useState } from 'react'
import type { Category, TicketPriority } from '@/types'
import { PRIORITY_LABELS, PRIORITY_COLORS } from '@/types'

interface WidgetProps {
  tenantId: string
  appId: string
  userId: string
  apiBase?: string
  theme?: {
    accent?: string
    buttonLabel?: string
    title?: string
  }
}

interface WidgetForm {
  subject: string
  description: string
  category_id: string
  subcategory_id: string
  priority: TicketPriority
}

type WidgetState = 'closed' | 'open' | 'success'

export function HelpdeskWidget({ tenantId, appId, userId, apiBase = '', theme = {} }: WidgetProps) {
  const accent = theme.accent || '#6366F1'
  const [state, setState] = useState<WidgetState>('closed')
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState<WidgetForm>({ subject: '', description: '', category_id: '', subcategory_id: '', priority: 'medium' })
  const [errors, setErrors] = useState<Partial<Record<keyof WidgetForm, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [createdNumber, setCreatedNumber] = useState('')

  async function openWidget() {
    setState('open')
    if (categories.length === 0) {
      try {
        const res = await fetch(`${apiBase}/api/categories`, {
          headers: { 'x-tenant-id': tenantId, 'x-app-id': appId, 'x-user-id': userId },
        })
        const data = await res.json()
        if (data.success) setCategories(data.data)
      } catch {}
    }
  }

  function setField(field: keyof WidgetForm, value: string) {
    if (field === 'category_id') {
      setForm(f => ({ ...f, category_id: value, subcategory_id: '' }))
    } else {
      setForm(f => ({ ...f, [field]: value }))
    }
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }))
  }

  function validate() {
    const e: Partial<Record<keyof WidgetForm, string>> = {}
    if (!form.subject.trim()) e.subject = 'Subject is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit() {
    if (!validate()) return
    setSubmitting(true)
    try {
      const res = await fetch(`${apiBase}/api/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
          'x-app-id': appId,
          'x-user-id': userId,
        },
        body: JSON.stringify({
          app_id: appId,
          subject: form.subject.trim(),
          description: form.description.trim() || undefined,
          category_id: form.category_id || undefined,
          subcategory_id: form.subcategory_id || undefined,
          priority: form.priority,
          source: 'widget',
        }),
      })
      const data = await res.json()
      if (data.success) {
        setCreatedNumber(data.data.ticket_number)
        setState('success')
        setForm({ subject: '', description: '', category_id: '', subcategory_id: '', priority: 'medium' })
      }
    } catch {}
    setSubmitting(false)
  }

  const selectedCategory = categories.find(c => c.id === form.category_id)

  if (state === 'closed') {
    return (
      <button
        onClick={openWidget}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 52, height: 52, borderRadius: '50%', border: 'none',
          background: accent, color: '#fff', cursor: 'pointer',
          boxShadow: `0 4px 20px ${accent}66`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, transition: 'transform 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.08)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        title={theme.buttonLabel || 'Get Help'}
      >
        💬
      </button>
    )
  }

  return (
    <>
      <div onClick={() => setState('closed')} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.2)' }} />

      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        width: 380, background: '#fff', borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column',
        maxHeight: '90vh', overflow: 'hidden',
        animation: 'widgetSlideUp 0.2s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 20px', background: accent, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderRadius: '20px 20px 0 0',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{theme.title || 'Help & Support'}</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>We typically reply in a few hours</div>
          </div>
          <button onClick={() => setState('closed')} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: 8, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {state === 'success' ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Ticket Submitted!</div>
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 4 }}>Your ticket number is</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: accent, marginBottom: 20, fontFamily: 'monospace' }}>{createdNumber}</div>
            <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 24 }}>We'll get back to you shortly.</div>
            <button onClick={() => setState('closed')} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Done
            </button>
          </div>
        ) : (
          <div style={{ padding: 20, overflowY: 'auto' }}>
            <WField label="Subject" error={errors.subject} required>
              <WInput value={form.subject} onChange={v => setField('subject', v)} placeholder="What can we help with?" error={!!errors.subject} />
            </WField>

            <WField label="Description">
              <WTextarea value={form.description} onChange={v => setField('description', v)} placeholder="Describe your issue in detail…" />
            </WField>

            {categories.length > 0 && (
              <WField label="Category">
                <WSelect value={form.category_id} onChange={v => setField('category_id', v)}>
                  <option value="">Select a category…</option>
                  {categories.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </WSelect>
              </WField>
            )}

            {selectedCategory && selectedCategory.subcategories.length > 0 && (
              <WField label="Subcategory">
                <WSelect value={form.subcategory_id} onChange={v => setField('subcategory_id', v)}>
                  <option value="">None</option>
                  {selectedCategory.subcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </WSelect>
              </WField>
            )}

            <WField label="Priority">
              <div style={{ display: 'flex', gap: 6 }}>
                {(['low', 'medium', 'high'] as TicketPriority[]).map(p => {
                  const c = PRIORITY_COLORS[p]
                  return (
                    <button key={p} onClick={() => setField('priority', p)} style={{
                      flex: 1, padding: '7px 4px', borderRadius: 7, cursor: 'pointer',
                      border: `1.5px solid ${form.priority === p ? c.dot : '#E2E8F0'}`,
                      background: form.priority === p ? c.bg : '#fff',
                      color: form.priority === p ? c.text : '#94A3B8',
                      fontSize: 11, fontWeight: form.priority === p ? 700 : 500,
                    }}>
                      {PRIORITY_LABELS[p]}
                    </button>
                  )
                })}
              </div>
            </WField>

            <button
              onClick={submit}
              disabled={submitting}
              style={{
                width: '100%', padding: '11px', borderRadius: 10, border: 'none',
                background: submitting ? '#E2E8F0' : accent,
                color: submitting ? '#94A3B8' : '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                marginTop: 8,
              }}
            >
              {submitting ? 'Submitting…' : 'Submit Ticket'}
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes widgetSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </>
  )
}

function WField({ label, children, error, required }: { label: string; children: React.ReactNode; error?: string; required?: boolean }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
        {label}{required && <span style={{ color: '#EF4444', marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {error && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 3 }}>{error}</div>}
    </div>
  )
}

function WInput({ value, onChange, placeholder, error }: { value: string; onChange: (v: string) => void; placeholder?: string; error?: boolean }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '8px 11px', borderRadius: 8, boxSizing: 'border-box',
        border: `1px solid ${error ? '#EF4444' : '#E2E8F0'}`,
        fontSize: 13, fontFamily: 'inherit', outline: 'none',
      }}
    />
  )
}

function WTextarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      style={{
        width: '100%', padding: '8px 11px', borderRadius: 8, boxSizing: 'border-box',
        border: '1px solid #E2E8F0', fontSize: 13, fontFamily: 'inherit',
        outline: 'none', resize: 'vertical',
      }}
    />
  )
}

function WSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', padding: '8px 11px', borderRadius: 8, boxSizing: 'border-box',
        border: '1px solid #E2E8F0', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff',
      }}
    >
      {children}
    </select>
  )
}
