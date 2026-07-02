/**
 * GET    /api/roles/[id]/permissions  — list permissions assigned to a role
 * POST   /api/roles/[id]/permissions  — assign permissions to a role (idempotent)
 * DELETE /api/roles/[id]/permissions  — revoke permissions from a role
 *
 * Requires HELPDESK_ADMIN.
 * System roles' permissions can be viewed but not modified via the API.
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/helpdesk-context'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { successResponse, errorResponse } from '@/lib/api'
import { auditRbac } from '@/lib/rbac'

const PermissionKeysSchema = z.object({
  permission_ids: z.array(z.string()).min(1),
})

// ─── GET /api/roles/[id]/permissions ─────────────────────────────────────────

export const GET = withHelpdeskAuth<{ id: string }>(async ({ tenantId }, _req, { params }) => {
  const { id } = params

  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      role_permissions: {
        include: { permission: true },
        orderBy: [{ permission: { resource: 'asc' } }],
      },
    },
  })
  if (!role) return errorResponse('Role not found', 404)

  // Tenant isolation: only system roles or own tenant roles are visible
  if (!role.is_system && role.tenant_id !== tenantId) {
    return errorResponse('Role not found', 404)
  }

  return successResponse(role.role_permissions.map(rp => rp.permission))
})

// ─── POST /api/roles/[id]/permissions — assign ─────────────────────────────

export const POST = withHelpdeskAuth<{ id: string }>(async ({ tenantId, userId, user }, req: NextRequest, { params }) => {
  const { id } = params
  requireRole(user, 'HELPDESK_ADMIN')

  const role = await prisma.role.findUnique({ where: { id } })
  if (!role) return errorResponse('Role not found', 404)
  if (role.is_system) return errorResponse('System role permissions are managed via seed only', 403)
  if (role.tenant_id !== tenantId) return errorResponse('Role not found', 404)

  const body = await req.json()
  const { permission_ids } = PermissionKeysSchema.parse(body)

  // Verify all permission IDs exist
  const perms = await prisma.permission.findMany({ where: { id: { in: permission_ids } } })
  if (perms.length !== permission_ids.length) {
    return errorResponse('One or more permission IDs are invalid', 422)
  }

  // Idempotent upsert: createMany with skipDuplicates
  await prisma.rolePermission.createMany({
    data: permission_ids.map(permission_id => ({
      role_id: id,
      permission_id,
      granted_by: userId,
    })),
    skipDuplicates: true,
  })

  await auditRbac({
    tenantId,
    actorExternalId: userId,
    entity: 'permission',
    entityId: id,
    action: 'permission.granted',
    changes: { permission_ids, role: role.name },
  })

  // Return updated full list
  const updated = await prisma.rolePermission.findMany({
    where: { role_id: id },
    include: { permission: true },
  })
  return successResponse(updated.map(rp => rp.permission))
})

// ─── DELETE /api/roles/[id]/permissions — revoke ───────────────────────────

export const DELETE = withHelpdeskAuth<{ id: string }>(async ({ tenantId, userId, user }, req: NextRequest, { params }) => {
  const { id } = params
  requireRole(user, 'HELPDESK_ADMIN')

  const role = await prisma.role.findUnique({ where: { id } })
  if (!role) return errorResponse('Role not found', 404)
  if (role.is_system) return errorResponse('System role permissions are managed via seed only', 403)
  if (role.tenant_id !== tenantId) return errorResponse('Role not found', 404)

  const body = await req.json()
  const { permission_ids } = PermissionKeysSchema.parse(body)

  await prisma.rolePermission.deleteMany({
    where: { role_id: id, permission_id: { in: permission_ids } },
  })

  await auditRbac({
    tenantId,
    actorExternalId: userId,
    entity: 'permission',
    entityId: id,
    action: 'permission.revoked',
    changes: { permission_ids, role: role.name },
  })

  const remaining = await prisma.rolePermission.findMany({
    where: { role_id: id },
    include: { permission: true },
  })
  return successResponse(remaining.map(rp => rp.permission))
})
