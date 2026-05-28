/**
 * System Role Definitions
 *
 * 5 backing roles for QuikInfra — one per client-facing user type
 * in user-types.ts, plus the hidden platform super admin. Each role
 * declares the exact set of permission keys it carries. The seed script
 * reads this and creates the CnRole + CnRolePermission rows.
 *
 * The WILDCARD symbol "*" means "all permissions" — used only by
 * super_admin (cross-tenant) and admin (within tenant).
 * The seed materializes the wildcard into concrete role_permission rows
 * for one permission each, so the runtime check `permissions.has("boq.lock")`
 * always works without a special-case branch.
 *
 * Naming: keys match `cn_users.roleKey` in the DB and are stable. Display
 * names are for UI only.
 */

import { PERMISSIONS, type PermissionKey } from "./permissions";

export const ROLE_KEYS = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  HO_USER: "ho_user",
  SITE_ADMIN: "site_admin",
  USER: "user",
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

export interface RoleDefinition {
  key: RoleKey;
  name: string;
  description: string;
  /** Explicit permission list, or "*" wildcard for super/tenant admins. */
  permissions: PermissionKey[] | "*";
  /** If true, cannot be deleted via UI (system-managed). */
  isSystem: boolean;
}

const READ_EVERYTHING: PermissionKey[] = [
  PERMISSIONS.BOQ_READ,
  PERMISSIONS.DPR_READ,
  PERMISSIONS.RAB_READ,
  PERMISSIONS.WO_READ,
  PERMISSIONS.WBS_READ,
  PERMISSIONS.MR_READ,
  PERMISSIONS.INDENT_READ,
  PERMISSIONS.PO_READ,
  PERMISSIONS.GRN_READ,
  PERMISSIONS.ISSUE_READ,
  PERMISSIONS.TRANSFER_READ,
  PERMISSIONS.RECON_READ,
  PERMISSIONS.QUALITY_READ,
  PERMISSIONS.SAFETY_READ,
  PERMISSIONS.MASTERS_READ,
  PERMISSIONS.REPORTS_READ,
];

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: ROLE_KEYS.SUPER_ADMIN,
    name: "Platform Super Admin",
    description:
      "Cross-tenant operator. Manages tenants, feature flags, platform-level settings. " +
      "Can unlock BOQ. Never scoped to a single project.",
    permissions: "*",
    isSystem: true,
  },
  {
    key: ROLE_KEYS.ADMIN,
    name: "Admin",
    description:
      "Backing role for the ADMIN user type. Full access within one tenant. " +
      "Manages users, roles, approval workflows. Can unlock BOQ on any project.",
    permissions: "*",
    isSystem: true,
  },
  {
    key: ROLE_KEYS.HO_USER,
    name: "HO User",
    description:
      "Backing role for the HO_USER user type. Senior approver across multiple " +
      "projects. Final-level indent/PO approvals, reviews RAB, can lock BOQ.",
    permissions: [
      ...READ_EVERYTHING,
      PERMISSIONS.BOQ_LOCK,
      PERMISSIONS.WBS_WRITE,
      PERMISSIONS.DPR_APPROVE,
      PERMISSIONS.DPR_REVERSE,
      PERMISSIONS.RAB_APPROVE,
      PERMISSIONS.WO_APPROVE,
      PERMISSIONS.INDENT_APPROVE_L3,
      PERMISSIONS.PO_APPROVE_L2,
      PERMISSIONS.PO_CLOSE,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.FINANCE_EXPORT,
      PERMISSIONS.REPORTS_EXPORT,
      PERMISSIONS.AUDIT_VIEW,
    ],
    isSystem: true,
  },
  {
    key: ROLE_KEYS.SITE_ADMIN,
    name: "Site Admin",
    description:
      "Backing role for the SITE_ADMIN user type. Runs one or more projects " +
      "day-to-day. Locks BOQ, approves DPRs, approves Indent L2.",
    permissions: [
      ...READ_EVERYTHING,
      PERMISSIONS.BOQ_WRITE,
      PERMISSIONS.BOQ_IMPORT,
      PERMISSIONS.BOQ_LOCK,
      PERMISSIONS.WBS_WRITE,
      PERMISSIONS.DPR_WRITE,
      PERMISSIONS.DPR_SUBMIT,
      PERMISSIONS.DPR_APPROVE,
      PERMISSIONS.RAB_WRITE,
      PERMISSIONS.RAB_SUBMIT,
      PERMISSIONS.WO_WRITE,
      PERMISSIONS.WO_APPROVE,
      PERMISSIONS.MR_APPROVE,
      PERMISSIONS.INDENT_APPROVE_L2,
      PERMISSIONS.PO_APPROVE_L1,
      PERMISSIONS.ISSUE_APPROVE,
      PERMISSIONS.TRANSFER_APPROVE,
      PERMISSIONS.REPORTS_EXPORT,
    ],
    isSystem: true,
  },
  {
    key: ROLE_KEYS.USER,
    name: "User",
    description:
      "Backing role for the USER user type. Field-level data entry. " +
      "Creates DPRs, MRs, GRNs. No approval rights.",
    permissions: [
      PERMISSIONS.BOQ_READ,
      PERMISSIONS.DPR_READ,
      PERMISSIONS.DPR_WRITE,
      PERMISSIONS.DPR_SUBMIT,
      PERMISSIONS.RAB_READ,
      PERMISSIONS.WO_READ,
      PERMISSIONS.MR_READ,
      PERMISSIONS.MR_WRITE,
      PERMISSIONS.MR_SUBMIT,
      PERMISSIONS.INDENT_READ,
      PERMISSIONS.PO_READ,
      PERMISSIONS.GRN_READ,
      PERMISSIONS.GRN_WRITE,
      PERMISSIONS.ISSUE_READ,
      PERMISSIONS.QUALITY_READ,
      PERMISSIONS.QUALITY_WRITE,
      PERMISSIONS.SAFETY_READ,
      PERMISSIONS.MASTERS_READ,
    ],
    isSystem: true,
  },
];

// Approval step-actor gating is now fully DB-driven: the per-step pinned
// user / role lives on cn_approval_workflow_step and is enforced by
// `canActOnStep` in src/lib/approvals/workflow-rbac.ts. The static
// (entityType, stepOrder) → permission matrix that used to live here has
// been retired.
