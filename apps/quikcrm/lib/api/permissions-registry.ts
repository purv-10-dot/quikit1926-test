/**
 * QuikCRM permission registry — flat (resource, action) pairs stored in
 * `app_quikcrm.RolePermission`, same pattern as QuikScale v2.
 *
 * `resource` matches the module keys used by `assertModule()` / sidebar gating.
 */

import type { ModuleAction } from "@/types/permission";

export const CRM_MODULES = [
  "dashboard",
  "leads",
  "accounts",
  "contacts",
  "opportunities",
  "activities",
  "tasks",
  "notes",
  "campaigns",
  "automations",
  "imports",
  "reports",
  "settings",
  "telephony",
  "quotes",
  "documents",
  "mailbox",
] as const;

export type CrmModule = (typeof CRM_MODULES)[number];

export const CRM_ACTIONS: readonly ModuleAction[] = [
  "view",
  "create",
  "edit",
  "delete",
  "export",
  "import",
  "markComplete",
];

export type CrmAction = ModuleAction;

export function isCrmModule(s: string): s is CrmModule {
  return (CRM_MODULES as readonly string[]).includes(s);
}

export function isCrmAction(s: string): s is CrmAction {
  return (CRM_ACTIONS as readonly string[]).includes(s as CrmAction);
}

/** Every (module, action) pair the CRM supports. */
export function allCrmPermissionPairs(): Array<{ resource: string; action: CrmAction }> {
  const out: Array<{ resource: string; action: CrmAction }> = [];
  for (const resource of CRM_MODULES) {
    for (const action of CRM_ACTIONS) {
      out.push({ resource, action });
    }
  }
  return out;
}

export function isValidCrmPermissionPair(resource: string, action: string): boolean {
  return isCrmModule(resource) && isCrmAction(action);
}

/** Org membership role → seeded `AppRole.name` in app_quikcrm. */
export const MEMBERSHIP_ROLE_TO_APP_ROLE: Record<string, string> = {
  Administrator: "admin",
  SalesManager: "sales-manager",
  SalesUser: "sales-user",
  MarketingUser: "marketing-user",
  FinanceUser: "finance-user",
};

export function appRoleNameForMembershipRole(membershipRole: string): string {
  return MEMBERSHIP_ROLE_TO_APP_ROLE[membershipRole] ?? "sales-user";
}
