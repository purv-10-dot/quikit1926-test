/**
 * Per-role configuration overrides, stored as JSON on
 * OrgWorkspaceSettings.settings.roleOverrides.
 *
 * WHY JSON-on-settings (not dedicated tables): identical pattern to
 * `pipeline-config.ts` (leadPipelineConfig). The DB-backed RBAC tables
 * (AppRole/RolePermission/…) are NOT in the schema — `isCrmRbacClientReady()`
 * is always false — so role config that must be editable at runtime lives in
 * the existing `settings` JSON column. This needs NO Prisma model and NO
 * migration: the column already exists and holds arbitrary JSON.
 *
 * Shape:
 *   settings.roleOverrides = {
 *     "SalesUser":    { restrictToOwnedLeads?: boolean, matrix?: PermissionMatrix },
 *     "SalesManager": { ... },
 *     ...
 *   }
 *
 * `restrictToOwnedLeads` powers owner-based lead visibility (see
 * `lib/auth/owner-scope.ts`). `matrix` (optional, used by the self-service
 * roles editor) can carry an authoritative module/action/field matrix per role.
 * Both are absent by default → callers fall back to the in-code role baseline,
 * so behaviour is unchanged until an admin sets an override.
 */

import { prisma } from "@/lib/db/prisma";
import type { PermissionMatrix } from "@/types/permission";

export interface RoleOverride {
  /** When true, users with this role see only leads they own. Default false. */
  restrictToOwnedLeads?: boolean;
  /**
   * Optional authoritative permission matrix for this role. When present, the
   * self-service roles editor uses it in place of the in-code baseline. When
   * absent, the in-code baseline applies. (Consumed by getEffectiveMatrix in a
   * later step; defined here so the storage shape is complete.)
   */
  matrix?: PermissionMatrix;
}

export type RoleOverrides = Record<string, RoleOverride>;

interface SettingsTree {
  roleOverrides?: RoleOverrides;
  [k: string]: unknown;
}

async function readTree(tenantId: string): Promise<SettingsTree> {
  const row = await prisma.qcfOrgWorkspaceSettings.findUnique({ where: { tenantId } });
  return ((row?.settings as SettingsTree | null) ?? {}) as SettingsTree;
}

async function writeTree(tenantId: string, next: SettingsTree): Promise<void> {
  await prisma.qcfOrgWorkspaceSettings.upsert({
    where: { tenantId },
    create: { tenantId, settings: next as object },
    update: { settings: next as object },
  });
}

/** All role overrides for a tenant (empty object when none configured). */
export async function getRoleOverrides(tenantId: string): Promise<RoleOverrides> {
  const tree = await readTree(tenantId);
  return tree.roleOverrides ?? {};
}

/** The override for one role, or null when none is configured. */
export async function getRoleOverride(
  tenantId: string,
  role: string,
): Promise<RoleOverride | null> {
  const all = await getRoleOverrides(tenantId);
  return all[role] ?? null;
}

/**
 * Merge a partial override for one role (create-or-update, never clobbers other
 * roles). Returns the full overrides map after the write.
 */
export async function setRoleOverride(
  tenantId: string,
  role: string,
  patch: RoleOverride,
): Promise<RoleOverrides> {
  const tree = await readTree(tenantId);
  const current = tree.roleOverrides ?? {};
  const nextForRole: RoleOverride = { ...(current[role] ?? {}), ...patch };
  const nextOverrides: RoleOverrides = { ...current, [role]: nextForRole };
  await writeTree(tenantId, { ...tree, roleOverrides: nextOverrides });
  return nextOverrides;
}
