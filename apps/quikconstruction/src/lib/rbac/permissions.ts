/**
 * Permission Catalog — Single Source of Truth
 *
 * Every permission the app knows about is declared in this file. The seed
 * script, server guards (`requirePermission`), and UI gate (`<Can>`) all
 * import from here — never hardcode string keys elsewhere.
 *
 * Naming convention: `<module>.<entity>.<action>` or `<module>.<action>`
 *
 * Adding a permission:
 *   1. Add the constant here.
 *   2. Attach it to one or more roles in `roles.ts`.
 *   3. Re-run `prisma db seed` to sync the database.
 */

export const PERMISSIONS = {
  // ─── BOQ ─────────────────────────────────────────────────────────
  BOQ_READ: "boq.read",
  BOQ_WRITE: "boq.write", // manual add item
  BOQ_IMPORT: "boq.import",
  BOQ_LOCK: "boq.lock",
  BOQ_UNLOCK: "boq.unlock", // SUPER-ADMIN only by default

  // ─── DPR ─────────────────────────────────────────────────────────
  DPR_READ: "dpr.read",
  DPR_WRITE: "dpr.write",
  DPR_SUBMIT: "dpr.submit",
  DPR_APPROVE: "dpr.approve",
  DPR_REVERSE: "dpr.reverse",

  // ─── RAB (Running Account Bill) ──────────────────────────────────
  RAB_READ: "rab.read",
  RAB_WRITE: "rab.write",
  RAB_SUBMIT: "rab.submit",
  RAB_APPROVE: "rab.approve",
  RAB_PAY: "rab.pay",

  // ─── Work Orders ─────────────────────────────────────────────────
  WO_READ: "wo.read",
  WO_WRITE: "wo.write",
  WO_APPROVE: "wo.approve",
  WO_CLOSE: "wo.close",

  // ─── Purchase → MR ───────────────────────────────────────────────
  MR_READ: "purchase.mr.read",
  MR_WRITE: "purchase.mr.write",
  MR_SUBMIT: "purchase.mr.submit",
  MR_APPROVE: "purchase.mr.approve",

  // ─── Purchase → Indent ───────────────────────────────────────────
  INDENT_READ: "purchase.indent.read",
  INDENT_WRITE: "purchase.indent.write",
  INDENT_SUBMIT: "purchase.indent.submit",
  INDENT_APPROVE_L1: "purchase.indent.approve_l1",
  INDENT_APPROVE_L2: "purchase.indent.approve_l2",
  INDENT_APPROVE_L3: "purchase.indent.approve_l3",

  // ─── Purchase → PO ───────────────────────────────────────────────
  PO_READ: "purchase.po.read",
  PO_WRITE: "purchase.po.write",
  PO_APPROVE_L1: "purchase.po.approve_l1",
  PO_APPROVE_L2: "purchase.po.approve_l2",
  PO_DISPATCH: "purchase.po.dispatch",
  PO_CLOSE: "purchase.po.close",

  // ─── Purchase → GRN ──────────────────────────────────────────────
  GRN_READ: "purchase.grn.read",
  GRN_WRITE: "purchase.grn.write",
  GRN_APPROVE: "purchase.grn.approve",
  GRN_REVERSE: "purchase.grn.reverse",

  // ─── Store → Issue ───────────────────────────────────────────────
  ISSUE_READ: "store.issue.read",
  ISSUE_WRITE: "store.issue.write",
  ISSUE_APPROVE: "store.issue.approve",

  // ─── Store → Transfer ────────────────────────────────────────────
  TRANSFER_READ: "store.transfer.read",
  TRANSFER_WRITE: "store.transfer.write",
  TRANSFER_APPROVE: "store.transfer.approve",

  // ─── Store → Reconciliation ──────────────────────────────────────
  RECON_READ: "store.recon.read",
  RECON_WRITE: "store.recon.write",
  RECON_APPROVE: "store.recon.approve",

  // ─── Store → Good Return / Gate Pass / Diesel ────────────────────
  GOOD_RETURN_WRITE: "store.good_return.write",
  GOOD_RETURN_APPROVE: "store.good_return.approve",
  GATE_PASS_WRITE: "store.gate_pass.write",
  GATE_PASS_APPROVE: "store.gate_pass.approve",
  DIESEL_LOG_WRITE: "store.diesel.write",

  // ─── Quality / Safety ────────────────────────────────────────────
  QUALITY_READ: "quality.read",
  QUALITY_WRITE: "quality.write",
  QUALITY_INSPECT: "quality.inspect",
  SAFETY_READ: "safety.read",
  SAFETY_WRITE: "safety.write",
  SAFETY_INCIDENT: "safety.incident.report",

  // ─── Masters ─────────────────────────────────────────────────────
  MASTERS_READ: "masters.read",
  MASTERS_WRITE: "masters.write",
  MASTERS_DELETE: "masters.delete",

  // ─── Finance-lite ────────────────────────────────────────────────
  FINANCE_VIEW: "finance.view",
  FINANCE_EXPORT: "finance.export",
  FINANCE_TDS_CONFIG: "finance.tds_config",
  FINANCE_GST_CONFIG: "finance.gst_config",
  FINANCE_RECONCILE: "finance.reconcile",

  // ─── Settings / Admin ────────────────────────────────────────────
  SETTINGS_USERS: "settings.users",
  SETTINGS_ROLES: "settings.roles",
  SETTINGS_WORKFLOWS: "settings.workflows",
  SETTINGS_TENANTS: "settings.tenants", // platform-level
  SETTINGS_FEATURE_FLAGS: "settings.feature_flags",

  // ─── Reports / Audit ─────────────────────────────────────────────
  REPORTS_READ: "reports.read",
  REPORTS_EXPORT: "reports.export",
  AUDIT_VIEW: "audit.view",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Flat list of all permission keys — used by the seed script. */
export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);

/** Metadata for each permission — name, module, description. */
export interface PermissionDescriptor {
  key: PermissionKey;
  name: string;
  module: string;
  description?: string;
}

/**
 * Human-readable metadata for every permission. Seed consumes this directly.
 * Keeping it next to the keys means there's no risk of drift.
 */
export const PERMISSION_CATALOG: PermissionDescriptor[] = [
  // BOQ
  { key: PERMISSIONS.BOQ_READ, name: "View BOQ", module: "boq" },
  { key: PERMISSIONS.BOQ_WRITE, name: "Add manual BOQ item", module: "boq" },
  { key: PERMISSIONS.BOQ_IMPORT, name: "Import BOQ from Excel", module: "boq" },
  { key: PERMISSIONS.BOQ_LOCK, name: "Lock BOQ (freezes tender data)", module: "boq" },
  { key: PERMISSIONS.BOQ_UNLOCK, name: "Unlock BOQ (Super Admin override)", module: "boq" },
  // DPR
  { key: PERMISSIONS.DPR_READ, name: "View DPRs", module: "dpr" },
  { key: PERMISSIONS.DPR_WRITE, name: "Create/edit DPR", module: "dpr" },
  { key: PERMISSIONS.DPR_SUBMIT, name: "Submit DPR for approval", module: "dpr" },
  { key: PERMISSIONS.DPR_APPROVE, name: "Approve DPR (posts to BOQ)", module: "dpr" },
  { key: PERMISSIONS.DPR_REVERSE, name: "Reverse approved DPR", module: "dpr" },
  // RAB
  { key: PERMISSIONS.RAB_READ, name: "View RABs", module: "rab" },
  { key: PERMISSIONS.RAB_WRITE, name: "Create/edit RAB", module: "rab" },
  { key: PERMISSIONS.RAB_SUBMIT, name: "Submit RAB for approval", module: "rab" },
  { key: PERMISSIONS.RAB_APPROVE, name: "Approve RAB (posts billing)", module: "rab" },
  { key: PERMISSIONS.RAB_PAY, name: "Mark RAB as paid", module: "rab" },
  // WO
  { key: PERMISSIONS.WO_READ, name: "View work orders", module: "wo" },
  { key: PERMISSIONS.WO_WRITE, name: "Create/edit work order", module: "wo" },
  { key: PERMISSIONS.WO_APPROVE, name: "Approve work order", module: "wo" },
  { key: PERMISSIONS.WO_CLOSE, name: "Close work order", module: "wo" },
  // Purchase
  { key: PERMISSIONS.MR_READ, name: "View Material Requisitions", module: "purchase" },
  { key: PERMISSIONS.MR_WRITE, name: "Create/edit MR", module: "purchase" },
  { key: PERMISSIONS.MR_SUBMIT, name: "Submit MR", module: "purchase" },
  { key: PERMISSIONS.MR_APPROVE, name: "Approve MR", module: "purchase" },
  { key: PERMISSIONS.INDENT_READ, name: "View Indents", module: "purchase" },
  { key: PERMISSIONS.INDENT_WRITE, name: "Create/edit Indent", module: "purchase" },
  { key: PERMISSIONS.INDENT_SUBMIT, name: "Submit Indent", module: "purchase" },
  { key: PERMISSIONS.INDENT_APPROVE_L1, name: "Approve Indent L1", module: "purchase" },
  { key: PERMISSIONS.INDENT_APPROVE_L2, name: "Approve Indent L2", module: "purchase" },
  { key: PERMISSIONS.INDENT_APPROVE_L3, name: "Approve Indent L3", module: "purchase" },
  { key: PERMISSIONS.PO_READ, name: "View Purchase Orders", module: "purchase" },
  { key: PERMISSIONS.PO_WRITE, name: "Create/edit PO", module: "purchase" },
  { key: PERMISSIONS.PO_APPROVE_L1, name: "Approve PO L1", module: "purchase" },
  { key: PERMISSIONS.PO_APPROVE_L2, name: "Approve PO L2", module: "purchase" },
  { key: PERMISSIONS.PO_DISPATCH, name: "Dispatch PO", module: "purchase" },
  { key: PERMISSIONS.PO_CLOSE, name: "Close PO", module: "purchase" },
  { key: PERMISSIONS.GRN_READ, name: "View GRNs", module: "purchase" },
  { key: PERMISSIONS.GRN_WRITE, name: "Create/edit GRN", module: "purchase" },
  { key: PERMISSIONS.GRN_APPROVE, name: "Approve GRN (posts inward stock)", module: "purchase" },
  { key: PERMISSIONS.GRN_REVERSE, name: "Reverse approved GRN", module: "purchase" },
  // Store
  { key: PERMISSIONS.ISSUE_READ, name: "View Material Issues", module: "store" },
  { key: PERMISSIONS.ISSUE_WRITE, name: "Create/edit Issue", module: "store" },
  { key: PERMISSIONS.ISSUE_APPROVE, name: "Approve Issue (deducts stock)", module: "store" },
  { key: PERMISSIONS.TRANSFER_READ, name: "View Stock Transfers", module: "store" },
  { key: PERMISSIONS.TRANSFER_WRITE, name: "Create/edit Transfer", module: "store" },
  { key: PERMISSIONS.TRANSFER_APPROVE, name: "Approve Transfer", module: "store" },
  { key: PERMISSIONS.RECON_READ, name: "View Reconciliations", module: "store" },
  { key: PERMISSIONS.RECON_WRITE, name: "Create/edit Reconciliation", module: "store" },
  { key: PERMISSIONS.RECON_APPROVE, name: "Approve Reconciliation", module: "store" },
  { key: PERMISSIONS.GOOD_RETURN_WRITE, name: "Create Good Return", module: "store" },
  { key: PERMISSIONS.GOOD_RETURN_APPROVE, name: "Approve Good Return", module: "store" },
  { key: PERMISSIONS.GATE_PASS_WRITE, name: "Create Gate Pass", module: "store" },
  { key: PERMISSIONS.GATE_PASS_APPROVE, name: "Approve Gate Pass", module: "store" },
  { key: PERMISSIONS.DIESEL_LOG_WRITE, name: "Write Diesel Log", module: "store" },
  // Quality / Safety
  { key: PERMISSIONS.QUALITY_READ, name: "View quality records", module: "quality" },
  { key: PERMISSIONS.QUALITY_WRITE, name: "Create/edit quality records", module: "quality" },
  { key: PERMISSIONS.QUALITY_INSPECT, name: "Run inspection checklist", module: "quality" },
  { key: PERMISSIONS.SAFETY_READ, name: "View safety records", module: "safety" },
  { key: PERMISSIONS.SAFETY_WRITE, name: "Create/edit safety records", module: "safety" },
  { key: PERMISSIONS.SAFETY_INCIDENT, name: "Report safety incident", module: "safety" },
  // Masters
  { key: PERMISSIONS.MASTERS_READ, name: "View masters", module: "masters" },
  { key: PERMISSIONS.MASTERS_WRITE, name: "Create/edit masters", module: "masters" },
  { key: PERMISSIONS.MASTERS_DELETE, name: "Delete masters", module: "masters" },
  // Finance
  { key: PERMISSIONS.FINANCE_VIEW, name: "View finance dashboards", module: "finance" },
  { key: PERMISSIONS.FINANCE_EXPORT, name: "Export finance data", module: "finance" },
  { key: PERMISSIONS.FINANCE_TDS_CONFIG, name: "Configure TDS codes", module: "finance" },
  { key: PERMISSIONS.FINANCE_GST_CONFIG, name: "Configure GST codes", module: "finance" },
  { key: PERMISSIONS.FINANCE_RECONCILE, name: "Reconcile bank/ledger", module: "finance" },
  // Settings
  { key: PERMISSIONS.SETTINGS_USERS, name: "Manage users", module: "settings" },
  { key: PERMISSIONS.SETTINGS_ROLES, name: "Manage roles & permissions", module: "settings" },
  { key: PERMISSIONS.SETTINGS_WORKFLOWS, name: "Manage approval workflows", module: "settings" },
  { key: PERMISSIONS.SETTINGS_TENANTS, name: "Manage tenants (platform)", module: "settings" },
  { key: PERMISSIONS.SETTINGS_FEATURE_FLAGS, name: "Toggle feature flags", module: "settings" },
  // Reports / Audit
  { key: PERMISSIONS.REPORTS_READ, name: "View reports", module: "reports" },
  { key: PERMISSIONS.REPORTS_EXPORT, name: "Export reports", module: "reports" },
  { key: PERMISSIONS.AUDIT_VIEW, name: "View audit log", module: "audit" },
];
