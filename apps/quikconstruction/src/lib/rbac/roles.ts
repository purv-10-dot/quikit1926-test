/**
 * System Role Definitions
 *
 * 12 canonical roles for QuikConstruction. Each role declares the exact
 * set of permission keys it carries. The seed script reads this and
 * creates the CnRole + CnRolePermission rows.
 *
 * The WILDCARD symbol "*" means "all permissions" — used only by
 * platform_super_admin (cross-tenant) and tenant_admin (within tenant).
 * The seed materializes the wildcard into concrete role_permission rows
 * for one permission each, so the runtime check `permissions.has("boq.lock")`
 * always works without a special-case branch.
 *
 * Naming: keys match `Membership.role` in the DB and are stable. Display
 * names are for UI only.
 */

import { PERMISSIONS, type PermissionKey } from "./permissions";

export const ROLE_KEYS = {
  PLATFORM_SUPER_ADMIN: "platform_super_admin",
  TENANT_ADMIN: "tenant_admin",
  COMPANY_ADMIN: "company_admin",
  PROJECT_DIRECTOR: "project_director",
  PROJECT_MANAGER: "project_manager",
  SITE_ENGINEER: "site_engineer",
  STORE_HEAD: "store_head",
  PURCHASE_MANAGER: "purchase_manager",
  ACCOUNTS_FINANCE: "accounts_finance",
  QA_QC_ENGINEER: "qa_qc_engineer",
  SAFETY_OFFICER: "safety_officer",
  VIEWER_AUDITOR: "viewer_auditor",
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

// ─── Permission bundles (composition helpers) ───────────────────────
// Reused across role definitions so there's no copy-paste drift.

const READ_EVERYTHING: PermissionKey[] = [
  PERMISSIONS.BOQ_READ,
  PERMISSIONS.DPR_READ,
  PERMISSIONS.RAB_READ,
  PERMISSIONS.WO_READ,
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

const STORE_OPERATOR: PermissionKey[] = [
  PERMISSIONS.ISSUE_READ,
  PERMISSIONS.ISSUE_WRITE,
  PERMISSIONS.TRANSFER_READ,
  PERMISSIONS.TRANSFER_WRITE,
  PERMISSIONS.RECON_READ,
  PERMISSIONS.RECON_WRITE,
  PERMISSIONS.GOOD_RETURN_WRITE,
  PERMISSIONS.GATE_PASS_WRITE,
  PERMISSIONS.DIESEL_LOG_WRITE,
  PERMISSIONS.GRN_READ,
  PERMISSIONS.GRN_WRITE,
];

const PURCHASE_OPERATOR: PermissionKey[] = [
  PERMISSIONS.MR_READ,
  PERMISSIONS.MR_WRITE,
  PERMISSIONS.INDENT_READ,
  PERMISSIONS.INDENT_WRITE,
  PERMISSIONS.INDENT_SUBMIT,
  PERMISSIONS.PO_READ,
  PERMISSIONS.PO_WRITE,
  PERMISSIONS.PO_DISPATCH,
  PERMISSIONS.GRN_READ,
  PERMISSIONS.GRN_WRITE,
];

// ─── The 12 roles ───────────────────────────────────────────────────

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: ROLE_KEYS.PLATFORM_SUPER_ADMIN,
    name: "Platform Super Admin",
    description:
      "Cross-tenant operator. Manages tenants, feature flags, platform-level settings. " +
      "Can unlock BOQ. Never scoped to a single project.",
    permissions: "*",
    isSystem: true,
  },
  {
    key: ROLE_KEYS.TENANT_ADMIN,
    name: "Tenant Admin",
    description:
      "Full access within one tenant. Manages users, roles, approval workflows. " +
      "Can unlock BOQ on any project within the tenant.",
    permissions: "*",
    isSystem: true,
  },
  {
    key: ROLE_KEYS.COMPANY_ADMIN,
    name: "Company Admin",
    description:
      "Manages a single company within a tenant. Full module access but cannot " +
      "change tenant settings or unlock BOQ.",
    permissions: [
      ...READ_EVERYTHING,
      // BOQ
      PERMISSIONS.BOQ_WRITE,
      PERMISSIONS.BOQ_IMPORT,
      PERMISSIONS.BOQ_LOCK,
      // Projects
      PERMISSIONS.DPR_WRITE,
      PERMISSIONS.DPR_SUBMIT,
      PERMISSIONS.DPR_APPROVE,
      PERMISSIONS.RAB_WRITE,
      PERMISSIONS.RAB_SUBMIT,
      PERMISSIONS.RAB_APPROVE,
      PERMISSIONS.WO_WRITE,
      PERMISSIONS.WO_APPROVE,
      PERMISSIONS.WO_CLOSE,
      // Purchase — final approvals
      PERMISSIONS.MR_APPROVE,
      PERMISSIONS.INDENT_APPROVE_L3,
      PERMISSIONS.PO_APPROVE_L2,
      PERMISSIONS.PO_CLOSE,
      PERMISSIONS.GRN_APPROVE,
      // Store
      PERMISSIONS.ISSUE_APPROVE,
      PERMISSIONS.TRANSFER_APPROVE,
      PERMISSIONS.RECON_APPROVE,
      PERMISSIONS.GOOD_RETURN_APPROVE,
      PERMISSIONS.GATE_PASS_APPROVE,
      // Masters
      PERMISSIONS.MASTERS_WRITE,
      PERMISSIONS.MASTERS_DELETE,
      // Finance-lite
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.FINANCE_EXPORT,
      PERMISSIONS.FINANCE_RECONCILE,
      // Reports
      PERMISSIONS.REPORTS_EXPORT,
      PERMISSIONS.AUDIT_VIEW,
      // Settings within company
      PERMISSIONS.SETTINGS_USERS,
      PERMISSIONS.SETTINGS_WORKFLOWS,
    ],
    isSystem: true,
  },
  {
    key: ROLE_KEYS.PROJECT_DIRECTOR,
    name: "Project Director",
    description:
      "Senior approver across multiple projects. Final-level indent/PO approvals, " +
      "reviews RAB, can lock BOQ. No user management.",
    permissions: [
      ...READ_EVERYTHING,
      // BOQ — can lock, cannot unlock
      PERMISSIONS.BOQ_LOCK,
      // Projects — high-level approvals
      PERMISSIONS.DPR_APPROVE,
      PERMISSIONS.DPR_REVERSE,
      PERMISSIONS.RAB_APPROVE,
      PERMISSIONS.WO_APPROVE,
      // Purchase — L3 indent, L2 PO
      PERMISSIONS.INDENT_APPROVE_L3,
      PERMISSIONS.PO_APPROVE_L2,
      PERMISSIONS.PO_CLOSE,
      // Finance-lite
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.FINANCE_EXPORT,
      // Reports
      PERMISSIONS.REPORTS_EXPORT,
      PERMISSIONS.AUDIT_VIEW,
    ],
    isSystem: true,
  },
  {
    key: ROLE_KEYS.PROJECT_MANAGER,
    name: "Project Manager",
    description:
      "Runs one or more projects day-to-day. Locks BOQ, approves DPRs, approves " +
      "Indent L2. Creates work orders.",
    permissions: [
      ...READ_EVERYTHING,
      // BOQ
      PERMISSIONS.BOQ_WRITE,
      PERMISSIONS.BOQ_IMPORT,
      PERMISSIONS.BOQ_LOCK,
      // DPR / RAB / WO
      PERMISSIONS.DPR_WRITE,
      PERMISSIONS.DPR_SUBMIT,
      PERMISSIONS.DPR_APPROVE,
      PERMISSIONS.RAB_WRITE,
      PERMISSIONS.RAB_SUBMIT,
      PERMISSIONS.WO_WRITE,
      PERMISSIONS.WO_APPROVE,
      // Purchase — mid-level
      PERMISSIONS.MR_APPROVE,
      PERMISSIONS.INDENT_APPROVE_L2,
      PERMISSIONS.PO_APPROVE_L1,
      // Store — approve issues
      PERMISSIONS.ISSUE_APPROVE,
      PERMISSIONS.TRANSFER_APPROVE,
      // Reports
      PERMISSIONS.REPORTS_EXPORT,
    ],
    isSystem: true,
  },
  {
    key: ROLE_KEYS.SITE_ENGINEER,
    name: "Site Engineer",
    description:
      "Field-level data entry. Creates DPRs, MRs, GRNs. No approval rights.",
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
  {
    key: ROLE_KEYS.STORE_HEAD,
    name: "Store Head",
    description:
      "Runs the site store. Approves GRNs and Issues (the two stock-moving events). " +
      "Creates transfers, reconciliations, good returns.",
    permissions: [
      PERMISSIONS.BOQ_READ,
      PERMISSIONS.MR_READ,
      PERMISSIONS.INDENT_READ,
      PERMISSIONS.PO_READ,
      ...STORE_OPERATOR,
      // Store approvals — these are the stock-moving events
      PERMISSIONS.GRN_APPROVE,
      PERMISSIONS.ISSUE_APPROVE,
      PERMISSIONS.TRANSFER_APPROVE,
      PERMISSIONS.RECON_APPROVE,
      PERMISSIONS.GOOD_RETURN_APPROVE,
      PERMISSIONS.GATE_PASS_APPROVE,
      PERMISSIONS.MASTERS_READ,
      PERMISSIONS.REPORTS_READ,
    ],
    isSystem: true,
  },
  {
    key: ROLE_KEYS.PURCHASE_MANAGER,
    name: "Purchase Manager",
    description:
      "Owns the MR→Indent→PO→GRN workflow. Creates POs, dispatches them, " +
      "approves indent L1 (initial vendor-match approval).",
    permissions: [
      PERMISSIONS.BOQ_READ,
      ...PURCHASE_OPERATOR,
      PERMISSIONS.INDENT_APPROVE_L1,
      PERMISSIONS.PO_CLOSE,
      PERMISSIONS.MASTERS_READ,
      PERMISSIONS.MASTERS_WRITE, // vendors, items, UOMs
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.REPORTS_EXPORT,
    ],
    isSystem: true,
  },
  {
    key: ROLE_KEYS.ACCOUNTS_FINANCE,
    name: "Accounts & Finance",
    description:
      "RAB billing, finance-lite actions, GRN accounts-export. Read-only BOQ, " +
      "approves RAB after review.",
    permissions: [
      PERMISSIONS.BOQ_READ,
      PERMISSIONS.DPR_READ,
      PERMISSIONS.RAB_READ,
      PERMISSIONS.RAB_WRITE,
      PERMISSIONS.RAB_SUBMIT,
      PERMISSIONS.RAB_APPROVE,
      PERMISSIONS.RAB_PAY,
      PERMISSIONS.WO_READ,
      PERMISSIONS.PO_READ,
      PERMISSIONS.GRN_READ,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.FINANCE_EXPORT,
      PERMISSIONS.FINANCE_TDS_CONFIG,
      PERMISSIONS.FINANCE_GST_CONFIG,
      PERMISSIONS.FINANCE_RECONCILE,
      PERMISSIONS.MASTERS_READ,
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.REPORTS_EXPORT,
      PERMISSIONS.AUDIT_VIEW,
    ],
    isSystem: true,
  },
  {
    key: ROLE_KEYS.QA_QC_ENGINEER,
    name: "QA/QC Engineer",
    description: "Runs quality inspections, read-only on everything else.",
    permissions: [
      PERMISSIONS.BOQ_READ,
      PERMISSIONS.DPR_READ,
      PERMISSIONS.WO_READ,
      PERMISSIONS.GRN_READ,
      PERMISSIONS.QUALITY_READ,
      PERMISSIONS.QUALITY_WRITE,
      PERMISSIONS.QUALITY_INSPECT,
      PERMISSIONS.MASTERS_READ,
      PERMISSIONS.REPORTS_READ,
    ],
    isSystem: true,
  },
  {
    key: ROLE_KEYS.SAFETY_OFFICER,
    name: "Safety Officer",
    description: "Safety records, incidents, toolbox talks. Read-only on projects.",
    permissions: [
      PERMISSIONS.BOQ_READ,
      PERMISSIONS.DPR_READ,
      PERMISSIONS.WO_READ,
      PERMISSIONS.SAFETY_READ,
      PERMISSIONS.SAFETY_WRITE,
      PERMISSIONS.SAFETY_INCIDENT,
      PERMISSIONS.MASTERS_READ,
      PERMISSIONS.REPORTS_READ,
    ],
    isSystem: true,
  },
  {
    key: ROLE_KEYS.VIEWER_AUDITOR,
    name: "Viewer / Auditor",
    description: "Read-only across every module. Can view the audit log.",
    permissions: [...READ_EVERYTHING, PERMISSIONS.AUDIT_VIEW, PERMISSIONS.REPORTS_EXPORT],
    isSystem: true,
  },
];

// ─── Approval-actor matrix ──────────────────────────────────────────
// Maps (entityType, stepOrder) → required permission for the actor.
// Used by approval-service to enforce "right role at right step".

export interface ApprovalStepActor {
  entityType: string;
  stepOrder: number;
  requiredPermission: PermissionKey;
  stepName: string;
}

export const APPROVAL_ACTOR_MATRIX: ApprovalStepActor[] = [
  // MR — single-step approval (by PM or company_admin)
  { entityType: "mr", stepOrder: 1, requiredPermission: PERMISSIONS.MR_APPROVE, stepName: "PM approval" },

  // Indent — 3 levels
  { entityType: "indent", stepOrder: 1, requiredPermission: PERMISSIONS.INDENT_APPROVE_L1, stepName: "L1 — Purchase Manager" },
  { entityType: "indent", stepOrder: 2, requiredPermission: PERMISSIONS.INDENT_APPROVE_L2, stepName: "L2 — Project Manager" },
  { entityType: "indent", stepOrder: 3, requiredPermission: PERMISSIONS.INDENT_APPROVE_L3, stepName: "L3 — Project Director" },

  // PO — 2 levels
  { entityType: "po", stepOrder: 1, requiredPermission: PERMISSIONS.PO_APPROVE_L1, stepName: "L1 — Project Manager" },
  { entityType: "po", stepOrder: 2, requiredPermission: PERMISSIONS.PO_APPROVE_L2, stepName: "L2 — Project Director" },

  // GRN — single-step (Store Head)
  { entityType: "grn", stepOrder: 1, requiredPermission: PERMISSIONS.GRN_APPROVE, stepName: "Store Head approval" },

  // Issue — single-step (Store Head)
  { entityType: "issue", stepOrder: 1, requiredPermission: PERMISSIONS.ISSUE_APPROVE, stepName: "Store Head approval" },

  // DPR — single-step (PM)
  { entityType: "dpr", stepOrder: 1, requiredPermission: PERMISSIONS.DPR_APPROVE, stepName: "PM approval" },

  // RAB — single-step (Accounts/Finance)
  { entityType: "rab", stepOrder: 1, requiredPermission: PERMISSIONS.RAB_APPROVE, stepName: "Accounts approval" },

  // Transfer
  { entityType: "transfer", stepOrder: 1, requiredPermission: PERMISSIONS.TRANSFER_APPROVE, stepName: "Store Head approval" },

  // Reconciliation
  { entityType: "recon", stepOrder: 1, requiredPermission: PERMISSIONS.RECON_APPROVE, stepName: "Store Head approval" },
];

/** Lookup the required permission for a given (entity, step). */
export function getRequiredPermissionForStep(
  entityType: string,
  stepOrder: number
): PermissionKey | null {
  const entry = APPROVAL_ACTOR_MATRIX.find(
    (a) => a.entityType === entityType && a.stepOrder === stepOrder
  );
  return entry?.requiredPermission ?? null;
}
