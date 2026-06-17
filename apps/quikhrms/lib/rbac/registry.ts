/**
 * RBAC v2 registry helpers — mirrors quikscale Dynamic Roles & Permissions v2.
 *
 * HRMS context mapping:
 *   AppRole.orgId  ← orgId value
 *   AppRole.appId  ← APP_ID constant ("quikhrms")
 *   UserAppRole.userId ← Employee.id
 *
 * Permission code format on the wire: "hrms.<domain>.<action>"
 * DB storage (quikscale-compatible): resource + action columns where
 *   action = last dot-separated segment, resource = everything before.
 */

import { PERMISSIONS, DEFAULT_ROLES } from "./permissions";

export const APP_ID = "quikhrms";

/** Split "hrms.employee.read" → { resource: "hrms.employee", action: "read" } */
export function splitCode(code: string): { resource: string; action: string } {
  const lastDot = code.lastIndexOf(".");
  if (lastDot < 0) return { resource: code, action: "*" };
  return {
    resource: code.slice(0, lastDot),
    action: code.slice(lastDot + 1),
  };
}

/** Join { resource, action } → "resource.action". */
export function joinCode(resource: string, action: string): string {
  if (!action || action === "*") return resource;
  return `${resource}.${action}`;
}

/** All registry codes as (resource, action) pairs. */
export function allPermissionPairs(): { resource: string; action: string }[] {
  return PERMISSIONS.map((p) => splitCode(p.code));
}

/** Priority map by role name — replaces dropped Role.priority column. */
export const ROLE_PRIORITY: Record<string, number> = Object.fromEntries(
  DEFAULT_ROLES.map((r) => [r.code, r.priority]),
);

export function rolePriority(name: string | null | undefined): number {
  if (!name) return 0;
  return ROLE_PRIORITY[name] ?? 0;
}

/** Resolve permission code list for a seeded role. "*" means all codes. */
export function defaultPermissionsForRole(name: string): string[] {
  const seed = DEFAULT_ROLES.find((r) => r.code === name);
  if (!seed) return [];
  if (seed.permissions === "*") return PERMISSIONS.map((p) => p.code);
  return seed.permissions;
}
