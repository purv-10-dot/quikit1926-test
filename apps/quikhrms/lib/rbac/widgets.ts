/**
 * Dashboard widget map by role name.
 *
 * AppRole has no `dashboardConfig` column (column dropped to match quikscale
 * v2 spec). Widget selection moves to this static registry keyed by role name.
 * Server-side dashboard/config route reads from here.
 *
 * To customize per tenant later, replace this lookup with a sidecar table
 * (e.g. `RoleNavigation` rows tagged as widgets, or a dedicated `RoleWidget`
 * table). The shape of `widgetsForRole(name)` keeps the consumer contract.
 */

import { DEFAULT_ROLES } from "./permissions";

const WIDGET_BY_ROLE: Record<string, string[]> = Object.fromEntries(
  DEFAULT_ROLES.map((r) => {
    const cfg = r.dashboardConfig as { widgets?: string[] } | undefined;
    return [r.code, Array.isArray(cfg?.widgets) ? cfg!.widgets! : []];
  }),
);

export function widgetsForRole(roleName: string | null | undefined): string[] {
  if (!roleName) return [];
  return WIDGET_BY_ROLE[roleName] ?? [];
}
