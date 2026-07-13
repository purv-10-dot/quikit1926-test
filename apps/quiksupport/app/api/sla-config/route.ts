import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/helpdesk-context'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { successResponse } from '@/lib/api'

const SlaConfigSchema = z.object({
  category_id: z.string().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  first_response_hrs: z.number().positive(),
  resolve_hrs: z.number().positive(),
  is_active: z.boolean().optional(),
})

const BulkUpsertSchema = z.object({
  configs: z.array(SlaConfigSchema),
})

export const GET = withHelpdeskAuth(async ({ tenantId }, req: NextRequest) => {
  const url = new URL(req.url)
  const categoryId = url.searchParams.get('category_id')

  const configs = await prisma.slaConfig.findMany({
    where: {
      tenant_id: tenantId,
      ...(categoryId !== null ? { category_id: categoryId || null } : {}),
    },
    include: {
      category: { select: { id: true, name: true, icon: true } },
    },
    orderBy: [{ category_id: 'asc' }, { priority: 'asc' }],
  })

  return successResponse(configs)
})

export const POST = withHelpdeskAuth(async ({ tenantId, user }, req: NextRequest) => {
  requireRole(user, 'HELPDESK_ADMIN')

  const body = await req.json()

  // Support both single and bulk upsert.
  //
  // WHY findFirst + update/create instead of upsert:
  //   category_id is nullable, and Prisma's compound-unique where accessor
  //   types category_id as `string` (non-nullable) because SQL NULL != NULL
  //   makes NULL-keyed upserts unreliable. We use findFirst (which correctly
  //   matches IS NULL) then branch on whether the row exists.
  if (Array.isArray(body.configs)) {
    const { configs } = BulkUpsertSchema.parse(body)

    const results = await prisma.$transaction(async (tx) => {
      return Promise.all(
        configs.map(async (cfg) => {
          const categoryId = cfg.category_id || null
          const existing = await tx.hdSlaConfig.findFirst({
            where: { tenant_id: tenantId, category_id: categoryId, priority: cfg.priority },
          })
          if (existing) {
            return tx.hdSlaConfig.update({
              where: { id: existing.id },
              data: {
                first_response_hrs: cfg.first_response_hrs,
                resolve_hrs: cfg.resolve_hrs,
                is_active: cfg.is_active ?? true,
              },
            })
          }
          return tx.hdSlaConfig.create({
            data: {
              tenant_id: tenantId,
              category_id: categoryId,
              priority: cfg.priority,
              first_response_hrs: cfg.first_response_hrs,
              resolve_hrs: cfg.resolve_hrs,
              is_active: cfg.is_active ?? true,
            },
          })
        })
      )
    })

    return successResponse(results)
  }

  const data = SlaConfigSchema.parse(body)
  const categoryId = data.category_id || null

  const existing = await prisma.slaConfig.findFirst({
    where: { tenant_id: tenantId, category_id: categoryId, priority: data.priority },
  })

  const config = existing
    ? await prisma.slaConfig.update({
        where: { id: existing.id },
        data: {
          first_response_hrs: data.first_response_hrs,
          resolve_hrs: data.resolve_hrs,
          is_active: data.is_active ?? true,
        },
      })
    : await prisma.slaConfig.create({
        data: {
          tenant_id: tenantId,
          category_id: categoryId,
          priority: data.priority,
          first_response_hrs: data.first_response_hrs,
          resolve_hrs: data.resolve_hrs,
          is_active: data.is_active ?? true,
        },
      })

  return successResponse(config)
})
