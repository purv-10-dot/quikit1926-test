import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/helpdesk-context'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { successResponse, errorResponse } from '@/lib/api'

const CreateAppSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/),
  icon: z.string().optional(),
  color: z.string().optional(),
  accent: z.string().optional(),
})

export const GET = withHelpdeskAuth(async ({ tenantId }) => {
  const apps = await prisma.app.findMany({
    where: { tenant_id: tenantId, is_active: true },
    orderBy: { name: 'asc' },
  })

  return successResponse(apps)
})

export const POST = withHelpdeskAuth(async ({ tenantId, user }, req: NextRequest) => {
  requireRole(user, 'HELPDESK_ADMIN')

  const body = await req.json()
  const data = CreateAppSchema.parse(body)

  const existing = await prisma.app.findFirst({
    where: { tenant_id: tenantId, code: data.code },
  })
  if (existing) return errorResponse('App code already exists', 409)

  const app = await prisma.app.create({
    data: {
      tenant_id: tenantId,
      name: data.name,
      code: data.code,
      icon: data.icon || '📦',
      color: data.color || '#6366F1',
      accent: data.accent || '#EEF2FF',
    },
  })

  return successResponse(app, 201)
})
