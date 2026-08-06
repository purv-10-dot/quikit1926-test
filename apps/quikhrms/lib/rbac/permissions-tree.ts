/**
 * Tree-shaped permission registry for UI rendering. Mirrors quikscale v2 shape.
 *
 * Each leaf maps the 4 standard actions (view / create / update / delete) to
 * existing PERMISSION codes from `permissions.ts`. Cells with `null` render as
 * "—" (action not applicable to that resource).
 *
 * Used by:
 *   - Roles & Permissions UI (matrix grid)
 *   - Per-user Effective Permissions view (gray = role-derived, click = extra)
 *
 * Backend storage (`RolePermission` / `UserPermissionExtra`) still uses the
 * flat `(resource, action)` rows derived from the same codes — this tree is
 * presentation only.
 */

export const ACTIONS = ["view", "create", "update", "delete"] as const;
export type Action = (typeof ACTIONS)[number];

/** Single cell in the matrix. `code` = wire code or null when not applicable. */
interface PermCell {
  code: string | null;
}

interface PermLeaf {
  resource: string;        // unique key (matches stored RolePermission.resource)
  label: string;
  /** Maps each of view/create/update/delete to a permission code or null. */
  actions: Record<Action, PermCell>;
}

export interface PermModule {
  key: string;
  label: string;
  leaves: PermLeaf[];
}

const NO: PermCell = { code: null };
const c = (code: string): PermCell => ({ code });

export const PERMISSION_TREE: PermModule[] = [
  // NOTE: Dashboards are intentionally NOT permission-gated here. Which dashboard
  // a user lands on is derived from their role name (see widgetsForRole), so
  // exposing per-dashboard view tickboxes was confusing and did nothing. This
  // grid is only for real data entities with meaningful create/update/delete.
  {
    key: "Employee",
    label: "Employee",
    leaves: [
      { resource: "Employee",      label: "All Employees",  actions: { view: c("hrms.employee.read"),      create: c("hrms.employee.write"), update: c("hrms.employee.write"), delete: c("hrms.employee.delete") } },
      { resource: "Employee.Self", label: "Own Profile",    actions: { view: c("hrms.employee.read_self"), create: NO, update: NO, delete: NO } },
      { resource: "Employee.Team", label: "Direct Reports", actions: { view: c("hrms.employee.read_team"), create: NO, update: NO, delete: NO } },
    ],
  },
  {
    key: "Org",
    label: "Organization",
    leaves: [
      { resource: "Org", label: "Departments / Teams / Designations / Grades", actions: { view: c("hrms.org.read"), create: c("hrms.org.write"), update: c("hrms.org.write"), delete: NO } },
    ],
  },
  {
    key: "Leave",
    label: "Leave",
    leaves: [
      { resource: "Leave",         label: "All Leave Requests",  actions: { view: c("hrms.leave.read"),       create: NO, update: NO, delete: NO } },
      { resource: "Leave.Self",    label: "Own Leaves",          actions: { view: c("hrms.leave.read_self"),  create: c("hrms.leave.apply"), update: NO, delete: NO } },
      { resource: "Leave.Team",    label: "Team Leaves",         actions: { view: c("hrms.leave.read_team"),  create: NO, update: NO, delete: NO } },
      { resource: "Leave.Approve", label: "Approve Leave",       actions: { view: NO, create: NO, update: c("hrms.leave.approve"), delete: NO } },
      { resource: "Leave.Policy",  label: "Manage Leave Policies", actions: { view: NO, create: NO, update: c("hrms.leave.manage"), delete: NO } },
      { resource: "Leave.Dashboard", label: "Leave Dashboard", actions: { view: c("hrms.leave.dashboard.read"), create: NO, update: NO, delete: NO } },
    ],
  },
  {
    key: "Attendance",
    label: "Attendance",
    leaves: [
      { resource: "Attendance",         label: "All Attendance",     actions: { view: c("hrms.attendance.read"),       create: NO, update: NO, delete: NO } },
      { resource: "Attendance.Self",    label: "Own Attendance",     actions: { view: c("hrms.attendance.read_self"),  create: c("hrms.attendance.punch"), update: NO, delete: NO } },
      { resource: "Attendance.Team",    label: "Team Attendance",    actions: { view: c("hrms.attendance.read_team"),  create: NO, update: NO, delete: NO } },
      { resource: "Attendance.Approve", label: "Approve Regularizations", actions: { view: NO, create: NO, update: c("hrms.attendance.approve"), delete: NO } },
      { resource: "Attendance.Manage",  label: "Manage Shifts/Policies",  actions: { view: NO, create: NO, update: c("hrms.attendance.manage"), delete: NO } },
    ],
  },
  {
    key: "Roster",
    label: "Duty Roster",
    leaves: [
      { resource: "Roster",        label: "All Rosters",   actions: { view: c("hrms.roster.read"),       create: NO, update: NO, delete: NO } },
      { resource: "Roster.Self",   label: "Own Roster",    actions: { view: c("hrms.roster.read_self"),  create: NO, update: NO, delete: NO } },
      { resource: "Roster.Team",   label: "Team Roster",   actions: { view: c("hrms.roster.read_team"),  create: NO, update: NO, delete: NO } },
      { resource: "Roster.Manage", label: "Manage Rosters", actions: { view: NO, create: c("hrms.roster.manage"), update: c("hrms.roster.manage"), delete: NO } },
    ],
  },
  {
    key: "Expense",
    label: "Expense",
    leaves: [
      { resource: "Expense",         label: "All Expenses",  actions: { view: c("hrms.expense.read"),      create: NO, update: NO, delete: NO } },
      { resource: "Expense.Self",    label: "Own Expenses",  actions: { view: c("hrms.expense.read_self"), create: c("hrms.expense.submit"), update: NO, delete: NO } },
      { resource: "Expense.Team",    label: "Team Expenses", actions: { view: c("hrms.expense.read_team"), create: NO, update: NO, delete: NO } },
      { resource: "Expense.Approve", label: "Approve Expense", actions: { view: NO, create: NO, update: c("hrms.expense.approve"), delete: NO } },
      { resource: "Expense.Manage",  label: "Manage Expense Policies", actions: { view: NO, create: NO, update: c("hrms.expense.manage"), delete: NO } },
    ],
  },
  {
    key: "Recruit",
    label: "Recruitment",
    leaves: [
      { resource: "Recruit", label: "Requisitions / Candidates", actions: { view: c("hrms.recruit.read"), create: c("hrms.recruit.write"), update: c("hrms.recruit.write"), delete: NO } },
      { resource: "Recruit.Interview", label: "Interviews", actions: { view: NO, create: c("hrms.recruit.interview"), update: c("hrms.recruit.interview"), delete: NO } },
      { resource: "Recruit.Offer", label: "Offers", actions: { view: NO, create: c("hrms.recruit.offer"), update: c("hrms.recruit.offer"), delete: NO } },
      { resource: "Recruit.Approve", label: "Approve Requisitions", actions: { view: NO, create: NO, update: c("hrms.recruit.approve"), delete: NO } },
    ],
  },
  {
    key: "Performance",
    label: "Performance",
    leaves: [
      { resource: "Performance",      label: "All Performance",  actions: { view: c("hrms.performance.read"),      create: c("hrms.performance.write"), update: c("hrms.performance.write"), delete: NO } },
      { resource: "Performance.Self", label: "Own Performance",  actions: { view: c("hrms.performance.read_self"), create: NO, update: NO, delete: NO } },
      { resource: "Performance.Team", label: "Team Performance", actions: { view: c("hrms.performance.read_team"), create: NO, update: NO, delete: NO } },
      { resource: "Performance.Appraise", label: "Run Appraisals", actions: { view: NO, create: NO, update: c("hrms.performance.appraise"), delete: NO } },
      { resource: "Performance.PIP",      label: "PIP Management", actions: { view: NO, create: c("hrms.performance.pip"), update: c("hrms.performance.pip"), delete: NO } },
    ],
  },
  {
    key: "Document",
    label: "Document",
    leaves: [
      { resource: "Document",         label: "All Documents",  actions: { view: c("hrms.document.read"),         create: c("hrms.document.write"), update: c("hrms.document.write"), delete: NO } },
      { resource: "Document.Self",    label: "Own Documents",  actions: { view: c("hrms.document.read_self"),    create: c("hrms.document.write_self"), update: c("hrms.document.write_self"), delete: NO } },
      { resource: "Document.Team",    label: "Team Documents", actions: { view: c("hrms.document.read_team"),    create: NO, update: NO, delete: NO } },
      { resource: "Document.Acknowledge", label: "Acknowledge Documents", actions: { view: NO, create: NO, update: c("hrms.document.acknowledge"), delete: NO } },
    ],
  },
  {
    key: "Boarding",
    label: "On/Offboarding",
    leaves: [
      { resource: "Onboarding",  label: "Onboarding",  actions: { view: c("hrms.onboarding.read"),  create: c("hrms.onboarding.write"),  update: c("hrms.onboarding.write"), delete: NO } },
      { resource: "Offboarding", label: "Offboarding", actions: { view: c("hrms.offboarding.read"), create: c("hrms.offboarding.write"), update: c("hrms.offboarding.write"), delete: NO } },
      { resource: "Offboarding.Attrition", label: "Attrition Analytics", actions: { view: c("hrms.offboarding.attrition.read"), create: NO, update: NO, delete: NO } },
      { resource: "Offboarding.Approve", label: "Approve Resignations", actions: { view: NO, create: NO, update: c("hrms.offboarding.approve"), delete: NO } },
    ],
  },
  {
    key: "Engage",
    label: "Engagement",
    leaves: [
      { resource: "Engage",          label: "Engagement Wall", actions: { view: c("hrms.engage.read"),  create: c("hrms.engage.post"), update: NO, delete: NO } },
      { resource: "Engage.Announce", label: "Announcements",   actions: { view: NO, create: c("hrms.engage.announce"), update: NO, delete: NO } },
      { resource: "Engage.Survey",   label: "Surveys",         actions: { view: NO, create: NO, update: c("hrms.engage.survey.manage"), delete: NO } },
      { resource: "Engage.Approve",  label: "Approve Engagement", actions: { view: NO, create: NO, update: c("hrms.engage.approve"), delete: NO } },
      { resource: "Engage.Feedback", label: "Approve Feedback",   actions: { view: NO, create: NO, update: c("hrms.feedback.approve"), delete: NO } },
    ],
  },
  {
    key: "Reports",
    label: "Reports",
    leaves: [
      { resource: "Reports", label: "Report Templates", actions: { view: c("hrms.reports.read"), create: NO, update: c("hrms.reports.manage"), delete: NO } },
    ],
  },
  {
    key: "Audit",
    label: "Audit",
    leaves: [
      { resource: "Audit", label: "Audit Log", actions: { view: c("hrms.audit.read"), create: NO, update: NO, delete: NO } },
    ],
  },
  {
    key: "Settings",
    label: "Settings & RBAC",
    leaves: [
      { resource: "Settings", label: "Tenant Settings",       actions: { view: c("hrms.settings.read"), create: NO, update: c("hrms.settings.write"), delete: NO } },
      { resource: "RBAC",     label: "Roles & Permissions",   actions: { view: NO, create: NO, update: c("hrms.rbac.manage"), delete: NO } },
    ],
  },
];

/** Sidebar navigation keys grouped by module — for Navigation tab. */
interface NavItem {
  key: string;
  label: string;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

/**
 * Complete mirror of the app sidebar (`components/hrms/layout/sidebar.tsx`).
 * Every top-level tab and every sub-tab is listed here so roles can be
 * customised down to the individual navigation item. Groups are the sidebar's
 * expandable parents; standalone top-level links live under "General".
 *
 * Keep this in sync whenever a nav item is added/removed in the sidebar.
 */
export const NAV_TREE: NavGroup[] = [
  {
    key: "general",
    label: "General",
    items: [
      { key: "dashboard", label: "Dashboard" },
      { key: "tasks", label: "Todo" },
      { key: "claims", label: "Claims & Declarations" },
    ],
  },
  {
    key: "expenses",
    label: "Expenses",
    // One sidebar link opening a tabbed page; each tab below is individually
    // grantable (gated in expenses/_components/expense-tabs.tsx).
    items: [
      { key: "expenses.claims", label: "Claims" },
      { key: "expenses.approvals", label: "Approvals" },
      { key: "expenses.policies", label: "Policies" },
      { key: "expenses.reports", label: "Reports" },
    ],
  },
  {
    key: "people",
    label: "People",
    items: [
      // Directory is one sidebar link opening a tabbed page (gated in org-chart/page.tsx).
      { key: "people.directory.list", label: "Directory" },
      { key: "people.directory.orgchart", label: "Org Chart" },
      { key: "people.history", label: "Employment Logs" },
      { key: "people.delegations", label: "Delegations" },
      { key: "people.pre-onboarding", label: "Pre-Onboarding" },
      { key: "people.onboarding", label: "Onboarding" },
      // Offboarding is one sidebar link opening a tabbed page (gated in offboarding/page.tsx).
      { key: "people.offboarding.active", label: "Offboarding" },
      { key: "people.offboarding.exited", label: "Exited Employees" },
      { key: "people.offboarding.attrition", label: "Attrition" },
      { key: "people.offboarding.notice", label: "Notice Period" },
      { key: "people.resignation-approvals", label: "Resignation Approvals" },
      { key: "people.requisition", label: "New Requisition" },
      { key: "people.requisition-approvals", label: "Approve Requisitions" },
    ],
  },
  {
    key: "time",
    label: "Time & Attendance",
    items: [
      { key: "time.attendance", label: "My Attendance" },
      { key: "time.attendance-admin", label: "Team Attendance" },
      { key: "time.regularizations", label: "Approve Regularizations" },
      { key: "time.roster", label: "Shift Roster" },
      { key: "time.shifts", label: "Shifts" },
    ],
  },
  {
    key: "leave",
    label: "Leaves",
    items: [
      { key: "leave.my", label: "My Leaves" },
      { key: "leave.team", label: "Team Leaves" },
      { key: "leave.calendar", label: "Leave Calendar" },
      // Leave Settings is a single sidebar link that opens a tabbed page; each
      // tab below is individually grantable (gated in leaves/policies/page.tsx).
      { key: "leave.policies.types", label: "Leave Types" },
      { key: "leave.policies.groups", label: "Leave Groups" },
      { key: "leave.policies.members", label: "Employees In Leave Group" },
      { key: "leave.policies.dashboard", label: "Leave Dashboard" },
    ],
  },
  {
    key: "wfh",
    label: "Work From Home",
    items: [
      { key: "wfh.my", label: "My WFH" },
      { key: "wfh.approvals", label: "Team Approvals" },
      { key: "wfh.quota", label: "Quota Groups" },
      { key: "wfh.groups", label: "Employees In Group" },
    ],
  },
  {
    key: "payroll",
    label: "Payroll",
    items: [
      { key: "payroll.analytics", label: "Analytics" },
      { key: "payroll.runs", label: "Pay Runs" },
      { key: "payroll.salaries", label: "Employee Salaries" },
      { key: "payroll.approvals", label: "Payroll Approvals" },
      { key: "payroll.tax-filings", label: "Tax Filings" },
      { key: "payroll.tds", label: "TDS & Challans" },
      { key: "payroll.one-time", label: "One-Time Pay" },
      { key: "payroll.full-final", label: "Final Settlement" },
      { key: "payroll.reports", label: "Reports" },
      { key: "payroll.my", label: "My Payslips" },
      { key: "payroll.advances", label: "Loans & Giving" },
      { key: "payroll.prior", label: "Prior Payroll" },
    ],
  },
  {
    key: "performance",
    label: "Performance",
    items: [
      { key: "perf.goals", label: "Goals" },
      { key: "perf.kra-templates", label: "Scorecard Templates" },
      { key: "perf.kra-assignments", label: "Assign KRAs" },
      { key: "perf.reviews", label: "Appraisals" },
      { key: "perf.feedback", label: "Continuous Feedback" },
      { key: "perf.pip", label: "Improvement Plans" },
    ],
  },
  {
    key: "recruit",
    label: "Recruitment",
    items: [
      { key: "recruit.dashboard", label: "Dashboard" },
      { key: "recruit.requisitions", label: "Job Openings" },
      { key: "recruit.candidates", label: "Candidates" },
      { key: "recruit.pipeline", label: "Hiring Pipeline" },
      { key: "recruit.interviews", label: "Interviews" },
      { key: "recruit.candidate-doc-types", label: "Document Types" },
    ],
  },
  {
    key: "engage",
    label: "Engage",
    items: [
      { key: "engage.social-wall", label: "Social Wall" },
      { key: "engage.announcements", label: "Announcements" },
      { key: "engage.surveys", label: "Surveys" },
      { key: "engage.recognition", label: "Recognition" },
    ],
  },
  {
    key: "engage-approvals",
    label: "Engage Approvals",
    // One sidebar link ("Approvals") opening a tabbed page; each approval type
    // below is individually grantable (gated in engage/approvals/page.tsx).
    items: [
      { key: "engage.approvals.announcement", label: "Announcements" },
      { key: "engage.approvals.post", label: "Posts" },
      { key: "engage.approvals.recognition", label: "Recognition" },
      { key: "engage.approvals.feedback", label: "Feedback" },
    ],
  },
  {
    key: "documents",
    label: "Documents",
    items: [
      { key: "documents.company", label: "Company Documents" },
      { key: "documents.employees", label: "Employee Documents" },
      { key: "documents.my-vault", label: "My Vault" },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    items: [
      { key: "reports.dashboards", label: "Dashboards" },
      { key: "reports.analytics", label: "Analytics" },
      { key: "reports.query-builder", label: "Query Builder" },
    ],
  },
  {
    key: "administration",
    label: "Administration",
    items: [
      { key: "admin.users", label: "Users" },
      { key: "admin.settings", label: "Settings" },
    ],
  },
];

/**
 * Legacy single-item nav keys that were later split into per-tab keys. Kept
 * valid so older saved role configs survive the config-route filter and still
 * grant the whole tabbed page (each page treats these as "show all tabs").
 */
const LEGACY_NAV_KEYS = new Set(["leave.policies", "people.directory", "people.offboarding", "expenses", "engage.approvals"]);

export function isValidNavKey(key: string): boolean {
  if (LEGACY_NAV_KEYS.has(key)) return true;
  return NAV_TREE.some((g) => g.items.some((i) => i.key === key));
}
