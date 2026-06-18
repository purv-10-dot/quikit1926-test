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
export interface PermCell {
  code: string | null;
}

export interface PermLeaf {
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
  {
    key: "Dashboard",
    label: "Dashboard",
    leaves: [
      { resource: "Dashboard", label: "Dashboard", actions: { view: c("hrms.dashboard.employee"), create: NO, update: NO, delete: NO } },
      { resource: "Dashboard.Admin",   label: "Admin Dashboard",     actions: { view: c("hrms.dashboard.admin"),     create: NO, update: NO, delete: NO } },
      { resource: "Dashboard.HR",      label: "HR Dashboard",        actions: { view: c("hrms.dashboard.hr"),        create: NO, update: NO, delete: NO } },
      { resource: "Dashboard.Manager", label: "Manager Dashboard",   actions: { view: c("hrms.dashboard.manager"),   create: NO, update: NO, delete: NO } },
      { resource: "Dashboard.Recruit", label: "Recruiter Dashboard", actions: { view: c("hrms.dashboard.recruiter"), create: NO, update: NO, delete: NO } },
      { resource: "Dashboard.Finance", label: "Finance Dashboard",   actions: { view: c("hrms.dashboard.finance"),   create: NO, update: NO, delete: NO } },
      { resource: "Dashboard.IT",      label: "IT Dashboard",        actions: { view: c("hrms.dashboard.it"),        create: NO, update: NO, delete: NO } },
      { resource: "Dashboard.Audit",   label: "Audit Dashboard",     actions: { view: c("hrms.dashboard.audit"),     create: NO, update: NO, delete: NO } },
    ],
  },
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
      { resource: "Leave.Policy",  label: "Manage Leave Policies", actions: { view: c("hrms.leave_policy.read"), create: c("hrms.leave_policy.write"), update: c("hrms.leave.manage"), delete: NO } },
      { resource: "Leave.Policy.Approve", label: "Approve Leave Policy", actions: { view: NO, create: NO, update: c("hrms.leave_policy.approve"), delete: NO } },
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
    key: "Asset",
    label: "Asset",
    leaves: [
      { resource: "Asset",      label: "All Assets",  actions: { view: c("hrms.asset.read"),      create: c("hrms.asset.write"), update: c("hrms.asset.write"), delete: NO } },
      { resource: "Asset.Self", label: "Own Assets",  actions: { view: c("hrms.asset.read_self"), create: NO, update: NO, delete: NO } },
      { resource: "Asset.Team", label: "Team Assets", actions: { view: c("hrms.asset.read_team"), create: NO, update: NO, delete: NO } },
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
    ],
  },
  {
    key: "Ticket",
    label: "Help Desk",
    leaves: [
      { resource: "Ticket",         label: "All Tickets",      actions: { view: c("hrms.ticket.read"),         create: NO, update: c("hrms.ticket.write"), delete: c("hrms.ticket.delete") } },
      { resource: "Ticket.Self",    label: "Own Tickets",      actions: { view: c("hrms.ticket.read_self"),    create: c("hrms.ticket.raise"), update: NO, delete: NO } },
      { resource: "Ticket.Assigned",label: "Assigned Tickets", actions: { view: c("hrms.ticket.read_assigned"), create: NO, update: NO, delete: NO } },
      { resource: "Ticket.Manage",  label: "Manage Categories / SLA", actions: { view: NO, create: NO, update: c("hrms.ticket.manage"), delete: NO } },
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

/** Flat list of every (resource, action, code) cell. */
export function walkCells() {
  const out: { module: string; leafLabel: string; resource: string; action: Action; code: string }[] = [];
  for (const m of PERMISSION_TREE) {
    for (const leaf of m.leaves) {
      for (const a of ACTIONS) {
        const cell = leaf.actions[a];
        if (cell.code) out.push({ module: m.label, leafLabel: leaf.label, resource: leaf.resource, action: a, code: cell.code });
      }
    }
  }
  return out;
}

/** Sidebar navigation keys grouped by module — for Navigation tab. */
export interface NavItem {
  key: string;
  label: string;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

export const NAV_TREE: NavGroup[] = [
  {
    key: "core",
    label: "Core",
    items: [
      { key: "dashboard", label: "Dashboard" },
      { key: "tasks", label: "Tasks" },
      { key: "tickets", label: "Help Desk" },
    ],
  },
  {
    key: "people",
    label: "People",
    items: [
      { key: "people.org-chart", label: "Org Chart" },
      { key: "people.history", label: "Employment History" },
      { key: "people.delegations", label: "Delegations" },
      { key: "people.onboarding", label: "Onboarding" },
      { key: "people.offboarding", label: "Offboarding" },
      { key: "people.recruit", label: "Recruitment" },
    ],
  },
  {
    key: "time",
    label: "Time & Attendance",
    items: [
      { key: "time.attendance", label: "Attendance" },
      { key: "time.shifts", label: "Shifts" },
      { key: "time.regularization", label: "Regularizations" },
      { key: "time.logs", label: "Time Logs" },
    ],
  },
  {
    key: "leave",
    label: "Leave",
    items: [
      { key: "leave.my", label: "My Leaves" },
      { key: "leave.team", label: "Team Leaves" },
      { key: "leave.calendar", label: "Calendar" },
      { key: "leave.policies", label: "Policies" },
    ],
  },
  {
    key: "payroll",
    label: "Payroll",
    items: [
      { key: "payroll.analytics", label: "Analytics" },
      { key: "payroll.runs", label: "Pay Runs" },
      { key: "payroll.salaries", label: "Salaries" },
      { key: "payroll.reports", label: "Reports" },
      { key: "payroll.my", label: "My Payslips" },
    ],
  },
  {
    key: "performance",
    label: "Performance",
    items: [
      { key: "perf.goals", label: "Goals" },
      { key: "perf.appraisals", label: "Appraisals" },
      { key: "perf.feedback", label: "Feedback" },
    ],
  },
  {
    key: "engage",
    label: "Engagement",
    items: [
      { key: "engage.wall", label: "Engagement Wall" },
      { key: "engage.announcements", label: "Announcements" },
      { key: "engage.surveys", label: "Surveys" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    items: [
      { key: "settings.company", label: "Company" },
      { key: "settings.org", label: "Org Structure" },
      { key: "settings.roles", label: "Roles & Permissions" },
      { key: "settings.audit", label: "Audit Log" },
    ],
  },
];

export function isValidNavKey(key: string): boolean {
  return NAV_TREE.some((g) => g.items.some((i) => i.key === key));
}
