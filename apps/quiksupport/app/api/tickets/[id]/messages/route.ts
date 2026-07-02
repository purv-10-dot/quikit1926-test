import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { isAgentOrAbove } from '@/lib/helpdesk-context'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { successResponse, errorResponse } from '@/lib/api'
import { notifyTicketEvent } from '@/lib/tickets'

const AddMessageSchema = z.object({
  body: z.string().min(1),
  message_type: z.enum(['customer_reply', 'agent_reply', 'internal_note']),
  is_internal: z.boolean().optional(),
})

export const GET = withHelpdeskAuth<{ id: string }>(async ({ tenantId, user }, _req, { params }) => {
  const { id } = params

  const ticket = await prisma.ticket.findFirst({ where: { id, tenant_id: tenantId } })
  if (!ticket) return errorResponse('Ticket not found', 404)

  if (user.role === 'CUSTOMER' && ticket.requester_id !== user.id) {
    return errorResponse('Access denied', 403)
  }

  const messages = await prisma.message.findMany({
    where: {
      ticket_id: id,
      ...(user.role === 'CUSTOMER' ? { is_internal: false } : {}),
    },
    include: {
      sender: { select: { id: true, name: true, avatar_url: true, color: true, role: true, title: true } },
    },
    orderBy: { created_at: 'asc' },
  })

  return successResponse(messages)
})

export const POST = withHelpdeskAuth<{ id: string }>(async ({ tenantId, user }, req: NextRequest, { params }) => {
  const { id } = params

  const ticket = await prisma.ticket.findFirst({ where: { id, tenant_id: tenantId } })
  if (!ticket) return errorResponse('Ticket not found', 404)

  if (user.role === 'CUSTOMER' && ticket.requester_id !== user.id) {
    return errorResponse('Access denied', 403)
  }

  if (ticket.status === 'closed') {
    return errorResponse('Cannot reply to a closed ticket', 400)
  }

  const body = await req.json()
  const data = AddMessageSchema.parse(body)

  // Customers can only send customer_reply
  const messageType =
    user.role === 'CUSTOMER' ? 'customer_reply' : data.message_type
  const isInternal =
    user.role === 'CUSTOMER' ? false : (data.is_internal ?? messageType === 'internal_note')

  const message = await prisma.message.create({
    data: {
      ticket_id: id,
      sender_id: user.id,
      body: data.body,
      message_type: messageType,
      is_internal: isInternal,
    },
    include: {
      sender: { select: { id: true, name: true, avatar_url: true, color: true, role: true } },
    },
  })

  // Record first response time for agents
  if (!isInternal && isAgentOrAbove(user) && !ticket.first_response_at) {
    await prisma.ticket.update({
      where: { id },
      data: { first_response_at: new Date() },
    })
  }

  // Fire-and-forget — never let a Redis error block the response
  if (!isInternal) {
    notifyTicketEvent('new_message', id, tenantId, {
      senderId: user.id,
      messageId: message.id,
    }).catch(() => {})
  }

  return successResponse(message, 201)
})
