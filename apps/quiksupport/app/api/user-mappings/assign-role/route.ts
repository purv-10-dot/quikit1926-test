/**
 * POST /api/user-mappings/assign-role
 *
 * Convenience endpoint that assigns a named role to a Quikit user by name,
 * instead of requiring callers to know the role UUID.
 *
 * Body:
 *   { user_id, role_name, app_id?, metadata? }
 *
 * Behaviour:
 *   - Resolves role by name (system role OR tenant custom role)
 *   - Upserts the UserMapping (creates if missing, updates role if exists)
 *   - Idempotent: safe to call repeatedly
 *
 * Requires HELPDESK_ADMIN.
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/helpdesk-context'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { successResponse, errorResponse } from '@/lib/api'
import { auditRbac } from '@/lib/rbac'

const AssignRoleSchema = z.object({
  user_id:   z.string().min(1),           // Quikit external userId
  role_name: z.string().min(1),           // e.g. "Agent", "Admin", "End User"
  app_id:    z.string().default(''),      // "" = tenant-wide; set for app-scoped override
  mode:      z.enum(['integrated', 'standalone']).default('standalone'),
  metadata:  z.object({
    name:       z.string().optional(),
    email:      z.string().email().optional(),
    avatar_url: z.string().url().optional(),
  }).optional(),
})

export const POST = withHelpdeskAuth(async ({ tenantId, userId, user }, req: NextRequest) => {
  requireRole(user, 'HELPDESK_ADMIN')

  const body = await req.json()
  const data = AssignRoleSchema.parse(body)

  // Resolve role by name: prefer tenant-custom, fall back to system
  const role = await prisma.role.findFirst({
    where: {
      name: { equals: data.role_name, mode: 'insensitive' },
      is_active: true,
      OR: [
        { is_system: true,  tenant_id: null },
        { is_system: false, tenant_id: tenantId },
      ],
    },
    orderBy: { is_system: 'asc' }, // prefer tenant-custom (is_system=false) over system
  })

  if (!role) {
    return errorResponse(
      `No active role named '${data.role_name}' found for this tenant`,
      404
    )
  }

  const mapping = await prisma.userMapping.upsert({
    where: {
      user_id_tenant_id_app_id: {
        user_id:   data.user_id,
        tenant_id: tenantId,
        app_id:    data.app_id,
      },
    },
    create: {
      user_id:    data.user_id,
      tenant_id:  tenantId,
      app_id:     data.app_id,
      role_id:    role.id,
      status:     'active',
      mode:       data.mode,
      metadata:   data.metadata as object | undefined,
      created_by: userId,
    },
    update: {
      role_id:  role.id,
      status:   'active',
      metadata: data.metadata as object | undefined,
    },
    include: {
      role: { select: { id: true, name: true, is_system: true } },
    },
  })

  await auditRbac({
    tenantId,
    actorExternalId: userId,
    entity: 'user_mapping',
    entityId: mapping.id,
    action: 'mapping.role_assigned',
    changes: {
      user_id:  data.user_id,
      role:     role.name,
      app_id:   data.app_id || '(tenant-wide)',
      mode:     data.mode,
    },
  })

  return successResponse({
    mapping,
    message: `User '${data.user_id}' assigned role '${role.name}'${data.app_id ? ` for app '${data.app_id}'` : ' (tenant-wide)'}`,
  }, 201)
})
