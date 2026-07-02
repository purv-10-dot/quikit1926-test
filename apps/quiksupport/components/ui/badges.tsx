'use client'

import { slaStatus } from '@/lib/utils'
import { STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from '@/types'
import type { TicketStatus, TicketPriority, Ticket } from '@/types'
import { MatIcon } from '@/lib/icons'

export function StatusBadge({ status }: { status: TicketStatus }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.open
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20,
      background: c.bg, color: c.text,
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot }} />
      {STATUS_LABELS[status]}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const c = PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium
  const icons: Record<TicketPriority, string> = { critical: 'bolt', high: 'arrow_upward', medium: 'remove', low: 'arrow_downward' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20,
      background: c.bg, color: c.text,
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      <MatIcon name={icons[priority]} size={12} color={c.text} />
      {PRIORITY_LABELS[priority]}
    </span>
  )
}

export function SLAPill({ ticket, size = 'md' }: { ticket: Partial<Ticket> & { sla_due_at?: string | null; status: string; created_at: string }; size?: 'sm' | 'md' }) {
  const s = slaStatus(ticket)
  if (s.state === 'none') return null

  const colors = {
    ok:       { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', dot: '#22C55E', icon: 'check_circle' },
    at_risk:  { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', dot: '#F59E0B', icon: 'schedule' },
    breached: { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626', dot: '#EF4444', icon: 'warning' },
  }
  const c = colors[s.state]

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: size === 'sm' ? '2px 8px' : '3px 10px',
      borderRadius: 20, background: c.bg, border: `1px solid ${c.border}`,
      color: c.text, fontSize: size === 'sm' ? 10 : 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      <MatIcon name={c.icon} size={size === 'sm' ? 11 : 13} color={c.text} />
      {s.label}
    </span>
  )
}

export function SLABar({ ticket, showLabel = true }: { ticket: Partial<Ticket> & { sla_due_at?: string | null; status: string; created_at: string }; showLabel?: boolean }) {
  const s = slaStatus(ticket)
  if (s.state === 'none') return null

  const colors = { ok: '#22C55E', at_risk: '#F59E0B', breached: '#EF4444' }
  const bgColor = colors[s.state]

  return (
    <div>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>SLA</span>
          <span style={{ fontSize: 11, color: bgColor, fontWeight: 700 }}>{s.label}</span>
        </div>
      )}
      <div style={{ height: 4, background: '#F1F5F9', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, s.pct)}%`,
          background: `linear-gradient(90deg, ${bgColor}88, ${bgColor})`,
          borderRadius: 2,
          transition: 'width 0.5s',
        }} />
      </div>
    </div>
  )
}

export function AppChip({ app, small, showName = true }: {
  app: { name: string; icon: string; color: string; accent: string }
  small?: boolean
  showName?: boolean
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: small ? '2px 8px' : '4px 10px', borderRadius: 6,
      background: app.accent, color: app.color,
      fontSize: small ? 10 : 11, fontWeight: 700,
      border: `1px solid ${app.color}33`,
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      <MatIcon name={app.icon} size={small ? 12 : 14} color={app.color} />
      {showName && app.name}
    </span>
  )
}
