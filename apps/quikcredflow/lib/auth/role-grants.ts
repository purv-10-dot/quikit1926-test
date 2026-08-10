/**
 * Single source of truth for CRM role baselines.
 *
 * The DB-backed role-grant tables (AppRole/RolePermission/UserAppRole) are not
 * wired in this app — `isCrmRbacClientReady()` returns false — so role-based
 * access is derived IN CODE from the user's membership role. This guarantees
 * every authenticated user always has a non-empty, role-appropriate permission
 * matrix, which is what makes the default-deny gate in `assertModule` safe
 * (an empty matrix would otherwise lock everyone out).
 *
 * Permission templates (QcfPermissionTemplate) layer additively on top of this
 * baseline and carry field-level masking. See `getEffectiveMatrix`.
 */
import {
  CRM_MODULES,
  allCrmPermissionPairs,
  type CrmAction,
  type CrmModule,
} from "@/lib/api/permissions-registry";
import type { ModuleAction, PermissionMatrix } from "@/types/permission";

/** Canonical CRM role names (membership role mapped via `mapRole`). */
export const ADMIN_ROLE = "Administrator";
export const SALES_MANAGER_ROLE = "SalesManager";
export const SALES_USER_ROLE = "SalesUser";
export const MARKETING_USER_ROLE = "MarketingUser";
export const FINANCE_USER_ROLE = "FinanceUser";

export type Grant = { resource: CrmModule; action: CrmAction };

const WORK_MODULES: CrmModule[] = [
  "leads",
  "accounts",
  "contacts",
  "opportunities",
  "activities",
  "tasks",
  "notes",
  "telephony",
];

const WORK_ACTIONS: CrmAction[] = ["view", "create", "edit", "markComplete"];

function grants(modules: CrmModule[], actions: CrmAction[]): Grant[] {
  return modules.flatMap((resource) => actions.map((action) => ({ resource, action })));
}

export const SALES_USER_GRANTS: Grant[] = [
  { resource: "dashboard", action: "view" },
  ...grants(WORK_MODULES, WORK_ACTIONS),
];

export const SALES_MANAGER_GRANTS: Grant[] = [
  ...SALES_USER_GRANTS,
  ...grants(WORK_MODULES, ["delete", "export"]),
  { resource: "reports", action: "view" },
  { resource: "imports", action: "view" },
  { resource: "imports", action: "import" },
  { resource: "quotes", action: "view" },
  { resource: "quotes", action: "create" },
  { resource: "quotes", action: "edit" },
  { resource: "documents", action: "view" },
];

export const MARKETING_USER_GRANTS: Grant[] = [
  { resource: "dashboard", action: "view" },
  { resource: "leads", action: "view" },
  { resource: "leads", action: "create" },
  { resource: "leads", action: "edit" },
  { resource: "campaigns", action: "view" },
  { resource: "campaigns", action: "create" },
  { resource: "campaigns", action: "edit" },
  { resource: "activities", action: "view" },
  { resource: "activities", action: "create" },
];

export const FINANCE_USER_GRANTS: Grant[] = [
  { resource: "dashboard", action: "view" },
  { resource: "accounts", action: "view" },
  { resource: "opportunities", action: "view" },
  { resource: "quotes", action: "view" },
  { resource: "quotes", action: "create" },
  { resource: "quotes", action: "edit" },
  { resource: "quotes", action: "export" },
  { resource: "reports", action: "view" },
  { resource: "reports", action: "export" },
];

/** Every (module, action) pair — Administrator baseline. */
function adminGrants(): Grant[] {
  return allCrmPermissionPairs().map((p) => ({
    resource: p.resource as CrmModule,
    action: p.action,
  }));
}

/** Resolve the baseline grant list for a (mapped) CRM role. */
export function roleGrants(role: string): Grant[] {
  switch (role) {
    case ADMIN_ROLE:
      return adminGrants();
    case SALES_MANAGER_ROLE:
      return SALES_MANAGER_GRANTS;
    case MARKETING_USER_ROLE:
      return MARKETING_USER_GRANTS;
    case FINANCE_USER_ROLE:
      return FINANCE_USER_GRANTS;
    case SALES_USER_ROLE:
      return SALES_USER_GRANTS;
    default:
      // `mapRole` never produces an unknown role, but default to the most
      // restrictive known baseline rather than granting nothing-or-everything.
      return SALES_USER_GRANTS;
  }
}

/** Build a PermissionMatrix (module → actions, no field rules) for a role. */
export function roleBaselineMatrix(role: string): PermissionMatrix {
  const byModule = new Map<string, ModuleAction[]>();
  for (const { resource, action } of roleGrants(role)) {
    const actions = byModule.get(resource) ?? [];
    if (!actions.includes(action)) actions.push(action);
    byModule.set(resource, actions);
  }
  return [...byModule.entries()].map(([module, actions]) => ({
    module,
    actions,
    hiddenFields: [],
    restrictedFields: [],
  }));
}

const ADMIN_ROLE_ALIASES = new Set([ADMIN_ROLE.toLowerCase()]);

/** True for the mapped CRM Administrator role. */
export function isAdminRole(role: string | undefined | null): boolean {
  return !!role && ADMIN_ROLE_ALIASES.has(role.toLowerCase());
}

export { CRM_MODULES };
