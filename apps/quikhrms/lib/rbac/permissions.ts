/**
 * Canonical permission catalog. Seeded into Permission table.
 * Naming: hrms.<domain>.<action> — stable strings used by routes.
 */

export interface PermissionDef {
  code: string;
  name: string;
  category: string;
  description: string;
}

export const PERMISSIONS: PermissionDef[] = [
  // ── Employee ──
  { code: "hrms.employee.read", category: "Employee", name: "View Employees", description: "List and view employee records" },
  { code: "hrms.employee.read_self", category: "Employee", name: "View Own Profile", description: "View own employee profile" },
  { code: "hrms.employee.read_team", category: "Employee", name: "View Team", description: "View direct reports" },
  { code: "hrms.employee.write", category: "Employee", name: "Manage Employees", description: "Create/update employees" },
  { code: "hrms.employee.delete", category: "Employee", name: "Delete Employees", description: "Soft-delete employees" },

  // ── Org ──
  { code: "hrms.org.read", category: "Org", name: "View Org Chart", description: "Departments, teams, designations, grades" },
  { code: "hrms.org.write", category: "Org", name: "Manage Org Structure", description: "Create/update org entities" },

  // ── Leave ──
  { code: "hrms.leave.read", category: "Leave", name: "View Leaves", description: "View all leave requests" },
  { code: "hrms.leave.read_self", category: "Leave", name: "View Own Leaves", description: "View own leave requests" },
  { code: "hrms.leave.read_team", category: "Leave", name: "View Team Leaves", description: "View team leave requests" },
  { code: "hrms.leave.apply", category: "Leave", name: "Apply Leave", description: "Submit leave request" },
  { code: "hrms.leave.approve", category: "Leave", name: "Approve Leave", description: "Approve/reject leave requests" },
  { code: "hrms.leave.manage", category: "Leave", name: "Manage Leave Policies", description: "Configure leave types, balances" },
  { code: "hrms.leave.dashboard.read", category: "Leave", name: "View Leave Dashboard", description: "View the leave analytics dashboard" },

  // ── Attendance ──
  { code: "hrms.attendance.read", category: "Attendance", name: "View Attendance", description: "View all attendance records" },
  { code: "hrms.attendance.read_self", category: "Attendance", name: "View Own Attendance", description: "View own attendance" },
  { code: "hrms.attendance.read_team", category: "Attendance", name: "View Team Attendance", description: "View team attendance" },
  { code: "hrms.attendance.punch", category: "Attendance", name: "Check In/Out", description: "Record attendance punches" },
  { code: "hrms.attendance.approve", category: "Attendance", name: "Approve Regularizations", description: "Approve attendance regularization requests" },
  { code: "hrms.attendance.manage", category: "Attendance", name: "Manage Policies", description: "Configure shifts, policies" },

  // ── Duty Roster ──
  { code: "hrms.roster.read", category: "Roster", name: "View All Rosters", description: "View duty rosters for all employees" },
  { code: "hrms.roster.read_self", category: "Roster", name: "View Own Roster", description: "View own duty roster" },
  { code: "hrms.roster.read_team", category: "Roster", name: "View Team Roster", description: "View duty rosters for direct reports" },
  { code: "hrms.roster.manage", category: "Roster", name: "Manage Rosters", description: "Create, edit and publish duty rosters" },

  // ── Expense ──
  { code: "hrms.expense.read", category: "Expense", name: "View All Expenses", description: "View all expense claims" },
  { code: "hrms.expense.read_self", category: "Expense", name: "View Own Expenses", description: "View own expense claims" },
  { code: "hrms.expense.read_team", category: "Expense", name: "View Team Expenses", description: "View expense claims for direct reports" },
  { code: "hrms.expense.submit", category: "Expense", name: "Submit Expense", description: "Create/submit expense claims" },
  { code: "hrms.expense.approve", category: "Expense", name: "Approve Expense", description: "Approve/reject expense claims" },
  { code: "hrms.expense.manage", category: "Expense", name: "Manage Policies", description: "Configure expense policies" },

  // ── Recruit ──
  { code: "hrms.recruit.read", category: "Recruit", name: "View Recruitment", description: "View requisitions, candidates, applications" },
  { code: "hrms.recruit.write", category: "Recruit", name: "Manage Recruitment", description: "Create/update requisitions, candidates" },
  { code: "hrms.recruit.offer", category: "Recruit", name: "Manage Offers", description: "Send/withdraw offers" },
  { code: "hrms.recruit.interview", category: "Recruit", name: "Manage Interviews", description: "Schedule and score interviews" },

  // ── Performance ──
  { code: "hrms.performance.read", category: "Performance", name: "View Performance", description: "View goals, appraisals (all)" },
  { code: "hrms.performance.read_self", category: "Performance", name: "View Own Performance", description: "View own goals, reviews" },
  { code: "hrms.performance.read_team", category: "Performance", name: "View Team Performance", description: "View goals/reviews for direct reports" },
  { code: "hrms.performance.write", category: "Performance", name: "Manage Goals", description: "Create/update goals" },
  { code: "hrms.performance.appraise", category: "Performance", name: "Run Appraisals", description: "Configure cycles, conduct reviews" },
  { code: "hrms.performance.pip", category: "Performance", name: "Manage PIPs", description: "Initiate and close PIPs" },

  // ── Document ──
  { code: "hrms.document.read", category: "Document", name: "View All Documents", description: "View org/employee documents" },
  { code: "hrms.document.read_self", category: "Document", name: "View Own Documents", description: "View own documents" },
  { code: "hrms.document.read_team", category: "Document", name: "View Team Documents", description: "View documents of direct reports" },
  { code: "hrms.document.write", category: "Document", name: "Manage Documents", description: "Upload/update documents" },
  { code: "hrms.document.write_self", category: "Document", name: "Upload Own Documents", description: "Upload/update own personal documents (vault)" },
  { code: "hrms.document.acknowledge", category: "Document", name: "Acknowledge Documents", description: "Sign/acknowledge assigned documents" },

  // ── Boarding ──
  { code: "hrms.onboarding.read", category: "Boarding", name: "View Onboarding", description: "View onboarding instances" },
  { code: "hrms.onboarding.write", category: "Boarding", name: "Manage Onboarding", description: "Initiate onboarding, edit tasks" },
  { code: "hrms.offboarding.read", category: "Boarding", name: "View Offboarding", description: "View offboarding instances" },
  { code: "hrms.offboarding.write", category: "Boarding", name: "Manage Offboarding", description: "Initiate offboarding, manage tasks" },
  { code: "hrms.offboarding.attrition.read", category: "Boarding", name: "View Attrition Analytics", description: "View attrition / exit analytics" },
  { code: "hrms.offboarding.approve", category: "Boarding", name: "Approve Resignations", description: "See the central resignation queue and approve/reject resignations" },

  // ── Engagement ──
  { code: "hrms.engage.read", category: "Engagement", name: "View Engagement", description: "View announcements, social, recognition" },
  { code: "hrms.engage.post", category: "Engagement", name: "Post Updates", description: "Create social posts, recognitions" },
  { code: "hrms.engage.announce", category: "Engagement", name: "Publish Announcements", description: "Publish org announcements" },
  { code: "hrms.engage.survey.manage", category: "Engagement", name: "Manage Surveys", description: "Create/publish surveys" },
  { code: "hrms.engage.approve", category: "Engagement", name: "Approve Engagement", description: "Approve/reject announcements, posts, recognitions awaiting moderation" },
  { code: "hrms.feedback.approve", category: "Engagement", name: "Approve Feedback", description: "Approve/reject continuous feedback awaiting moderation" },


  // ── Audit ──
  { code: "hrms.audit.read", category: "Audit", name: "View Audit Log", description: "View system audit trail" },

  // ── Reports ──
  { code: "hrms.reports.read", category: "Reports", name: "View Reports", description: "Run report templates" },
  { code: "hrms.reports.manage", category: "Reports", name: "Manage Report Templates", description: "Create/edit report templates" },

  // ── Settings / RBAC ──
  { code: "hrms.settings.read", category: "Settings", name: "View Settings", description: "View tenant settings" },
  { code: "hrms.settings.write", category: "Settings", name: "Manage Settings", description: "Update tenant settings" },
  { code: "hrms.rbac.manage", category: "Settings", name: "Manage Roles & Permissions", description: "Create/edit roles and permissions (super_admin)" },
  { code: "hrms.user.invite", category: "Settings", name: "Invite Users", description: "Invite people by email, manage and revoke invitations" },

  // ── Dashboard ──
  { code: "hrms.dashboard.admin", category: "Dashboard", name: "Admin Dashboard", description: "Org-wide analytics, headcount, all KPIs" },
  { code: "hrms.dashboard.hr", category: "Dashboard", name: "HR Dashboard", description: "Pending queues, onboarding, announcements" },
  { code: "hrms.dashboard.manager", category: "Dashboard", name: "Manager Dashboard", description: "Team widgets, pending approvals" },
  { code: "hrms.dashboard.employee", category: "Dashboard", name: "Employee Dashboard", description: "Self widgets: profile, leaves, expenses" },
  { code: "hrms.dashboard.recruiter", category: "Dashboard", name: "Recruiter Dashboard", description: "Open reqs, candidates, interviews" },
  { code: "hrms.dashboard.finance", category: "Dashboard", name: "Finance Dashboard", description: "Expense approvals, audit" },
  { code: "hrms.dashboard.audit", category: "Dashboard", name: "Audit Dashboard", description: "Audit log feed, entity timeline" },
];

export const PERMISSION_CODES = PERMISSIONS.map((p) => p.code);
export type PermissionCode = (typeof PERMISSION_CODES)[number];

// ── Default role → permission assignments ──

export interface RoleSeed {
  code: string;
  name: string;
  description: string;
  priority: number;
  permissions: string[] | "*"; // "*" = all
  dashboardConfig: Record<string, unknown>;
}

const COMMON_SELF = [
  "hrms.employee.read_self",
  "hrms.leave.read_self", "hrms.leave.apply",
  "hrms.attendance.read_self", "hrms.attendance.punch",
  "hrms.roster.read_self",
  "hrms.expense.read_self", "hrms.expense.submit",
  "hrms.document.read_self", "hrms.document.write_self", "hrms.document.acknowledge",
  "hrms.performance.read_self",
  "hrms.engage.read", "hrms.engage.post",
];

export const DEFAULT_ROLES: RoleSeed[] = [
  {
    code: "admin", name: "Admin", priority: 100,
    description: "Full HRMS access (all permissions + RBAC management)",
    permissions: "*",
    dashboardConfig: {
      widgets: ["orgAnalytics", "headcount", "auditShortcuts", "allPendingApprovals", "systemHealth"],
    },
  },
  {
    code: "employee", name: "Employee", priority: 10,
    description: "Individual contributor — self-service only",
    permissions: [
      "hrms.org.read",
      "hrms.engage.read",
      "hrms.dashboard.employee",
      ...COMMON_SELF,
    ],
    dashboardConfig: {
      widgets: ["myProfile", "myLeaves", "myExpenses", "checkInWidget", "announcements", "holidays"],
    },
  },
];
