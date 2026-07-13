import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { successResponse, errorResponse } from '@/lib/api'

const UpsertUserSchema = z.object({
  external_id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['HELPDESK_ADMIN', 'CATEGORY_LEAD', 'AGENT', 'CUSTOMER']).optional(),
  title: z.string().optional(),
  avatar_url: z.string().optional(),
  color: z.string().optional(),
})

const BulkSyncSchema = z.object({
  users: z.array(UpsertUserSchema),
})

export const GET = withHelpdeskAuth(async ({ tenantId }, req: NextRequest) => {
  const url = new URL(req.url)
  const role = url.searchParams.get('role') || undefined
  const search = url.searchParams.get('search') || undefined

  const users = await prisma.user.findMany({
    where: {
      tenant_id: tenantId,
      is_active: true,
      ...(role && { role: role as 'HELPDESK_ADMIN' | 'CATEGORY_LEAD' | 'AGENT' | 'CUSTOMER' }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    },
    select: {
      id: true,
      external_id: true,
      name: true,
      email: true,
      role: true,
      title: true,
      avatar_url: true,
      color: true,
      created_at: true,
    },
    orderBy: { name: 'asc' },
  })

  return successResponse(users)
})

// Sync users from source apps (bulk upsert)
export const POST = withHelpdeskAuth(async ({ tenantId, user }, req: NextRequest) => {
  // Allow both HELPDESK_ADMIN and service-to-service calls
  if (user.role !== 'HELPDESK_ADMIN' && req.headers.get('x-service-key') !== process.env.APP_SECRET) {
    return errorResponse('Only admins can sync users', 403)
  }

  const body = await req.json()

  // Support both single upsert and bulk sync
  if (body.users) {
    const { users } = BulkSyncSchema.parse(body)

    const results = await prisma.$transaction(
      users.map(u =>
        prisma.user.upsert({
          where: {
            tenant_id_external_id: {
              tenant_id: tenantId,
              external_id: u.external_id,
            },
          },
          create: {
            tenant_id: tenantId,
            external_id: u.external_id,
            name: u.name,
            email: u.email,
            role: u.role || 'CUSTOMER',
            title: u.title,
            avatar_url: u.avatar_url,
            color: u.color || '#6366F1',
          },
          update: {
            name: u.name,
            email: u.email,
            ...(u.role && { role: u.role }),
            ...(u.title !== undefined && { title: u.title }),
            ...(u.avatar_url !== undefined && { avatar_url: u.avatar_url }),
          },
        })
      )
    )

    return successResponse({ synced: results.length })
  }

  // Single upsert
  const data = UpsertUserSchema.parse(body)

  const result = await prisma.user.upsert({
    where: {
      tenant_id_external_id: {
        tenant_id: tenantId,
        external_id: data.external_id,
      },
    },
    create: {
      tenant_id: tenantId,
      external_id: data.external_id,
      name: data.name,
      email: data.email,
      role: data.role || 'CUSTOMER',
      title: data.title,
      avatar_url: data.avatar_url,
      color: data.color || '#6366F1',
    },
    update: {
      name: data.name,
      email: data.email,
      ...(data.role && { role: data.role }),
      ...(data.title !== undefined && { title: data.title }),
    },
  })

  return successResponse(result)
})
