/**
 * GET   /api/user-mappings/[id]  — fetch a single mapping
 * PATCH /api/user-mappings/[id]  — update role or status of an existing mapping
 *
 * Role changes take effect immediately (no cache — every request re-resolves).
 * Requires HELPDESK_ADMIN.
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/helpdesk-context'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { successResponse, errorResponse } from '@/lib/api'
import { auditRbac } from '@/lib/rbac'

const PatchMappingSchema = z.object({
  role_id: z.string().min(1).optional(),
  status:  z.enum(['active', 'inactive', 'suspended']).optional(),
}).refine(d => d.role_id || d.status, { message: 'Provide at least role_id or status' })

// ─── GET /api/user-mappings/[id] ─────────────────────────────────────────────

export const GET = withHelpdeskAuth<{ id: string }>(async ({ tenantId, user }, _req, { params }) => {
  const { id } = params
  requireRole(user, 'HELPDESK_ADMIN')

  const mapping = await prisma.userMapping.findUnique({
    where: { id },
    include: {
      role: {
        include: {
          role_permissions: { include: { permission: true } },
        },
      },
    },
  })

  if (!mapping || mapping.tenant_id !== tenantId) {
    return errorResponse('Mapping not found', 404)
  }

  return successResponse(mapping)
})

// ─── PATCH /api/user-mappings/[id] ───────────────────────────────────────────

export const PATCH = withHelpdeskAuth<{ id: string }>(async ({ tenantId, userId, user }, req: NextRequest, { params }) => {
  const { id } = params
  requireRole(user, 'HELPDESK_ADMIN')

  const mapping = await prisma.userMapping.findUnique({
    where: { id },
    include: { role: { select: { name: true } } },
  })
  if (!mapping || mapping.tenant_id !== tenantId) {
    return errorResponse('Mapping not found', 404)
  }

  const body = await req.json()
  const data = PatchMappingSchema.parse(body)

  // Validate new role if provided
  if (data.role_id) {
    const newRole = await prisma.role.findUnique({ where: { id: data.role_id } })
    if (!newRole || (!newRole.is_system && newRole.tenant_id !== tenantId)) {
      return errorResponse('Role not found or not accessible to this tenant', 404)
    }
    if (!newRole.is_active) return errorResponse('Target role is inactive', 422)
  }

  const before = { role_id: mapping.role_id, status: mapping.status }

  const updated = await prisma.userMapping.update({
    where: { id },
    data: {
      ...(data.role_id && { role_id: data.role_id }),
      ...(data.status  && { status:  data.status  }),
    },
    include: {
      role: { select: { id: true, name: true, is_system: true } },
    },
  })

  await auditRbac({
    tenantId,
    actorExternalId: userId,
    entity: 'user_mapping',
    entityId: id,
    action: data.status ? 'mapping.status_changed' : 'mapping.role_changed',
    changes: {
      before,
      after: { role_id: updated.role_id, status: updated.status },
      user_id: mapping.user_id,
    },
  })

  return successResponse(updated)
})
