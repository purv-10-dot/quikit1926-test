/**
 * GET  /api/roles  — list helpdesk (Hd*) roles available to the requesting org
 * POST /api/roles  — create a custom tenant role
 *
 * These manage the helpdesk's own domain RBAC (HdRole/HdPermission). The
 * standard QuikIT per-app RBAC (Qsp* AppRole — what the admin portal reads) is
 * managed under /api/org/roles*.
 *
 * Both endpoints require HELPDESK_ADMIN.
 * GET returns system roles (tenant_id = null) + this org's own custom roles.
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/helpdesk-context'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { successResponse, errorResponse } from '@/lib/api'
import { auditRbac } from '@/lib/rbac'

const CreateRoleSchema = z.object({
  name:        z.string().min(1).max(80),
  description: z.string().max(300).optional(),
})

// ─── GET /api/roles ───────────────────────────────────────────────────────────

export const GET = withHelpdeskAuth(async ({ tenantId }) => {
  const roles = await prisma.role.findMany({
    where: {
      OR: [
        { is_system: true,  tenant_id: null },      // system roles: available to all tenants
        { is_system: false, tenant_id: tenantId },  // this tenant's custom roles
      ],
      is_active: true,
    },
    include: {
      role_permissions: {
        include: {
          permission: { select: { id: true, key: true, name: true, resource: true, action: true } },
        },
      },
      _count: { select: { user_mappings: true } },
    },
    orderBy: [{ is_system: 'desc' }, { name: 'asc' }],
  })

  return successResponse(roles)
})

// ─── POST /api/roles ──────────────────────────────────────────────────────────

export const POST = withHelpdeskAuth(async ({ tenantId, userId, user }, req: NextRequest) => {
  requireRole(user, 'HELPDESK_ADMIN')

  const body = await req.json()
  const data = CreateRoleSchema.parse(body)

  // Reject collisions with system role names
  const systemConflict = await prisma.role.findFirst({
    where: { name: { equals: data.name, mode: 'insensitive' }, is_system: true },
  })
  if (systemConflict) {
    return errorResponse(`'${data.name}' is a reserved system role name`, 409)
  }

  // Reject tenant duplicate
  const tenantConflict = await prisma.role.findFirst({
    where: { name: { equals: data.name, mode: 'insensitive' }, tenant_id: tenantId },
  })
  if (tenantConflict) {
    return errorResponse(`A role named '${data.name}' already exists for this tenant`, 409)
  }

  const role = await prisma.role.create({
    data: {
      tenant_id:   tenantId,
      name:        data.name,
      description: data.description,
      is_system:   false,
      is_active:   true,
    },
  })

  await auditRbac({
    tenantId,
    actorExternalId: userId,
    entity: 'role',
    entityId: role.id,
    action: 'role.created',
    changes: { name: role.name, description: role.description },
  })

  return successResponse(role, 201)
})
