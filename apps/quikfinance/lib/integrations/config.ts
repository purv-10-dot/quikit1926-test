import type { ApiContext } from "@/lib/api/auth";

/**
 * Feature flags + RBAC for the integration platform. Flags are env-driven so the
 * module can be dark-launched; permissions gate write actions to admin roles.
 */

export const FEATURE_FLAGS = {
  /** Master switch for the whole module. */
  integrations: process.env.FEATURE_INTEGRATIONS !== "off",
  /** Individual providers can be toggled. */
  zoho: process.env.FEATURE_INTEGRATIONS_ZOHO !== "off",
  tally: process.env.FEATURE_INTEGRATIONS_TALLY !== "off",
  /** AI-assisted mapping / dedupe / health recommendations. */
  ai: process.env.FEATURE_INTEGRATIONS_AI !== "off"
} as const;

export function isProviderEnabled(key: string): boolean {
  if (key === "zoho_books") return FEATURE_FLAGS.zoho;
  if (key === "tally_prime") return FEATURE_FLAGS.tally;
  return true;
}

/** Roles permitted to mutate integrations (connect, sync, migrate, resolve). */
const WRITE_ROLES = new Set(["owner", "admin", "super_admin", "accountant"]);
const READ_ROLES = new Set(["owner", "admin", "super_admin", "accountant", "member", "viewer"]);

export function canManageIntegrations(context: ApiContext): boolean {
  return WRITE_ROLES.has((context.role ?? "").toLowerCase());
}

export function canViewIntegrations(context: ApiContext): boolean {
  const role = (context.role ?? "").toLowerCase();
  return READ_ROLES.has(role) || WRITE_ROLES.has(role);
}
