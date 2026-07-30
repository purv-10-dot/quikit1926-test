import { NextResponse } from "next/server";

/**
 * Role-based permission gate. Call at the top of any endpoint that
 * mutates approved/finalized state or touches permission-sensitive data.
 *
 * Roles come from session.user.membershipRole via @quikit/auth.
 *
 * Default policy (internal construction ERP):
 *   - owner, admin           → everything
 *   - project_manager        → everything except tenant settings
 *   - accountant             → finance + reports, read others
 *   - site_supervisor        → DPR, safety, read
 *   - member                 → read-only by default
 *
 * Actions map loosely:
 *   approve.*   → owner | admin | project_manager
 *   finalize.*  → owner | admin | accountant
 *   delete.*    → owner | admin
 *   post.*      → owner | admin | project_manager | site_supervisor
 */
export type Role = "owner" | "admin" | "project_manager" | "accountant" | "site_supervisor" | "member" | string;

const PRIVILEGED: Role[] = ["owner", "admin"];
const MANAGER_PLUS: Role[] = ["owner", "admin", "project_manager"];

export function canApprove(role: Role | null | undefined): boolean {
  return !!role && MANAGER_PLUS.includes(role as Role);
}
export function canDelete(role: Role | null | undefined): boolean {
  return !!role && PRIVILEGED.includes(role as Role);
}

/** 403 response helper for use inside route handlers. */
export function forbidden(reason: string) {
  return NextResponse.json({ success: false, error: `Forbidden: ${reason}`, code: "PERMISSION_DENIED" }, { status: 403 });
}

// ─── RBAC Permission Constants & Helpers ────────────────────────────
//
// The full role → permission matrix used by the settings/roles UI.
// Maps to the RBAC spec from Aakar docs.
// Roles: ADMIN, HO_USER, SITE_ADMIN, USER

// ─── Roles ──────────────────────────────────────────────────────────

export const ROLES = {
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

  // Organization (Departments / Banks / FYs / Cost Centers / Companies setup)
  ORGANIZATION_VIEW: "construction.organization.view",
  ORGANIZATION_CREATE: "construction.organization.create",
  ORGANIZATION_EDIT: "construction.organization.edit",
  ORGANIZATION_DELETE: "construction.organization.delete",

  // Quality & Safety
  QUALITY_SAFETY_VIEW: "construction.quality_safety.view",
  QUALITY_SAFETY_CREATE: "construction.quality_safety.create",
  QUALITY_SAFETY_EDIT: "construction.quality_safety.edit",

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
  PR_EDIT: "construction.pr.edit",
  PR_DELETE: "construction.pr.delete",
  PR_APPROVE: "construction.pr.approve",
  INDENT_VIEW: "construction.indent.view",
  INDENT_CREATE: "construction.indent.create",
  INDENT_EDIT: "construction.indent.edit",
  INDENT_DELETE: "construction.indent.delete",
  INDENT_APPROVE: "construction.indent.approve",
  RFQ_VIEW: "construction.rfq.view",
  RFQ_CREATE: "construction.rfq.create",
  RFQ_EDIT: "construction.rfq.edit",
  RFQ_DELETE: "construction.rfq.delete",
  RFQ_APPROVE: "construction.rfq.approve",
  PO_VIEW: "construction.po.view",
  PO_CREATE: "construction.po.create",
  PO_EDIT: "construction.po.edit",
  PO_DELETE: "construction.po.delete",
  PO_APPROVE: "construction.po.approve",
  GRN_VIEW: "construction.grn.view",
  GRN_CREATE: "construction.grn.create",
  GRN_EDIT: "construction.grn.edit",
  GRN_DELETE: "construction.grn.delete",
  GRN_APPROVE: "construction.grn.approve",

  // Store
  STOCK_VIEW: "construction.stock.view",
  ISSUE_VIEW: "construction.issue.view",
  ISSUE_CREATE: "construction.issue.create",
  ISSUE_EDIT: "construction.issue.edit",
  ISSUE_DELETE: "construction.issue.delete",
  ISSUE_APPROVE: "construction.issue.approve",
  GATEPASS_VIEW: "construction.gatepass.view",
  GATEPASS_CREATE: "construction.gatepass.create",
  GATEPASS_EDIT: "construction.gatepass.edit",
  GATEPASS_DELETE: "construction.gatepass.delete",
  GATEPASS_APPROVE: "construction.gatepass.approve",
  RETURN_VIEW: "construction.return.view",
  RETURN_CREATE: "construction.return.create",
  RETURN_EDIT: "construction.return.edit",
  RETURN_DELETE: "construction.return.delete",
  RETURN_APPROVE: "construction.return.approve",
  TRANSFER_VIEW: "construction.transfer.view",
  TRANSFER_CREATE: "construction.transfer.create",
  TRANSFER_EDIT: "construction.transfer.edit",
  TRANSFER_DELETE: "construction.transfer.delete",
  TRANSFER_APPROVE: "construction.transfer.approve",
  TRANSFER_RECEIVE: "construction.transfer.receive",
  RECONCILIATION_VIEW: "construction.reconciliation.view",
  RECONCILIATION_CREATE: "construction.reconciliation.create",
  RECONCILIATION_EDIT: "construction.reconciliation.edit",
  RECONCILIATION_DELETE: "construction.reconciliation.delete",
  RECONCILIATION_APPROVE: "construction.reconciliation.approve",
  DIESEL_VIEW: "construction.diesel.view",
  DIESEL_CREATE: "construction.diesel.create",
  DIESEL_EDIT: "construction.diesel.edit",
  DIESEL_DELETE: "construction.diesel.delete",

  // Machinery & Equipment
  EQUIPMENT_LOG_VIEW: "construction.equipment_log.view",
  EQUIPMENT_LOG_CREATE: "construction.equipment_log.create",
  EQUIPMENT_LOG_EDIT: "construction.equipment_log.edit",
  EQUIPMENT_LOG_DELETE: "construction.equipment_log.delete",
  EQUIPMENT_LOG_APPROVE: "construction.equipment_log.approve",

  EQUIPMENT_MAINT_VIEW: "construction.equipment_maintenance.view",
  EQUIPMENT_MAINT_CREATE: "construction.equipment_maintenance.create",
  EQUIPMENT_MAINT_EDIT: "construction.equipment_maintenance.edit",
  EQUIPMENT_MAINT_DELETE: "construction.equipment_maintenance.delete",

  EQUIPMENT_DEPLOY_VIEW: "construction.equipment_deployment.view",
  EQUIPMENT_DEPLOY_CREATE: "construction.equipment_deployment.create",
  EQUIPMENT_DEPLOY_EDIT: "construction.equipment_deployment.edit",
  EQUIPMENT_DEPLOY_DELETE: "construction.equipment_deployment.delete",
  EQUIPMENT_FLEET_VIEW: "construction.equipment_fleet.view",
  EQUIPMENT_HIRE_RENT_VIEW: "construction.equipment_hire_rent.view",
  EQUIPMENT_HIRE_RENT_CREATE: "construction.equipment_hire_rent.create",
  EQUIPMENT_HIRE_RENT_EDIT: "construction.equipment_hire_rent.edit",
  EQUIPMENT_FIXED_ASSETS_VIEW: "construction.equipment_fixed_assets.view",
  EQUIPMENT_FIXED_ASSETS_CREATE: "construction.equipment_fixed_assets.create",
  EQUIPMENT_FIXED_ASSETS_EDIT: "construction.equipment_fixed_assets.edit",

  // Projects
  PROJECT_VIEW: "construction.project.view",
  PROJECT_CREATE: "construction.project.create",
  PROJECT_EDIT: "construction.project.edit",
  PROJECT_DELETE: "construction.project.delete",
  BOQ_VIEW: "construction.boq.view",
  BOQ_CREATE: "construction.boq.create",
  BOQ_EDIT: "construction.boq.edit",
  BOQ_DELETE: "construction.boq.delete",
  BOQ_IMPORT: "construction.boq.import",
  BOQ_LOCK: "construction.boq.lock",
  WBS_VIEW: "construction.wbs.view",
  WBS_CREATE: "construction.wbs.create",
  WBS_EDIT: "construction.wbs.edit",
  WBS_DELETE: "construction.wbs.delete",
  FINANCE_VIEW: "construction.finance.view",
  FINANCE_CREATE: "construction.finance.create",
  FINANCE_EDIT: "construction.finance.edit",
  FINANCE_DELETE: "construction.finance.delete",
  FINANCE_APPROVE: "construction.finance.approve",
  ESTIMATION_VIEW: "construction.estimation.view",
  ESTIMATION_CREATE: "construction.estimation.create",
  ESTIMATION_EDIT: "construction.estimation.edit",
  ESTIMATION_DELETE: "construction.estimation.delete",
  ESTIMATION_APPROVE: "construction.estimation.approve",
  WO_VIEW: "construction.wo.view",
  WO_CREATE: "construction.wo.create",
  WO_EDIT: "construction.wo.edit",
  WO_DELETE: "construction.wo.delete",
  WO_APPROVE: "construction.wo.approve",
  DPR_VIEW: "construction.dpr.view",
  DPR_CREATE: "construction.dpr.create",
  DPR_EDIT: "construction.dpr.edit",
  DPR_DELETE: "construction.dpr.delete",
  DPR_APPROVE: "construction.dpr.approve",
  DPR_REVERSE: "construction.dpr.reverse",
  RAB_VIEW: "construction.rab.view",
  RAB_CREATE: "construction.rab.create",
  RAB_EDIT: "construction.rab.edit",
  RAB_DELETE: "construction.rab.delete",
  RAB_APPROVE: "construction.rab.approve",
  // Gantt View is read-only. Hindrance Register is full CRUD. Both used to
  // piggy-back on construction.dpr, which coupled their permissions to DPR's
  // — an unchecked Hindrance/Gantt row stripped DPR's grants. They now own
  // their resources so each page's permissions are independent.
  GANTT_VIEW: "construction.gantt.view",
  HINDRANCE_VIEW: "construction.hindrance.view",
  HINDRANCE_CREATE: "construction.hindrance.create",
  HINDRANCE_EDIT: "construction.hindrance.edit",
  HINDRANCE_DELETE: "construction.hindrance.delete",
  // Documents used to piggy-back on construction.project (shared with the
  // Masters "Projects" page), coupling the two. It now owns its resource so
  // Documents and Projects permissions are independent.
  DOCUMENTS_VIEW: "construction.documents.view",
  DOCUMENTS_CREATE: "construction.documents.create",
  DOCUMENTS_EDIT: "construction.documents.edit",
  DOCUMENTS_DELETE: "construction.documents.delete",

  // Settings
  SETTINGS_MANAGE: "construction.settings.manage",
  USERS_MANAGE: "construction.users.manage",
  ROLES_MANAGE: "construction.roles.manage",
  WORKFLOWS_MANAGE: "construction.workflows.manage",
} as const;

// ─── Role → Permission Matrix ───────────────────────────────────────

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

const ROLE_PERMISSIONS: Record<ConstructionRole, string[]> = {
  admin: ALL_PERMISSIONS,
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
    PERMISSIONS.GANTT_VIEW,
    PERMISSIONS.HINDRANCE_VIEW,
    PERMISSIONS.DOCUMENTS_VIEW,
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
    PERMISSIONS.EQUIPMENT_LOG_VIEW, PERMISSIONS.EQUIPMENT_LOG_CREATE,
    PERMISSIONS.EQUIPMENT_LOG_EDIT, PERMISSIONS.EQUIPMENT_LOG_APPROVE,
    PERMISSIONS.EQUIPMENT_MAINT_VIEW, PERMISSIONS.EQUIPMENT_MAINT_CREATE,
    PERMISSIONS.EQUIPMENT_MAINT_EDIT,
    PERMISSIONS.EQUIPMENT_DEPLOY_VIEW, PERMISSIONS.EQUIPMENT_DEPLOY_CREATE,
    PERMISSIONS.EQUIPMENT_DEPLOY_EDIT,
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.BOQ_VIEW,
    PERMISSIONS.WO_VIEW,
    PERMISSIONS.DPR_VIEW, PERMISSIONS.DPR_CREATE, PERMISSIONS.DPR_APPROVE,
    PERMISSIONS.GANTT_VIEW,
    PERMISSIONS.HINDRANCE_VIEW, PERMISSIONS.HINDRANCE_CREATE, PERMISSIONS.HINDRANCE_EDIT, PERMISSIONS.HINDRANCE_DELETE,
    PERMISSIONS.DOCUMENTS_VIEW, PERMISSIONS.DOCUMENTS_CREATE, PERMISSIONS.DOCUMENTS_EDIT, PERMISSIONS.DOCUMENTS_DELETE,
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
    PERMISSIONS.GANTT_VIEW,
    PERMISSIONS.HINDRANCE_VIEW, PERMISSIONS.HINDRANCE_CREATE,
    PERMISSIONS.DOCUMENTS_VIEW, PERMISSIONS.DOCUMENTS_CREATE,
    PERMISSIONS.EQUIPMENT_LOG_VIEW, PERMISSIONS.EQUIPMENT_LOG_CREATE,
    PERMISSIONS.EQUIPMENT_MAINT_VIEW, PERMISSIONS.EQUIPMENT_MAINT_CREATE,
    PERMISSIONS.EQUIPMENT_DEPLOY_VIEW, PERMISSIONS.EQUIPMENT_DEPLOY_CREATE,
  ],
};


export function hasPermission(
  userPermissions: string[],
  required: string
): boolean {
  return userPermissions.includes(required);
}

