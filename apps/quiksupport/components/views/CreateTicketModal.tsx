'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useHelpdesk } from '@/components/layout/HelpdeskProvider'
import { Modal, FormField, Input, Textarea } from '@/components/ui/modal'
import { MatIcon } from '@/lib/icons'
import type { TicketPriority, SlaConfig, Subcategory } from '@/types'
import { PRIORITY_LABELS, PRIORITY_COLORS } from '@/types'

const PRIORITIES: TicketPriority[] = ['low', 'medium', 'high', 'critical']

function formatHours(hrs: number): string {
  if (hrs < 24) return `${hrs}h`
  const days = Math.round(hrs / 24)
  return `${days} day${days !== 1 ? 's' : ''}`
}

interface Form {
  app_id: string; subject: string; description: string
  category_id: string; subcategory_id: string; priority: TicketPriority
}

const priorityMeta: Record<TicketPriority, { sla: string; border: string; text: string; dot: string }> = {
  critical: { sla: '#FEF2F2', border: '#FCA5A5', text: '#DC2626', dot: '#DC2626' },
  high:     { sla: '#FFF7ED', border: '#FED7AA', text: '#C2410C', dot: '#F97316' },
  medium:   { sla: '#FFFBEB', border: '#FDE68A', text: '#B45309', dot: '#EAB308' },
  low:      { sla: '#F0FDF4', border: '#BBF7D0', text: '#15803D', dot: '#22C55E' },
}

export function CreateTicketModal() {
  const { apps, categories, currentUser, currentApp, navigate, refreshTickets, showToast, tenant, theme } = useHelpdesk()
  const accent = theme.accent || tenant?.accent || '#6366F1'
  const isAgent = ['HELPDESK_ADMIN', 'CATEGORY_LEAD', 'AGENT'].includes(currentUser?.role || '')

  const [form, setForm] = useState<Form>({
    app_id: currentApp?.id || apps[0]?.id || '',
    subject: '', description: '', category_id: '', subcategory_id: '', priority: 'medium',
  })
  const [errors, setErrors]       = useState<Partial<Record<keyof Form, string>>>({})
  const [saving, setSaving]       = useState(false)
  const [tags, setTags]           = useState<string[]>([])
  const [tagInput, setTagInput]   = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [slaConfigs, setSlaConfigs]   = useState<SlaConfig[]>([])
  const tagInputRef  = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/sla-config').then(r => r.json()).then(d => { if (d.success) setSlaConfigs(d.data) }).catch(() => {})
  }, [])

  const slaForPriority = useMemo(() => {
    const categoryMatch = slaConfigs.find(c => c.priority === form.priority && c.category_id === form.category_id && c.category_id)
    const globalMatch   = slaConfigs.find(c => c.priority === form.priority && !c.category_id)
    return categoryMatch || globalMatch || null
  }, [slaConfigs, form.priority, form.category_id])

  const selectedCategory = categories.find(c => c.id === form.category_id) || null
  const subcategories: Subcategory[] = selectedCategory?.subcategories || []

  const categoryLead = useMemo(() => {
    if (!selectedCategory) return null
    const lead = selectedCategory.agents.find(a => a.is_lead && a.app_id === form.app_id)
    return lead?.user || null
  }, [selectedCategory, form.app_id])

  function set(field: keyof Form, value: string) {
    setForm(f => ({ ...f, [field]: value, ...(field === 'category_id' ? { subcategory_id: '' } : {}) }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }))
  }

  function addTag(raw: string) {
    const trimmed = raw.trim().replace(/,+$/, '').trim()
    if (!trimmed || tags.includes(trimmed)) return
    setTags(t => [...t, trimmed]); setTagInput('')
  }
  function removeTag(tag: string) { setTags(t => t.filter(x => x !== tag)) }
  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) }
    else if (e.key === 'Backspace' && !tagInput && tags.length > 0) setTags(t => t.slice(0, -1))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    setAttachments(prev => { const ex = new Set(prev.map(f => f.name)); return [...prev, ...files.filter(f => !ex.has(f.name))] })
    e.target.value = ''
  }

  function validate() {
    const e: Partial<Record<keyof Form, string>> = {}
    if (!form.subject.trim()) e.subject = 'Subject is required'
    if (!form.app_id) e.app_id = 'App is required'
    setErrors(e); return Object.keys(e).length === 0
  }

  async function submit() {
    if (!validate()) return
    setSaving(true)
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: form.app_id, subject: form.subject.trim(),
          description: form.description.trim() || undefined,
          category_id: form.category_id || undefined,
          subcategory_id: form.subcategory_id || undefined,
          priority: form.priority, tags, source: 'portal',
        }),
      })
      const data = await res.json()
      if (data.success) {
        const ticketId = data.data.id
        if (attachments.length > 0) {
          await Promise.allSettled(attachments.map(file => {
            const fd = new FormData(); fd.append('file', file)
            return fetch(`/api/tickets/${ticketId}/attachments`, { method: 'POST', body: fd })
          }))
        }
        showToast(`Ticket ${data.data.ticket_number} created`)
        await refreshTickets()
        navigate('tickets')
      } else showToast(data.error || 'Failed to create ticket', 'error')
    } catch { showToast('Failed to create ticket', 'error') }
    setSaving(false)
  }

  const sel: React.CSSProperties = {
    width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid #E2E8F0',
    fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff', color: '#1F2937',
  }

  const footer = (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <button onClick={() => navigate('tickets')} style={{
        padding: '9px 20px', borderRadius: 9, border: '1px solid #E2E8F0',
        background: '#fff', color: '#64748B', fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}>Cancel</button>
      <button onClick={submit} disabled={saving} style={{
        padding: '9px 24px', borderRadius: 9, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
        background: saving ? '#E2E8F0' : accent,
        color: saving ? '#94A3B8' : '#fff', fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
        boxShadow: saving ? 'none' : `0 2px 8px ${accent}40`,
      }}>
        {saving ? 'Creating…' : 'Create Ticket'}
      </button>
    </div>
  )

  return (
    <Modal title="New Ticket" onClose={() => navigate('tickets')} width={880} footer={footer}>

      {/* ── Two-column grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>

        {/* LEFT: main content */}
        <div>
          {/* App selector */}
          {apps.length > 1 && (
            <FormField label="App" required error={errors.app_id} compact>
              {(() => {
                const selected = apps.find(a => a.id === form.app_id)
                return (
                  <div style={{ position: 'relative' }}>
                    <select
                      value={form.app_id}
                      onChange={e => set('app_id', e.target.value)}
                      style={{
                        width: '100%', padding: '7px 36px 7px 36px',
                        borderRadius: 8, border: `1.5px solid ${errors.app_id ? '#EF4444' : selected ? selected.color : '#E2E8F0'}`,
                        fontSize: 13, fontFamily: 'inherit', outline: 'none',
                        background: selected ? `${selected.color}0D` : '#fff',
                        color: selected ? selected.color : '#1F2937',
                        fontWeight: 600, cursor: 'pointer', appearance: 'none',
                        transition: 'border-color 0.15s',
                      }}
                    >
                      <option value="">Select app…</option>
                      {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    {/* Left icon */}
                    {selected && (
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                        <MatIcon name={selected.icon} size={15} color={selected.color} />
                      </span>
                    )}
                    {/* Chevron */}
                    <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94A3B8' }}>
                      <MatIcon name="expand_more" size={16} />
                    </span>
                  </div>
                )
              })()}
            </FormField>
          )}

          {/* Subject */}
          <FormField label="Subject" required error={errors.subject} compact>
            <Input value={form.subject} onChange={v => set('subject', v)} placeholder="Brief description of the issue" error={!!errors.subject} />
          </FormField>

          {/* Description */}
          <FormField label="Description" compact>
            <Textarea
              value={form.description}
              onChange={v => set('description', v)}
              placeholder="Detailed description, steps to reproduce, expected behavior…"
              rows={5}
            />
          </FormField>

          {/* Attachments — compact single-line */}
          <FormField label="Attachments" compact>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8,
                  border: '1.5px dashed #CBD5E1', background: '#F8FAFC',
                  color: '#64748B', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#64748B' }}
              >
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
                Attach files
              </button>
              <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileChange} />

              {attachments.map(file => (
                <span key={file.name} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 6,
                  border: '1px solid #E2E8F0', background: '#F8FAFC',
                  fontSize: 12, color: '#374151', maxWidth: 180,
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                  <button onClick={() => setAttachments(a => a.filter(f => f.name !== file.name))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 14, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
                </span>
              ))}
            </div>
          </FormField>
        </div>

        {/* RIGHT: metadata */}
        <div>
          {/* Category */}
          <FormField label="Category" compact>
            <select value={form.category_id} onChange={e => set('category_id', e.target.value)} style={sel}>
              <option value="">Select category…</option>
              {categories.filter(c => c.is_active).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FormField>

          {/* Subcategory */}
          <FormField label="Subcategory" compact>
            <select
              value={form.subcategory_id}
              onChange={e => set('subcategory_id', e.target.value)}
              disabled={!form.category_id || subcategories.length === 0}
              style={{ ...sel, opacity: !form.category_id || subcategories.length === 0 ? 0.45 : 1 }}
            >
              <option value="">None</option>
              {subcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FormField>

          {/* Priority */}
          <FormField label="Priority" compact>
            {/* Compact pill row */}
            <div style={{ display: 'flex', gap: 6 }}>
              {PRIORITIES.map(p => {
                const c = PRIORITY_COLORS[p]
                const active = form.priority === p
                return (
                  <button key={p} onClick={() => set('priority', p)} style={{
                    flex: 1, padding: '4px 6px', borderRadius: 6, cursor: 'pointer',
                    border: `1.5px solid ${active ? c.dot : '#E2E8F0'}`,
                    background: active ? c.bg : '#fff',
                    color: active ? c.text : '#94A3B8',
                    fontSize: 11, fontWeight: active ? 600 : 400,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    transition: 'all 0.12s', whiteSpace: 'nowrap',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? priorityMeta[p].dot : '#D1D5DB', flexShrink: 0, transition: 'background 0.12s' }} />
                    {PRIORITY_LABELS[p]}
                  </button>
                )
              })}
            </div>

            {/* SLA hint */}
            {slaForPriority && (
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94A3B8' }}>
                <span>SLA:</span>
                <span style={{ color: priorityMeta[form.priority].text, fontWeight: 600 }}>{formatHours(slaForPriority.first_response_hrs)} response</span>
                <span>·</span>
                <span style={{ color: priorityMeta[form.priority].text, fontWeight: 600 }}>{formatHours(slaForPriority.resolve_hrs)} resolve</span>
              </div>
            )}
          </FormField>

          {/* Tags (agents only) */}
          {isAgent && (
            <FormField label="Tags" hint="Enter or comma to add" compact>
              <div
                onClick={() => tagInputRef.current?.focus()}
                style={{
                  display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center',
                  minHeight: 38, padding: '5px 9px', borderRadius: 8, border: '1px solid #E2E8F0',
                  background: '#fff', cursor: 'text',
                }}
              >
                {tags.map(tag => (
                  <span key={tag} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 20,
                    background: `${accent}18`, border: `1px solid ${accent}30`, color: accent,
                    fontSize: 11, fontWeight: 600,
                  }}>
                    {tag}
                    <button onClick={e => { e.stopPropagation(); removeTag(tag) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 13, lineHeight: 1, padding: 0, marginLeft: 1 }}>×</button>
                  </span>
                ))}
                <input
                  ref={tagInputRef}
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => { if (tagInput.trim()) addTag(tagInput) }}
                  placeholder={tags.length === 0 ? 'e.g. urgent, billing…' : ''}
                  style={{ border: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', background: 'transparent', color: '#1F2937', minWidth: 80, flex: 1 }}
                />
              </div>
            </FormField>
          )}

          {/* Auto-routing preview */}
          {form.category_id && (
            <div style={{
              padding: '10px 12px', borderRadius: 9, background: '#F8FAFC',
              border: '1px solid #E2E8F0',
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#64748B', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Auto-routing</div>
              {categoryLead ? (
                <div style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth={2.5} strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Will route to <strong style={{ marginLeft: 2 }}>{categoryLead.name}</strong>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  No lead — will be unassigned
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
