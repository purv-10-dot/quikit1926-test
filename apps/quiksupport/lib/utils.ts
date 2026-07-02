import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  )
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function slaStatus(ticket: {
  sla_due_at?: string | null
  status: string
  created_at: string
}): { state: 'ok' | 'at_risk' | 'breached' | 'none'; label: string; pct: number; remainingMs: number } {
  if (!ticket.sla_due_at || ['resolved', 'closed'].includes(ticket.status)) {
    return { state: 'none', label: '—', pct: 0, remainingMs: 0 }
  }

  const due = new Date(ticket.sla_due_at).getTime()
  const created = new Date(ticket.created_at).getTime()
  const now = Date.now()
  const total = due - created
  const elapsed = now - created
  const pct = Math.max(0, Math.min(100, (elapsed / total) * 100))
  const remainingMs = due - now
  const remainingHrs = remainingMs / 3600000

  let state: 'ok' | 'at_risk' | 'breached' = 'ok'
  if (remainingMs < 0) state = 'breached'
  else if (pct > 75) state = 'at_risk'

  let label: string
  if (remainingMs < 0) {
    const h = Math.floor(Math.abs(remainingHrs))
    label = h < 1 ? `Breached ${Math.floor(Math.abs(remainingMs) / 60000)}m ago` : `Breached ${h}h ago`
  } else if (remainingHrs < 1) {
    label = `${Math.floor(remainingMs / 60000)}m left`
  } else if (remainingHrs < 24) {
    label = `${Math.floor(remainingHrs)}h left`
  } else {
    label = `${Math.floor(remainingHrs / 24)}d left`
  }

  return { state, label, pct, remainingMs }
}

export function isOverdue(ticket: { sla_due_at?: string | null; status: string }): boolean {
  if (!ticket.sla_due_at) return false
  if (['resolved', 'closed'].includes(ticket.status)) return false
  return new Date(ticket.sla_due_at) < new Date()
}
