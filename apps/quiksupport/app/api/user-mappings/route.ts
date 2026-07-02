/**
 * GET  /api/user-mappings  — list all mappings for the requesting tenant
 * POST /api/user-mappings  — create or upsert a UserMapping (standalone: admin assigns role)
 *
 * Supports both operating modes:
 *   integrated  — mapping is auto-created on first request via withRbac()
 *   standalone  — admin must POST here to assign a role before the user can access anything
 *
 * Query params (GET):
 *   ?status=active|inactive|suspended
 *   ?role_id=<roleId>
 *   ?search=<userId substring>
 *   ?app_id=<appId>            (filter app-scoped mappings; omit for tenant-wide)
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/helpdesk-context'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { successResponse, errorResponse } from '@/lib/api'
import { auditRbac } from '@/lib/rbac'

const CreateMappingSchema = z.object({
  user_id:    z.string().min(1),                 // Quikit external userId
  role_id:    z.string().min(1),
  app_id:     z.string().default(''),            // "" = tenant-wide
  mode:       z.enum(['integrated', 'standalone']).default('standalone'),
  metadata:   z.object({
    name:       z.string().optional(),
    email:      z.string().email().optional(),
    avatar_url: z.string().url().optional(),
  }).optional(),
})

// ─── GET /api/user-mappings ───────────────────────────────────────────────────

export const GET = withHelpdeskAuth(async ({ tenantId, user }, req: NextRequest) => {
  requireRole(user, 'HELPDESK_ADMIN')

  const url    = new URL(req.url)
  const status = url.searchParams.get('status') || undefined
  const roleId = url.searchParams.get('role_id') || undefined
  const search = url.searchParams.get('search') || undefined
  const appId  = url.searchParams.has('app_id') ? url.searchParams.get('app_id')! : undefined

  const mappings = await prisma.userMapping.findMany({
    where: {
      tenant_id: tenantId,
      ...(status && { status: status as 'active' | 'inactive' | 'suspended' }),
      ...(roleId && { role_id: roleId }),
      ...(appId  !== undefined && { app_id: appId }),
      ...(search && { user_id: { contains: search } }),
    },
    include: {
      role: {
        select: { id: true, name: true, is_system: true, tenant_id: true },
      },
    },
    orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
  })

  return successResponse(mappings)
})

// ─── POST /api/user-mappings ──────────────────────────────────────────────────

export const POST = withHelpdeskAuth(async ({ tenantId, userId, user }, req: NextRequest) => {
  requireRole(user, 'HELPDESK_ADMIN')

  const body = await req.json()
  const data = CreateMappingSchema.parse(body)

  // Validate that the role exists and belongs to this tenant (or is a system role)
  const role = await prisma.role.findUnique({ where: { id: data.role_id } })
  if (!role || (!role.is_system && role.tenant_id !== tenantId)) {
    return errorResponse('Role not found or not accessible to this tenant', 404)
  }
  if (!role.is_active) return errorResponse('Role is inactive', 422)

  // Upsert: if mapping exists update role; if not create it
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
      role_id:    data.role_id,
      status:     'active',
      mode:       data.mode,
      metadata:   data.metadata as object | undefined,
      created_by: userId,
    },
    update: {
      role_id:  data.role_id,
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
    action: 'mapping.upserted',
    changes: {
      user_id: data.user_id,
      role: role.name,
      app_id: data.app_id || '(tenant-wide)',
      mode: data.mode,
    },
  })

  return successResponse(mapping, 201)
})
