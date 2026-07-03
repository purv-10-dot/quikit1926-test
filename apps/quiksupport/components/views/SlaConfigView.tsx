'use client'

import { useState, useEffect } from 'react'
import { useHelpdesk } from '@/components/layout/HelpdeskProvider'
import { MatIcon } from '@/lib/icons'
import type { SlaConfig, TicketPriority } from '@/types'
import { PRIORITY_LABELS, PRIORITY_COLORS } from '@/types'

const PRIORITIES: TicketPriority[] = ['critical', 'high', 'medium', 'low']

interface SlaRow {
  priority: TicketPriority
  first_response_hrs: number
  resolve_hrs: number
  category_id: string | null
  is_active: boolean
}

export function SlaConfigView() {
  const { categories, showToast, tenant, theme } = useHelpdesk()
  const accent = theme.accent || tenant?.accent || '#10B981'
  const [configs, setConfigs] = useState<SlaConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('global')

  useEffect(() => { loadConfigs() }, [])

  async function loadConfigs() {
    setLoading(true)
    try {
      const res = await fetch('/api/sla-config')
      const data = await res.json()
      if (data.success) setConfigs(data.data)
    } catch { showToast('Failed to load SLA config', 'error') }
    setLoading(false)
  }

  const categoryId = selectedCategory === 'global' ? null : selectedCategory

  const rows: SlaRow[] = PRIORITIES.map(priority => {
    const existing = configs.find(c => c.priority === priority && c.category_id === categoryId)
    const globalDefault = configs.find(c => c.priority === priority && c.category_id === null)
    return {
      priority,
      first_response_hrs: existing?.first_response_hrs ?? globalDefault?.first_response_hrs ?? defaultHrs(priority).response,
      resolve_hrs: existing?.resolve_hrs ?? globalDefault?.resolve_hrs ?? defaultHrs(priority).resolve,
      category_id: categoryId,
      is_active: existing?.is_active ?? true,
    }
  })

  function updateRow(priority: TicketPriority, field: 'first_response_hrs' | 'resolve_hrs', value: number) {
    setConfigs(prev => {
      const existing = prev.find(c => c.priority === priority && c.category_id === categoryId)
      if (existing) return prev.map(c => c.priority === priority && c.category_id === categoryId ? { ...c, [field]: value } : c)
      const base = rows.find(r => r.priority === priority)!
      return [...prev, { id: `temp-${priority}`, priority, category_id: categoryId, first_response_hrs: base.first_response_hrs, resolve_hrs: base.resolve_hrs, is_active: true, [field]: value }]
    })
  }

  function toggleActive(priority: TicketPriority) {
    setConfigs(prev => prev.map(c =>
      c.priority === priority && c.category_id === categoryId
        ? { ...c, is_active: !c.is_active }
        : c
    ))
  }

  async function saveConfigs() {
    setSaving(true)
    try {
      const res = await fetch('/api/sla-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configs: rows.map(r => ({
            category_id: r.category_id, priority: r.priority,
            first_response_hrs: r.first_response_hrs, resolve_hrs: r.resolve_hrs, is_active: r.is_active,
          })),
        }),
      })
      const data = await res.json()
      if (data.success) { showToast('SLA config saved'); loadConfigs() }
      else showToast(data.error || 'Failed', 'error')
    } catch { showToast('Failed', 'error') }
    setSaving(false)
  }

  return (
    <div style={{ padding: '24px 28px 32px', overflowY: 'auto', height: '100%' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', margin: 0, letterSpacing: '-0.3px' }}>SLA Rules</h1>
          <p style={{ fontSize: 13, color: '#94A3B8', margin: '4px 0 0' }}>Configure first response and resolution targets per priority</p>
        </div>
        <button onClick={saveConfigs} disabled={saving} style={{
          padding: '9px 22px', borderRadius: 10, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
          background: saving ? '#E2E8F0' : accent, color: saving ? '#94A3B8' : '#fff',
          fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
        }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* Scope tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <ScopeTab active={selectedCategory === 'global'} accent={selectedCategory === 'global' ? accent : undefined} onClick={() => setSelectedCategory('global')}>
          <MatIcon name="public" size={14} style={{ marginRight: 5 }} /> Global Default
        </ScopeTab>
        {categories.map(cat => (
          <ScopeTab key={cat.id} active={selectedCategory === cat.id} accent={selectedCategory === cat.id ? accent : undefined} onClick={() => setSelectedCategory(cat.id)}>
            <MatIcon name={cat.icon} size={14} style={{ marginRight: 5 }} />{cat.name}
          </ScopeTab>
        ))}
      </div>

      {selectedCategory !== 'global' && (
        <div style={{ padding: '10px 16px', borderRadius: 8, background: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: 12, color: '#1D4ED8', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Category-specific rules override global defaults for tickets in this category.
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>Loading…</div>
      ) : (
        <div style={{ background: theme.cardBg, borderRadius: 16, border: `1px solid ${theme.cardBorder}`, overflow: 'hidden', boxShadow: theme.cardShadow }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr 80px', gap: 0, padding: '12px 24px', borderBottom: `2px solid ${theme.cardBorder}`, background: '#F8FAFC' }}>
            {['Priority', 'First Response Target', 'Resolution Target', 'Active'].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {rows.map((row, idx) => {
            const colors = PRIORITY_COLORS[row.priority]
            return (
              <div key={row.priority} style={{
                display: 'grid', gridTemplateColumns: '160px 1fr 1fr 80px', gap: 0,
                padding: '18px 24px', alignItems: 'center',
                borderBottom: idx < rows.length - 1 ? `1px solid ${theme.cardBorder}` : 'none',
                opacity: row.is_active ? 1 : 0.5, transition: 'opacity 0.2s',
              }}>
                {/* Priority badge */}
                <div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 20,
                    background: colors.bg, color: colors.text,
                    fontSize: 12, fontWeight: 700,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.dot }} />
                    {PRIORITY_LABELS[row.priority]}
                  </span>
                </div>

                {/* First response */}
                <div>
                  <HoursInput value={row.first_response_hrs} onChange={v => updateRow(row.priority, 'first_response_hrs', v)} accent={accent} />
                </div>

                {/* Resolution */}
                <div>
                  <HoursInput value={row.resolve_hrs} onChange={v => updateRow(row.priority, 'resolve_hrs', v)} accent={accent} />
                </div>

                {/* Toggle */}
                <div>
                  <button
                    onClick={() => toggleActive(row.priority)}
                    style={{
                      width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: row.is_active ? accent : '#E2E8F0',
                      position: 'relative', transition: 'background 0.25s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 3, left: row.is_active ? 23 : 3,
                      width: 18, height: 18, borderRadius: '50%', background: '#fff',
                      transition: 'left 0.25s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Info card */}
      <div style={{ marginTop: 24, padding: '16px 20px', background: theme.cardBg, borderRadius: 12, border: `1px solid ${theme.cardBorder}` }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>How SLA rules work</div>
        <ul style={{ fontSize: 12, color: '#94A3B8', margin: 0, paddingLeft: 16, lineHeight: 2.2 }}>
          <li>Global rules apply to all tickets unless a category-specific rule exists</li>
          <li>Category-specific rules take priority over global defaults</li>
          <li>SLA timer starts when a ticket is created</li>
          <li>Resolved / closed tickets are excluded from SLA tracking</li>
        </ul>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HoursInput({ value, onChange, accent }: { value: number; onChange: (v: number) => void; accent: string }) {
  const { theme } = useHelpdesk()
  const days = Math.floor(value / 24)
  const hrs = value % 24
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <input
          type="number" min={0} max={999} value={days}
          onChange={e => onChange(Number(e.target.value) * 24 + hrs)}
          style={{
            width: 54, padding: '7px 8px', borderRadius: 8, border: `1.5px solid ${theme.cardBorder}`,
            fontSize: 13, textAlign: 'center', fontFamily: 'inherit', outline: 'none',
            background: theme.cardBg, color: '#374151', transition: 'border-color 0.15s',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = accent }}
          onBlur={e => { e.currentTarget.style.borderColor = theme.cardBorder }}
        />
        <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>d</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <input
          type="number" min={0} max={23} value={hrs}
          onChange={e => onChange(days * 24 + Number(e.target.value))}
          style={{
            width: 54, padding: '7px 8px', borderRadius: 8, border: `1.5px solid ${theme.cardBorder}`,
            fontSize: 13, textAlign: 'center', fontFamily: 'inherit', outline: 'none',
            background: theme.cardBg, color: '#374151', transition: 'border-color 0.15s',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = accent }}
          onBlur={e => { e.currentTarget.style.borderColor = theme.cardBorder }}
        />
        <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>h</span>
      </div>
      <span style={{ fontSize: 11, color: '#CBD5E1' }}>({value}h)</span>
    </div>
  )
}

function ScopeTab({ active, onClick, children, accent }: { active: boolean; onClick: () => void; children: React.ReactNode; accent?: string }) {
  const resolvedAccent = accent || '#6366F1'
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
      border: `1.5px solid ${active ? resolvedAccent : '#E2E8F0'}`,
      background: active ? `${resolvedAccent}15` : '#fff',
      color: active ? resolvedAccent : '#64748B',
      fontSize: 12, fontWeight: active ? 700 : 500, transition: 'all 0.15s',
    }}>
      {children}
    </button>
  )
}

function defaultHrs(priority: TicketPriority) {
  const map: Record<TicketPriority, { response: number; resolve: number }> = {
    critical: { response: 1, resolve: 4 },
    high: { response: 4, resolve: 24 },
    medium: { response: 8, resolve: 48 },
    low: { response: 24, resolve: 120 },
  }
  return map[priority]
}
