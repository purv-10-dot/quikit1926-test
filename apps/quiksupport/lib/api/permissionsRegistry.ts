/**
 * Permission vocabulary for QuikSupport's standard QuikIT RBAC (Qsp* AppRole).
 *
 * Single source of truth for the (resource, action) pairs and sidebar nav keys
 * that the Qsp* role tables grant. Derived from the helpdesk permission
 * catalogue (`ALL_PERMISSIONS` in lib/rbac.ts) so the two role systems agree on
 * the resource/action names. Mirrors quiktrack's lib/api/permissionsRegistry.ts.
 */
import { ALL_PERMISSIONS } from "@/lib/rbac";

/** Distinct resources: `ticket`, `user`, `role`. */
export const RESOURCES = Array.from(new Set(ALL_PERMISSIONS.map((p) => p.resource)));
/** Distinct actions: `create`, `assign`, `update`, `close`, `escalate`, `manage`. */
export const ACTIONS = Array.from(new Set(ALL_PERMISSIONS.map((p) => p.action)));

/** Sidebar/nav keys this app exposes — match manifest.ts navigation + views. */
export const NAV_KEYS = [
  "dashboard",
  "tickets",
  "queue",
  "categories",
  "sla-config",
  "users",
  "reports",
  "settings",
] as const;

/** Nav keys granted to the default "Member" role. */
export const MEMBER_NAV = ["dashboard", "tickets"] as const;

const RESOURCE_SET = new Set(RESOURCES);
const ACTION_SET = new Set(ACTIONS);
const PAIR_SET = new Set(ALL_PERMISSIONS.map((p) => `${p.resource}:${p.action}`));
const NAV_SET = new Set<string>(NAV_KEYS);

export function isResource(resource: string): boolean {
  return RESOURCE_SET.has(resource);
}
export function isAction(action: string): boolean {
  return ACTION_SET.has(action);
}
/** True only for (resource, action) pairs that actually exist in the catalogue. */
export function isValidPermissionPair(resource: string, action: string): boolean {
  return PAIR_SET.has(`${resource}:${action}`);
}
export function isNavKey(navKey: string): boolean {
  return NAV_SET.has(navKey);
}
/** All grantable (resource, action) pairs — used by the admin role seeder. */
export function allPermissionPairs(): Array<{ resource: string; action: string }> {
  return ALL_PERMISSIONS.map((p) => ({ resource: p.resource, action: p.action }));
}
