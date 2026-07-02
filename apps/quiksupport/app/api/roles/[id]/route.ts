/**
 * PATCH  /api/roles/[id]  — update a tenant custom role (name / description / active)
 * DELETE /api/roles/[id]  — soft-delete a tenant custom role (sets is_active = false)
 *
 * System roles cannot be modified or deleted via the API.
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/helpdesk-context'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { successResponse, errorResponse } from '@/lib/api'
import { auditRbac } from '@/lib/rbac'

const PatchRoleSchema = z.object({
  name:        z.string().min(1).max(80).optional(),
  description: z.string().max(300).optional(),
  is_active:   z.boolean().optional(),
})

// ─── PATCH /api/roles/[id] ────────────────────────────────────────────────────

export const PATCH = withHelpdeskAuth<{ id: string }>(async ({ tenantId, userId, user }, req: NextRequest, { params }) => {
  const { id } = params
  requireRole(user, 'HELPDESK_ADMIN')

  const role = await prisma.role.findUnique({ where: { id } })
  if (!role) return errorResponse('Role not found', 404)
  if (role.is_system) return errorResponse('System roles cannot be modified', 403)
  if (role.tenant_id !== tenantId) return errorResponse('Role does not belong to this tenant', 403)

  const body = await req.json()
  const data = PatchRoleSchema.parse(body)

  // Check name collision only if name is being changed
  if (data.name && data.name !== role.name) {
    const conflict = await prisma.role.findFirst({
      where: {
        name: { equals: data.name, mode: 'insensitive' },
        OR: [{ is_system: true }, { tenant_id: tenantId }],
        NOT: { id },
      },
    })
    if (conflict) return errorResponse(`A role named '${data.name}' already exists`, 409)
  }

  const before = { name: role.name, description: role.description, is_active: role.is_active }

  const updated = await prisma.role.update({
    where: { id },
    data: {
      ...(data.name        !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.is_active   !== undefined && { is_active: data.is_active }),
    },
  })

  await auditRbac({
    tenantId,
    actorExternalId: userId,
    entity: 'role',
    entityId: id,
    action: 'role.updated',
    changes: { before, after: { name: updated.name, description: updated.description, is_active: updated.is_active } },
  })

  return successResponse(updated)
})

// ─── DELETE /api/roles/[id] ───────────────────────────────────────────────────

export const DELETE = withHelpdeskAuth<{ id: string }>(async ({ tenantId, userId, user }, _req, { params }) => {
  const { id } = params
  requireRole(user, 'HELPDESK_ADMIN')

  const role = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { user_mappings: true } } },
  })
  if (!role) return errorResponse('Role not found', 404)
  if (role.is_system) return errorResponse('System roles cannot be deleted', 403)
  if (role.tenant_id !== tenantId) return errorResponse('Role does not belong to this tenant', 403)
  if (role._count.user_mappings > 0) {
    return errorResponse(
      `Cannot delete: ${role._count.user_mappings} user mapping(s) still reference this role. Reassign them first.`,
      409
    )
  }

  // Soft-delete
  await prisma.role.update({ where: { id }, data: { is_active: false } })

  await auditRbac({
    tenantId,
    actorExternalId: userId,
    entity: 'role',
    entityId: id,
    action: 'role.deleted',
  })

  return successResponse({ message: 'Role deactivated successfully' })
})
