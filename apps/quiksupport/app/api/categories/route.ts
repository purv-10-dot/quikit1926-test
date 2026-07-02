import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/helpdesk-context'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { successResponse, errorResponse } from '@/lib/api'

const SubcategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
})

const AppAssignmentSchema = z.object({
  app_id: z.string(),
  lead_user_id: z.string().optional(),
  agent_ids: z.array(z.string()).optional(),
})

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().optional(),
  description: z.string().optional(),
  subcategories: z.array(SubcategorySchema).optional(),
  app_assignments: z.array(AppAssignmentSchema).optional(),
})

export const GET = withHelpdeskAuth(async ({ tenantId }, req: NextRequest) => {
  const url = new URL(req.url)
  const includeInactive = url.searchParams.get('include_inactive') === 'true'

  const categories = await prisma.category.findMany({
    where: {
      tenant_id: tenantId,
      ...(!includeInactive && { is_active: true }),
    },
    include: {
      subcategories: { orderBy: { sort_order: 'asc' } },
      agents: {
        include: {
          user: { select: { id: true, name: true, email: true, avatar_url: true, color: true, role: true, title: true } },
          app: { select: { id: true, name: true, code: true, icon: true, color: true, accent: true } },
        },
      },
      _count: { select: { tickets: true } },
    },
    orderBy: { sort_order: 'asc' },
  })

  return successResponse(categories)
})

export const POST = withHelpdeskAuth(async ({ tenantId, user }, req: NextRequest) => {
  requireRole(user, 'HELPDESK_ADMIN')

  const body = await req.json()
  const data = CreateCategorySchema.parse(body)

  const existing = await prisma.category.findFirst({
    where: { tenant_id: tenantId, name: { equals: data.name, mode: 'insensitive' } },
  })
  if (existing) return errorResponse('Category name already exists', 409)

  const sortOrder = await prisma.category.count({ where: { tenant_id: tenantId } })

  const category = await prisma.category.create({
    data: {
      tenant_id: tenantId,
      name: data.name,
      icon: data.icon || '📁',
      description: data.description,
      sort_order: sortOrder + 1,
      subcategories: data.subcategories
        ? {
            create: data.subcategories.map((sc, i) => ({
              name: sc.name,
              description: sc.description,
              sort_order: i + 1,
            })),
          }
        : undefined,
      agents: {
        create: (data.app_assignments ?? []).flatMap(a => [
          ...(a.lead_user_id ? [{ tenant_id: tenantId, app_id: a.app_id, user_id: a.lead_user_id, is_lead: true }] : []),
          ...(a.agent_ids ?? []).map(uid => ({ tenant_id: tenantId, app_id: a.app_id, user_id: uid, is_lead: false })),
        ]),
      },
    },
    include: {
      subcategories: true,
      agents: {
        include: {
          user: { select: { id: true, name: true, avatar_url: true, color: true } },
          app: { select: { id: true, name: true, icon: true } },
        },
      },
    },
  })

  return successResponse(category, 201)
})
