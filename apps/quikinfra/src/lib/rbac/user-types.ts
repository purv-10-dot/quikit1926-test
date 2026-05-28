/**
 * User Types — PDF-spec RBAC mapping
 *
 * The product spec (Aakar_ERP_RBAC.pdf) defines 5 user-facing roles. The
 * existing engine (lib/rbac/roles.ts) uses 12 granular archetypes — keeping
 * both coexisting means:
 *
 *   - Every existing API guard, approval matrix entry, and test keeps
 *     working unchanged (they still read `ctx.permissions: Set<string>`).
 *   - The User Management UI shows the 5 PDF roles. When a user is created,
 *     we resolve their chosen user type → a concrete permission set (by
 *     reusing an existing granular role) + a scope envelope.
 *
 * COMPANY ADMIN (L1 in the PDF) is deliberately NOT exposed — per the
 * current scoping decision, ADMIN is the top client role and owns ALL
 * modules within the tenant. SUPER ADMIN stays as the MoreYeahs-only
 * platform role and is NOT selectable from the client-facing UI.
 */

import { ROLE_KEYS, type RoleKey } from "./roles";

export const USER_TYPES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  HO_USER: "HO_USER",
  SITE_ADMIN: "SITE_ADMIN",
  USER: "USER",
} as const;

export type UserType = (typeof USER_TYPES)[keyof typeof USER_TYPES];

export interface UserTypeDescriptor {
  key: UserType;
  label: string;
  shortDescription: string;
  /** Selectable from the client-facing User Management UI? */
  clientSelectable: boolean;
  /**
   * Which of the existing granular role archetypes backs this user type.
   * The login flow materialises the permission set from this role.
   */
  backingRole: RoleKey;
  /** Does this user type see ALL projects (no per-site filter)? */
  crossSite: boolean;
  /** Does the user type need module-level assignment on top of the role? */
  requiresModuleAssignment: boolean;
  /** Does the user type need per-site assignment on top of the role? */
  requiresSiteAssignment: boolean;
}

export const USER_TYPE_CATALOG: UserTypeDescriptor[] = [
  {
    key: USER_TYPES.SUPER_ADMIN,
    label: "Super Admin (Platform)",
    shortDescription:
      "MoreYeahs platform accounts only. Cross-tenant, cross-site, all modules. " +
      "Not available for client assignment.",
    clientSelectable: false,
    backingRole: ROLE_KEYS.SUPER_ADMIN,
    crossSite: true,
    requiresModuleAssignment: false,
    requiresSiteAssignment: false,
  },
  {
    key: USER_TYPES.ADMIN,
    label: "Admin (All Modules)",
    shortDescription:
      "Top client role. Full control over ALL modules and ALL sites within the " +
      "tenant. Assign to IT Head / MD / company-wide system owner.",
    clientSelectable: true,
    backingRole: ROLE_KEYS.ADMIN,
    crossSite: true,
    requiresModuleAssignment: false,
    requiresSiteAssignment: false,
  },
  {
    key: USER_TYPES.HO_USER,
    label: "HO User (Cross-site, page-level)",
    shortDescription:
      "Cross-site visibility with granular page-level access. Ideal for CFO, " +
      "MIS manager, senior management who need to read every site and approve " +
      "specific documents.",
    clientSelectable: true,
    backingRole: ROLE_KEYS.HO_USER,
    crossSite: true,
    requiresModuleAssignment: true,
    requiresSiteAssignment: false,
  },
  {
    key: USER_TYPES.SITE_ADMIN,
    label: "Site Admin / Project Manager",
    shortDescription:
      "Admin within assigned sites and modules. Ideal for Project Managers / Site " +
      "Managers who need to run day-to-day operations on specific projects, but " +
      "only for the modules you grant. Cannot see other sites.",
    clientSelectable: true,
    backingRole: ROLE_KEYS.SITE_ADMIN,
    crossSite: false,
    requiresModuleAssignment: true,
    requiresSiteAssignment: true,
  },
  {
    key: USER_TYPES.USER,
    label: "User (Specific sites + modules)",
    shortDescription:
      "Transactional role. Field-level access to assigned modules on assigned " +
      "sites only. Site engineers, store keepers, purchase execs.",
    clientSelectable: true,
    backingRole: ROLE_KEYS.USER,
    crossSite: false,
    requiresModuleAssignment: true,
    requiresSiteAssignment: true,
  },
];

/**
 * The module list every user type can be assigned to (only relevant for
 * HO_USER and USER). Mirrors the real sidebar parent groups one-for-one
 * — see CONSTRUCTION_NAV in QuikInfraShell.tsx. When you add a
 * new sidebar group, add a matching entry here so the User Management
 * module picker stays in sync with what a user can actually navigate to.
 */
export const ASSIGNABLE_MODULES = [
  { key: "organization",    label: "Organization" },
  { key: "masters",         label: "Masters" },
  { key: "purchase",        label: "Purchase" },
  { key: "store",           label: "Store" },
  { key: "project_mgmt",    label: "Project Mgmt" },
  { key: "quality_safety",  label: "Quality & Safety" },
];

export type ModuleKey = (typeof ASSIGNABLE_MODULES)[number]["key"];

export function getUserTypeDescriptor(userType: string): UserTypeDescriptor | undefined {
  return USER_TYPE_CATALOG.find((t) => t.key === userType);
}

/** Only the roles a client-facing UI should offer — SUPER_ADMIN is hidden. */
export function getClientSelectableUserTypes(): UserTypeDescriptor[] {
  return USER_TYPE_CATALOG.filter((t) => t.clientSelectable);
}

/**
 * Ordinal authority ranking used by approval workflows.
 *
 * Higher = more authority. Used in two places:
 *   - At submit time, steps whose required role rank is <= the raiser's
 *     rank are auto-skipped (a Site Admin shouldn't need a User's sign-off).
 *   - At approve time, a caller whose rank is >= the step's required role
 *     can step in on a role-only step.
 *
 * Pinned-user steps (step.approverUserId) still require an exact match
 * at approve time — rank only governs role-only steps. Submit-time
 * auto-skip is more liberal: if the raiser outranks the step's role,
 * the pinned user is also subordinate and gets skipped.
 */
export const USER_TYPE_RANK: Record<UserType, number> = {
  USER: 1,
  SITE_ADMIN: 2,
  HO_USER: 3,
  ADMIN: 4,
  SUPER_ADMIN: 5,
};

export function getUserTypeRank(userType: string | null | undefined): number {
  if (!userType) return 0;
  return USER_TYPE_RANK[userType as UserType] ?? 0;
}
