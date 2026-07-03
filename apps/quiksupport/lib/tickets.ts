import { prisma } from './db'
import type { HdTicketPriority, HdTicketSource } from '@prisma/client'
import { computeSlaDueAt } from './sla'
import { queueEmail } from './email'
import { enqueueJob, NOTIFICATION_QUEUE } from './redis'

export async function generateTicketNumber(
  tenantId: string,
  appId: string
): Promise<string> {
  const app = await prisma.app.findUnique({ where: { id: appId } })
  const prefix = (app?.code || 'GEN').toUpperCase()
  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`

  const count = await prisma.ticket.count({
    where: { tenant_id: tenantId, app_id: appId },
  })

  const seq = String(count + 1).padStart(4, '0')
  return `${prefix}-${ym}-${seq}`
}

export async function getCategoryLead(
  categoryId: string,
  appId: string
): Promise<string | null> {
  const entry = await prisma.categoryAgent.findFirst({
    where: { category_id: categoryId, app_id: appId, is_lead: true },
  })
  return entry?.user_id || null
}

export interface CreateTicketInput {
  tenantId: string
  appId: string
  requesterId: string
  subject: string
  description?: string
  priority: HdTicketPriority
  categoryId?: string
  subcategoryId?: string
  source?: HdTicketSource
  tags?: string[]
}

export async function createTicket(input: CreateTicketInput) {
  const ticketNumber = await generateTicketNumber(input.tenantId, input.appId)
  const slaDueAt = await computeSlaDueAt(
    input.tenantId,
    input.priority,
    input.categoryId
  )

  const assignedToId = input.categoryId
    ? await getCategoryLead(input.categoryId, input.appId)
    : null

  const ticket = await prisma.ticket.create({
    data: {
      ticket_number: ticketNumber,
      tenant_id: input.tenantId,
      app_id: input.appId,
      requester_id: input.requesterId,
      assigned_to_id: assignedToId,
      subject: input.subject,
      description: input.description,
      priority: input.priority,
      category_id: input.categoryId,
      subcategory_id: input.subcategoryId,
      source: input.source || 'portal',
      tags: input.tags || [],
      sla_due_at: slaDueAt,
      status_history: {
        create: {
          changed_by_id: input.requesterId,
          from_status: null,
          to_status: 'open',
        },
      },
      messages: input.description
        ? {
            create: {
              sender_id: input.requesterId,
              body: input.description,
              message_type: 'customer_reply',
              is_internal: false,
            },
          }
        : undefined,
    },
    include: {
      requester: true,
      assignee: true,
      category: true,
      app: true,
    },
  })

  // Fire-and-forget — Redis errors must not block ticket creation
  enqueueJob(NOTIFICATION_QUEUE, {
    type: 'ticket_created',
    ticketId: ticket.id,
    tenantId: input.tenantId,
  }).catch(() => {})

  return ticket
}

export async function notifyTicketEvent(
  type: string,
  ticketId: string,
  tenantId: string,
  extra?: Record<string, unknown>
) {
  // Best-effort — callers should .catch(() => {}) this
  await enqueueJob(NOTIFICATION_QUEUE, { type, ticketId, tenantId, ...extra })
}

// Serialize ticket for API response (converts dates to ISO strings)
export function serializeTicket(ticket: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(ticket)) {
    if (value instanceof Date) {
      result[key] = value.toISOString()
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = serializeTicket(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}
