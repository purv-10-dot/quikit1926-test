import { prisma } from './db'
import type { HdTicketPriority } from '@prisma/client'

export interface SlaTarget {
  firstResponseHrs: number
  resolveHrs: number
}

const DEFAULT_SLA: Record<HdTicketPriority, SlaTarget> = {
  critical: { firstResponseHrs: 1,  resolveHrs: 4   },
  high:     { firstResponseHrs: 4,  resolveHrs: 24  },
  medium:   { firstResponseHrs: 8,  resolveHrs: 72  },
  low:      { firstResponseHrs: 24, resolveHrs: 168 },
}

export async function getSlaTarget(
  tenantId: string,
  priority: HdTicketPriority,
  categoryId?: string | null
): Promise<SlaTarget> {
  // Try category-specific first, then global, then hardcoded default
  const configs = await prisma.slaConfig.findMany({
    where: {
      tenant_id: tenantId,
      priority,
      is_active: true,
      OR: [
        { category_id: categoryId || null },
        { category_id: null },
      ],
    },
    orderBy: { category_id: 'desc' }, // category-specific sorts before null
  })

  if (configs.length > 0) {
    const cfg = configs[0]
    return {
      firstResponseHrs: cfg.first_response_hrs,
      resolveHrs: cfg.resolve_hrs,
    }
  }

  return DEFAULT_SLA[priority] || DEFAULT_SLA.medium
}

export async function computeSlaDueAt(
  tenantId: string,
  priority: HdTicketPriority,
  categoryId?: string | null,
  createdAt: Date = new Date()
): Promise<Date> {
  const sla = await getSlaTarget(tenantId, priority, categoryId)
  return new Date(createdAt.getTime() + sla.resolveHrs * 3600 * 1000)
}

export function slaStatusFromTicket(ticket: {
  sla_due_at: Date | null
  status: string
  created_at: Date
}): { state: 'ok' | 'at_risk' | 'breached' | 'none'; label: string; pct: number; remainingMs: number } {
  if (!ticket.sla_due_at || ['resolved', 'closed'].includes(ticket.status)) {
    return { state: 'none', label: '—', pct: 0, remainingMs: 0 }
  }

  const due = ticket.sla_due_at.getTime()
  const created = ticket.created_at.getTime()
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

export function formatDuration(ms: number): string {
  const totalMinutes = Math.abs(Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  if (hours < 24) return `${hours}h ${minutes > 0 ? minutes + 'm' : ''}`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return `${days}d ${remHours > 0 ? remHours + 'h' : ''}`
}
