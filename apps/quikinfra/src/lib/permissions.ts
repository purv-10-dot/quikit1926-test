/**
 * QuikInfra — RBAC Permission Constants & Helpers
 *
 * Maps to the RBAC spec from Aakar docs.
 * Roles: SUPER_ADMIN, COMPANY_ADMIN, ADMIN, HO_USER, SITE_ADMIN, USER
 */

// ─── Roles ──────────────────────────────────────────────────────────

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  COMPANY_ADMIN: "company_admin",
  ADMIN: "admin",
  HO_USER: "ho_user",
  SITE_ADMIN: "site_admin",
  USER: "user",
} as const;

export type ConstructionRole = (typeof ROLES)[keyof typeof ROLES];

// ─── Permission Keys ────────────────────────────────────────────────

export const PERMISSIONS = {
  // Dashboard
  DASHBOARD_VIEW: "construction.dashboard.view",

  // Masters
  MASTERS_VIEW: "construction.masters.view",
  MASTERS_CREATE: "construction.masters.create",
  MASTERS_EDIT: "construction.masters.edit",
  MASTERS_DELETE: "construction.masters.delete",
  MASTERS_IMPORT: "construction.masters.import",
  MASTERS_EXPORT: "construction.masters.export",

  // Purchase
  PR_VIEW: "construction.pr.view",
  PR_CREATE: "construction.pr.create",
  PR_APPROVE: "construction.pr.approve",
  INDENT_VIEW: "construction.indent.view",
  INDENT_CREATE: "construction.indent.create",
  INDENT_APPROVE: "construction.indent.approve",
  RFQ_VIEW: "construction.rfq.view",
  RFQ_CREATE: "construction.rfq.create",
  PO_VIEW: "construction.po.view",
  PO_CREATE: "construction.po.create",
  PO_APPROVE: "construction.po.approve",
  GRN_VIEW: "construction.grn.view",
  GRN_CREATE: "construction.grn.create",
  GRN_APPROVE: "construction.grn.approve",

  // Store
  STOCK_VIEW: "construction.stock.view",
  ISSUE_VIEW: "construction.issue.view",
  ISSUE_CREATE: "construction.issue.create",
  GATEPASS_VIEW: "construction.gatepass.view",
  GATEPASS_CREATE: "construction.gatepass.create",
  RETURN_VIEW: "construction.return.view",
  RETURN_CREATE: "construction.return.create",
  TRANSFER_VIEW: "construction.transfer.view",
  TRANSFER_CREATE: "construction.transfer.create",
  TRANSFER_RECEIVE: "construction.transfer.receive",
  RECONCILIATION_VIEW: "construction.reconciliation.view",
  RECONCILIATION_CREATE: "construction.reconciliation.create",
  DIESEL_VIEW: "construction.diesel.view",
  DIESEL_CREATE: "construction.diesel.create",

  // Projects
  PROJECT_VIEW: "construction.project.view",
  PROJECT_CREATE: "construction.project.create",
  PROJECT_EDIT: "construction.project.edit",
  BOQ_VIEW: "construction.boq.view",
  BOQ_CREATE: "construction.boq.create",
  BOQ_IMPORT: "construction.boq.import",
  ESTIMATION_VIEW: "construction.estimation.view",
  ESTIMATION_CREATE: "construction.estimation.create",
  WO_VIEW: "construction.wo.view",
  WO_CREATE: "construction.wo.create",
  WO_APPROVE: "construction.wo.approve",
  DPR_VIEW: "construction.dpr.view",
  DPR_CREATE: "construction.dpr.create",
  DPR_APPROVE: "construction.dpr.approve",
  DPR_REVERSE: "construction.dpr.reverse",
  RAB_VIEW: "construction.rab.view",
  RAB_CREATE: "construction.rab.create",

  // Settings
  SETTINGS_MANAGE: "construction.settings.manage",
  USERS_MANAGE: "construction.users.manage",
  ROLES_MANAGE: "construction.roles.manage",
  WORKFLOWS_MANAGE: "construction.workflows.manage",
} as const;

// ─── Role → Permission Matrix ───────────────────────────────────────

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

const ROLE_PERMISSIONS: Record<ConstructionRole, string[]> = {
  super_admin: ALL_PERMISSIONS,
  company_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter(
    (p) => p !== PERMISSIONS.DPR_REVERSE && !p.includes("settings")
  ),
  ho_user: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.MASTERS_VIEW,
    PERMISSIONS.PR_VIEW, PERMISSIONS.PR_CREATE,
    PERMISSIONS.INDENT_VIEW, PERMISSIONS.INDENT_CREATE,
    PERMISSIONS.PO_VIEW, PERMISSIONS.PO_CREATE, PERMISSIONS.PO_APPROVE,
    PERMISSIONS.GRN_VIEW,
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.BOQ_VIEW,
    PERMISSIONS.WO_VIEW, PERMISSIONS.WO_APPROVE,
    PERMISSIONS.DPR_VIEW, PERMISSIONS.DPR_APPROVE,
    PERMISSIONS.RAB_VIEW,
    PERMISSIONS.MASTERS_EXPORT,
  ],
  site_admin: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.MASTERS_VIEW,
    PERMISSIONS.PR_VIEW, PERMISSIONS.PR_CREATE, PERMISSIONS.PR_APPROVE,
    PERMISSIONS.INDENT_VIEW, PERMISSIONS.INDENT_CREATE, PERMISSIONS.INDENT_APPROVE,
    PERMISSIONS.PO_VIEW,
    PERMISSIONS.GRN_VIEW, PERMISSIONS.GRN_CREATE,
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.ISSUE_VIEW, PERMISSIONS.ISSUE_CREATE,
    PERMISSIONS.GATEPASS_VIEW, PERMISSIONS.GATEPASS_CREATE,
    PERMISSIONS.RETURN_VIEW, PERMISSIONS.RETURN_CREATE,
    PERMISSIONS.TRANSFER_VIEW, PERMISSIONS.TRANSFER_CREATE, PERMISSIONS.TRANSFER_RECEIVE,
    PERMISSIONS.RECONCILIATION_VIEW, PERMISSIONS.RECONCILIATION_CREATE,
    PERMISSIONS.DIESEL_VIEW, PERMISSIONS.DIESEL_CREATE,
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.BOQ_VIEW,
    PERMISSIONS.WO_VIEW,
    PERMISSIONS.DPR_VIEW, PERMISSIONS.DPR_CREATE, PERMISSIONS.DPR_APPROVE,
    PERMISSIONS.RAB_VIEW,
  ],
  user: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.MASTERS_VIEW,
    PERMISSIONS.PR_VIEW, PERMISSIONS.PR_CREATE,
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.ISSUE_VIEW,
    PERMISSIONS.GATEPASS_VIEW,
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.BOQ_VIEW,
    PERMISSIONS.DPR_VIEW, PERMISSIONS.DPR_CREATE,
  ],
};

export function getPermissionsForRole(role: ConstructionRole): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(
  userPermissions: string[],
  required: string
): boolean {
  return userPermissions.includes(required);
}

export function hasAnyPermission(
  userPermissions: string[],
  required: string[]
): boolean {
  return required.some((p) => userPermissions.includes(p));
}
