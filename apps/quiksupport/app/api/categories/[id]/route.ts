import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/helpdesk-context'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { successResponse, errorResponse } from '@/lib/api'

const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
  subcategories: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
  })).optional(),
  app_assignments: z.array(z.object({
    app_id: z.string(),
    lead_user_id: z.string().optional(),
    agent_ids: z.array(z.string()).optional(),
  })).optional(),
})

export const GET = withHelpdeskAuth<{ id: string }>(async ({ tenantId }, _req, { params }) => {
  const { id } = params

  const category = await prisma.category.findFirst({
    where: { id, tenant_id: tenantId },
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
  })

  if (!category) return errorResponse('Category not found', 404)

  return successResponse(category)
})

export const PATCH = withHelpdeskAuth<{ id: string }>(async ({ tenantId, user }, req: NextRequest, { params }) => {
  const { id } = params
  requireRole(user, 'HELPDESK_ADMIN')

  const category = await prisma.category.findFirst({ where: { id, tenant_id: tenantId } })
  if (!category) return errorResponse('Category not found', 404)

  const body = await req.json()
  const data = UpdateCategorySchema.parse(body)

  await prisma.$transaction(async (tx) => {
    // Update base fields
    await tx.hdCategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.is_active !== undefined && { is_active: data.is_active }),
      },
    })

    // Replace subcategories if provided
    if (data.subcategories !== undefined) {
      await tx.hdSubcategory.deleteMany({ where: { category_id: id } })
      await tx.hdSubcategory.createMany({
        data: data.subcategories.map((sc, i) => ({
          category_id: id,
          name: sc.name,
          description: sc.description,
          sort_order: i + 1,
        })),
      })
    }

    // Replace agent/lead assignments if provided
    if (data.app_assignments !== undefined) {
      await tx.hdCategoryAgent.deleteMany({ where: { category_id: id } })

      const rows = (data.app_assignments).flatMap(a => [
        ...(a.lead_user_id ? [{ category_id: id, tenant_id: tenantId, app_id: a.app_id, user_id: a.lead_user_id, is_lead: true }] : []),
        ...(a.agent_ids ?? []).map(uid => ({ category_id: id, tenant_id: tenantId, app_id: a.app_id, user_id: uid, is_lead: false })),
      ])

      if (rows.length > 0) {
        await tx.hdCategoryAgent.createMany({ data: rows })
      }
    }
  })

  const updated = await prisma.category.findFirst({
    where: { id },
    include: {
      subcategories: { orderBy: { sort_order: 'asc' } },
      agents: {
        include: {
          user: { select: { id: true, name: true, avatar_url: true, color: true, role: true, title: true } },
          app: { select: { id: true, name: true, icon: true } },
        },
      },
    },
  })

  return successResponse(updated)
})

export const DELETE = withHelpdeskAuth<{ id: string }>(async ({ tenantId, user }, _req, { params }) => {
  const { id } = params
  requireRole(user, 'HELPDESK_ADMIN')

  const category = await prisma.category.findFirst({ where: { id, tenant_id: tenantId } })
  if (!category) return errorResponse('Category not found', 404)

  // Soft-delete: mark inactive instead of deleting
  await prisma.category.update({ where: { id }, data: { is_active: false } })

  return successResponse({ deactivated: true })
})
