import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { resolveDefaultAppId } from '@/lib/helpdesk-context'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { createTicket } from '@/lib/tickets'
import { successResponse, paginationParams, paginationMeta } from '@/lib/api'
import type { HdTicketStatus, HdTicketPriority } from '@prisma/client'

const CreateTicketSchema = z.object({
  subject: z.string().min(1).max(500),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  category_id: z.string().optional(),
  subcategory_id: z.string().optional(),
  source: z.enum(['portal', 'widget', 'api', 'email']).optional(),
  tags: z.array(z.string()).optional(),
})

export const GET = withHelpdeskAuth(async ({ tenantId, user }, req: NextRequest) => {
  const url = new URL(req.url)
  const { page, limit, skip } = paginationParams(url)

  const filterAppId = url.searchParams.get('app_id') || undefined
  const filterStatus = url.searchParams.get('status') as HdTicketStatus | undefined
  const filterPriority = url.searchParams.get('priority') as HdTicketPriority | undefined
  const filterCategory = url.searchParams.get('category_id') || undefined
  const filterAssignee = url.searchParams.get('assigned_to_id') || undefined
  const filterSla = url.searchParams.get('sla') || undefined
  const search = url.searchParams.get('search') || undefined

  const now = new Date()

  const where: Record<string, unknown> = {
    tenant_id: tenantId,
    ...(filterAppId && { app_id: filterAppId }),
    ...(filterStatus && { status: filterStatus }),
    ...(filterPriority && { priority: filterPriority }),
    ...(filterCategory && { category_id: filterCategory }),
    ...(filterAssignee && { assigned_to_id: filterAssignee }),
    ...(filterSla === 'breached' && {
      sla_due_at: { lt: now },
      status: { notIn: ['resolved', 'closed'] },
    }),
    ...(filterSla === 'at_risk' && {
      sla_due_at: { gte: now },
      status: { notIn: ['resolved', 'closed'] },
    }),
    ...(search && {
      OR: [
        { subject: { contains: search, mode: 'insensitive' } },
        { ticket_number: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    }),
  }

  // Customers see only their tickets
  if (user.role === 'CUSTOMER') {
    where.requester_id = user.id
  }

  const [tickets, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where,
      include: {
        app: { select: { id: true, name: true, code: true, icon: true, color: true, accent: true } },
        category: { select: { id: true, name: true, icon: true } },
        subcategory: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true, email: true, avatar_url: true, color: true } },
        assignee: { select: { id: true, name: true, email: true, avatar_url: true, color: true } },
        _count: { select: { messages: true, attachments: true } },
      },
      orderBy: [{ sla_due_at: 'asc' }, { created_at: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.ticket.count({ where }),
  ])

  return successResponse({
    tickets,
    pagination: paginationMeta(total, page, limit),
  })
})

export const POST = withHelpdeskAuth(async ({ tenantId, user }, req: NextRequest) => {
  const appId = await resolveDefaultAppId(tenantId)

  const body = await req.json()
  const data = CreateTicketSchema.parse(body)

  const ticket = await createTicket({
    tenantId,
    appId,
    requesterId: user.id,
    subject: data.subject,
    description: data.description,
    priority: data.priority as HdTicketPriority,
    categoryId: data.category_id,
    subcategoryId: data.subcategory_id,
    source: (data.source as 'portal' | 'widget' | 'api' | 'email') || 'portal',
    tags: data.tags,
  })

  return successResponse(ticket, 201)
})
