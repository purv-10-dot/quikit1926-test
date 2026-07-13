import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { isAgentOrAbove, requireRole } from '@/lib/helpdesk-context'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { successResponse, errorResponse } from '@/lib/api'
import { notifyTicketEvent } from '@/lib/tickets'
import { computeSlaDueAt } from '@/lib/sla'
import type { HdTicketStatus, HdTicketPriority } from '@prisma/client'

const UpdateTicketSchema = z.object({
  status: z.enum(['open', 'in_progress', 'waiting_customer', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assigned_to_id: z.string().nullable().optional(),
  category_id: z.string().nullable().optional(),
  subcategory_id: z.string().nullable().optional(),
  subject: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status_note: z.string().optional(),
})

export const GET = withHelpdeskAuth<{ id: string }>(async ({ tenantId, user }, _req, { params }) => {
  const { id } = params

  const ticket = await prisma.ticket.findFirst({
    where: { id, tenant_id: tenantId },
    include: {
      app: true,
      category: { include: { subcategories: true } },
      subcategory: true,
      requester: { select: { id: true, name: true, email: true, avatar_url: true, color: true, role: true } },
      assignee: { select: { id: true, name: true, email: true, avatar_url: true, color: true, role: true, title: true } },
      messages: {
        include: {
          sender: { select: { id: true, name: true, avatar_url: true, color: true, role: true } },
        },
        orderBy: { created_at: 'asc' },
      },
      attachments: {
        include: {
          uploader: { select: { id: true, name: true } },
        },
      },
      status_history: {
        include: {
          changed_by: { select: { id: true, name: true } },
        },
        orderBy: { changed_at: 'asc' },
      },
    },
  })

  if (!ticket) return errorResponse('Ticket not found', 404)

  // Customers can only view their own tickets
  if (user.role === 'CUSTOMER' && ticket.requester_id !== user.id) {
    return errorResponse('Access denied', 403)
  }

  // Filter internal messages for customers
  if (user.role === 'CUSTOMER') {
    ticket.messages = ticket.messages.filter((m: { is_internal: boolean }) => !m.is_internal)
  }

  return successResponse(ticket)
})

export const PATCH = withHelpdeskAuth<{ id: string }>(async ({ tenantId, user }, req: NextRequest, { params }) => {
  const { id } = params

  if (!isAgentOrAbove(user)) {
    return errorResponse('Only agents and admins can update tickets', 403)
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id, tenant_id: tenantId },
  })
  if (!ticket) return errorResponse('Ticket not found', 404)

  const body = await req.json()
  const data = UpdateTicketSchema.parse(body)

  const updates: Record<string, unknown> = {}
  const now = new Date()

  if (data.status && data.status !== ticket.status) {
    updates.status = data.status
    if (data.status === 'resolved') updates.resolved_at = now
    if (data.status === 'closed') updates.closed_at = now

    // Create status history entry
    await prisma.statusHistory.create({
      data: {
        ticket_id: id,
        changed_by_id: user.id,
        from_status: ticket.status,
        to_status: data.status as HdTicketStatus,
        note: data.status_note,
      },
    })

    notifyTicketEvent('status_changed', id, tenantId, {
      fromStatus: ticket.status,
      toStatus: data.status,
      changedById: user.id,
      note: data.status_note,
    }).catch(() => {})
  }

  if (data.assigned_to_id !== undefined && data.assigned_to_id !== ticket.assigned_to_id) {
    updates.assigned_to_id = data.assigned_to_id

    if (data.assigned_to_id) {
      if (!ticket.first_response_at) {
        updates.first_response_at = now
      }
      notifyTicketEvent('ticket_assigned', id, tenantId, {
        assigneeId: data.assigned_to_id,
        assignedById: user.id,
      }).catch(() => {})
    }
  }

  if (data.priority && data.priority !== ticket.priority) {
    updates.priority = data.priority
    // Recompute SLA
    updates.sla_due_at = await computeSlaDueAt(
      tenantId,
      data.priority as HdTicketPriority,
      (data.category_id !== undefined ? data.category_id : ticket.category_id),
      ticket.created_at
    )
  }

  if (data.subject !== undefined) updates.subject = data.subject
  if (data.description !== undefined) updates.description = data.description
  if (data.category_id !== undefined) updates.category_id = data.category_id
  if (data.subcategory_id !== undefined) updates.subcategory_id = data.subcategory_id
  if (data.tags !== undefined) updates.tags = data.tags

  const updated = await prisma.ticket.update({
    where: { id },
    data: updates,
    include: {
      app: { select: { id: true, name: true, icon: true, color: true, accent: true } },
      category: { select: { id: true, name: true, icon: true } },
      subcategory: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true, email: true, avatar_url: true, color: true } },
      assignee: { select: { id: true, name: true, email: true, avatar_url: true, color: true, title: true } },
    },
  })

  return successResponse(updated)
})

export const DELETE = withHelpdeskAuth<{ id: string }>(async ({ tenantId, user }, _req, { params }) => {
  const { id } = params
  requireRole(user, 'HELPDESK_ADMIN')

  const ticket = await prisma.ticket.findFirst({ where: { id, tenant_id: tenantId } })
  if (!ticket) return errorResponse('Ticket not found', 404)

  await prisma.ticket.delete({ where: { id } })

  return successResponse({ deleted: true })
})
