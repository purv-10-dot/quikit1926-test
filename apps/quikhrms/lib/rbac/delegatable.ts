/**
 * Single source of truth for what a user can hand off via Delegation.
 *
 * A module groups the specific permission codes ("authorities") inside it. When
 * someone sets up a delegation they pick a module and, optionally, a subset of
 * its authorities — but the picker only ever offers codes the delegator actually
 * holds, and the server re-checks that at grant time (see
 * `resolveDelegatedPermissions` in lib/with-auth.ts). So a delegatee can never
 * receive more than the delegator has.
 *
 * `Delegation.modules` (JSON) stores either:
 *   - a plain module name (legacy)                → grants ALL codes in that module
 *   - `{ module, permissions: [...codes] }`       → grants exactly those codes
 */
export interface DelegationCatalogEntry {
  module: string;
  label: string;
  permissions: { code: string; label: string }[];
}

export const DELEGATION_CATALOG: DelegationCatalogEntry[] = [
  { module: "Leave", label: "Leave", permissions: [
    { code: "hrms.leave.apply", label: "Apply Leave" },
    { code: "hrms.leave.approve", label: "Approve Leave" },
    { code: "hrms.leave.manage", label: "Manage Policies" },
  ] },
  { module: "Expense", label: "Expense", permissions: [
    { code: "hrms.expense.submit", label: "Submit Expense" },
    { code: "hrms.expense.approve", label: "Approve Expense" },
    { code: "hrms.expense.manage", label: "Manage Policies" },
  ] },
  { module: "Attendance", label: "Attendance", permissions: [
    { code: "hrms.attendance.punch", label: "Check In/Out" },
    { code: "hrms.attendance.approve", label: "Approve Regularizations" },
    { code: "hrms.attendance.manage", label: "Manage Policies" },
  ] },
  { module: "Recruitment", label: "Recruitment", permissions: [
    { code: "hrms.recruit.write", label: "Manage Recruitment" },
    { code: "hrms.recruit.offer", label: "Manage Offers" },
    { code: "hrms.recruit.interview", label: "Manage Interviews" },
  ] },
  { module: "Roster", label: "Duty Roster", permissions: [
    { code: "hrms.roster.manage", label: "Manage Rosters" },
  ] },
  { module: "Performance", label: "Performance", permissions: [
    { code: "hrms.performance.write", label: "Manage Goals" },
    { code: "hrms.performance.appraise", label: "Run Appraisals" },
    { code: "hrms.performance.pip", label: "Manage PIPs" },
  ] },
  { module: "Document", label: "Document", permissions: [
    { code: "hrms.document.write", label: "Manage Documents" },
    { code: "hrms.document.acknowledge", label: "Acknowledge Documents" },
  ] },
  { module: "Boarding", label: "On/Offboarding", permissions: [
    { code: "hrms.onboarding.write", label: "Manage Onboarding" },
    { code: "hrms.offboarding.write", label: "Manage Offboarding" },
  ] },
  { module: "Engagement", label: "Engagement", permissions: [
    { code: "hrms.engage.announce", label: "Publish Announcements" },
    { code: "hrms.engage.survey.manage", label: "Manage Surveys" },
    { code: "hrms.engage.approve", label: "Approve Engagement" },
  ] },
  { module: "Reports", label: "Reports", permissions: [
    { code: "hrms.reports.manage", label: "Manage Report Templates" },
  ] },
];

/** module name → every permission code it covers (for legacy plain-name grants). */
const MODULE_CODES: Record<string, string[]> = Object.fromEntries(
  DELEGATION_CATALOG.map((m) => [m.module, m.permissions.map((p) => p.code)]),
);

/** code → human label, shared by the delegation UI. */
export const DELEGATION_PERM_LABELS: Record<string, string> = Object.fromEntries(
  DELEGATION_CATALOG.flatMap((m) => m.permissions.map((p) => [p.code, p.label] as const)),
);

type StoredModule = string | { module?: string; permissions?: unknown };

/**
 * Flatten a stored `Delegation.modules` JSON into the flat set of permission
 * codes it REQUESTS (before intersecting with what the delegator actually has).
 * Handles both the legacy plain-name shape and the `{module, permissions}` shape.
 */
export function expandDelegatedPermissions(modules: unknown): string[] {
  if (!Array.isArray(modules)) return [];
  const out = new Set<string>();
  for (const m of modules as StoredModule[]) {
    if (typeof m === "string") {
      for (const c of MODULE_CODES[m] ?? []) out.add(c);
    } else if (m && typeof m === "object" && typeof m.module === "string") {
      const perms = m.permissions;
      if (Array.isArray(perms) && perms.length) {
        for (const c of perms) if (typeof c === "string") out.add(c);
      } else {
        for (const c of MODULE_CODES[m.module] ?? []) out.add(c);
      }
    }
  }
  return [...out];
}
