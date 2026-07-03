/**
 * rbac.ts — helpdesk (Hd*) permission catalogue + audit helper.
 *
 * This module defines the helpdesk domain permission vocabulary
 * (`ALL_PERMISSIONS`, `SYSTEM_ROLE_PERMISSIONS`) consumed by the auto-provision
 * seeder (lib/helpdesk-context.ts) and the standard-RBAC registry
 * (lib/api/permissionsRegistry.ts), plus `auditRbac()` for RBAC change logging.
 *
 * NOTE: the legacy standalone `withRbac()` / `resolveMapping()` header-based
 * gate (x-tenant-id / x-user-id) was removed during QuikIT integration —
 * identity now comes from the session via `withHelpdeskAuth` / helpdesk-context,
 * and authorization uses `HdUser.role` (domain) + the Qsp* layer
 * (lib/api/permissions.ts). Do not reintroduce header-based auth.
 */

import { prisma } from './db'

// ─── Permission catalogue ─────────────────────────────────────────────────────

export type PermissionKey =
  | 'ticket.create'
  | 'ticket.assign'
  | 'ticket.update'
  | 'ticket.close'
  | 'ticket.escalate'
  | 'user.manage'
  | 'role.manage'

export const ALL_PERMISSIONS: Array<{
  key: PermissionKey
  name: string
  description: string
  resource: string
  action: string
}> = [
  { key: 'ticket.create',   name: 'Create Ticket',    resource: 'ticket', action: 'create',   description: 'Open new support tickets' },
  { key: 'ticket.assign',   name: 'Assign Ticket',    resource: 'ticket', action: 'assign',   description: 'Assign tickets to agents' },
  { key: 'ticket.update',   name: 'Update Ticket',    resource: 'ticket', action: 'update',   description: 'Edit ticket details and status' },
  { key: 'ticket.close',    name: 'Close Ticket',     resource: 'ticket', action: 'close',    description: 'Mark tickets as resolved/closed' },
  { key: 'ticket.escalate', name: 'Escalate Ticket',  resource: 'ticket', action: 'escalate', description: 'Escalate tickets to higher priority' },
  { key: 'user.manage',     name: 'Manage Users',     resource: 'user',   action: 'manage',   description: 'Create and update user role mappings' },
  { key: 'role.manage',     name: 'Manage Roles',     resource: 'role',   action: 'manage',   description: 'Create roles and assign permissions' },
]

// Default permissions per system role
export const SYSTEM_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  'Admin': [
    'ticket.create', 'ticket.assign', 'ticket.update',
    'ticket.close', 'ticket.escalate', 'user.manage', 'role.manage',
  ],
  'Agent': [
    'ticket.create', 'ticket.assign', 'ticket.update',
    'ticket.close', 'ticket.escalate',
  ],
  'End User': [
    'ticket.create',
  ],
}

// ─── Audit helper ─────────────────────────────────────────────────────────────

/**
 * Best-effort audit writer for RBAC changes (role assignments, permission updates).
 * Silently skips if the actor's local User record doesn't exist yet.
 */
export async function auditRbac(opts: {
  tenantId: string
  actorExternalId: string
  entity: 'role' | 'permission' | 'user_mapping'
  entityId: string
  action: string   // e.g. "role.created", "permission.granted", "mapping.status_changed"
  changes?: Record<string, unknown>
  ip?: string
}) {
  try {
    const actor = await prisma.user.findFirst({
      where: { tenant_id: opts.tenantId, external_id: opts.actorExternalId },
      select: { id: true },
    })
    if (!actor) return

    await prisma.auditLog.create({
      data: {
        tenant_id:  opts.tenantId,
        user_id:    actor.id,
        entity:     opts.entity,
        entity_id:  opts.entityId,
        action:     opts.action,
        changes:    (opts.changes ?? null) as object,
        ip_address: opts.ip ?? null,
      },
    })
  } catch {
    // Audit failures must never break the main operation
  }
}
