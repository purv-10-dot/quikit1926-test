import { writeFileSync } from "node:fs";

// [module, table, why we use it, why it can't be merged] — plain, short language.
const ROWS = [
  // ── Core HR & Organisation ──
  ["Core HR", "Employee", "The master record of every person. All modules link to it.", "It is the central thing everything points to — merging it into anything else would break every link."],
  ["Core HR", "Department", "List of departments (e.g. Sales, HR).", "Shared by many employees; keeping it separate avoids repeating dept details on every employee."],
  ["Core HR", "Designation", "List of job titles.", "A shared lookup reused by many employees."],
  ["Core HR", "Grade", "Pay / seniority bands.", "Shared lookup; one grade is used by many employees."],
  ["Core HR", "LegalEntity", "The legal company an employee belongs to.", "One company has many employees and its own compliance/payroll rules — kept separate."],
  ["Core HR", "OfficeLocation", "Physical office locations.", "Shared lookup; one location has many employees."],
  ["Core HR", "EmploymentHistory", "Past roles, promotions and changes for a person.", "Many rows per employee (a timeline) — can't be single columns on Employee."],
  ["Core HR", "Team", "Groups of employees.", "A person can be in many teams and a team has many people (many-to-many)."],
  ["Core HR", "Delegation", "Temporary 'act on my behalf' rights.", "Time-bound, can be many per person — needs its own rows."],
  ["Core HR", "CompanySettings", "One-time company-wide settings.", "One row for the whole company, not per employee."],
  ["Core HR", "CompanyHoliday", "The holiday calendar.", "Many holidays per year, shared by everyone."],
  ["Core HR", "Document", "Uploaded files (contracts, IDs).", "Many files per employee — each needs its own row."],
  ["Core HR", "DocumentAcknowledgment", "Who has read/accepted a policy.", "A link between a person and a document (many-to-many)."],
  ["Core HR", "DocumentShare", "Sharing a document with others.", "One share entry per recipient."],
  ["Core HR", "Announcement", "Company notices/news.", "Broadcast items not tied to one employee."],
  ["Core HR", "Dashboard", "Saved dashboard layout/config.", "Per-user or per-role UI settings, separate from business data."],

  // ── Access & Security (RBAC) ──
  ["Access (RBAC)", "AppRole", "Roles in HRMS (admin / employee).", "One role is reused by many users."],
  ["Access (RBAC)", "RolePermission", "Which permissions each role has.", "Many permissions per role — a child list, not columns."],
  ["Access (RBAC)", "RoleNavigation", "Which menu items each role can see.", "Many menu rows per role — a child list."],
  ["Access (RBAC)", "UserAppRole", "Links a user to a role.", "A join table (user × role); a user can hold more than one."],
  ["Access (RBAC)", "UserPermissionExtra", "Extra per-user permission tweaks.", "Per-user exceptions beyond the role — separate rows."],
  ["Access (RBAC)", "Invitation", "Pending invites to join HRMS.", "Temporary records that exist only until accepted."],
  ["Access (RBAC)", "EmployeeProvision", "Onboarding provisioning record for a hire.", "One per hire, with its own item list."],
  ["Access (RBAC)", "ProvisionItem", "Each item in a provisioning record (laptop, email).", "Many items per provisioning — child rows."],
  ["Access (RBAC)", "AuditLog", "A history of who did what.", "Append-only log; never merged so the trail stays intact."],

  // ── Attendance & Time ──
  ["Attendance & Time", "AttendancePolicy", "Rules for attendance.", "Config reused by many employees."],
  ["Attendance & Time", "AttendanceRecord", "Daily clock-in/out punches.", "One row per employee per day — huge volume, can't be columns."],
  ["Attendance & Time", "ShiftPolicy", "Shift definitions (timings).", "Shared lookup used by many."],
  ["Attendance & Time", "ShiftAssignment", "Who works which shift, when.", "A join of employee × shift × date."],
  ["Attendance & Time", "Roster", "A schedule plan (header).", "One plan covers many day-slots."],
  ["Attendance & Time", "RosterEntry", "Each slot/day inside a roster.", "Many entries per roster — child rows."],
  ["Attendance & Time", "Timesheet", "A person's time summary for a period.", "One per employee per period; has many log lines."],
  ["Attendance & Time", "TimeProject", "Projects to log time against.", "Shared lookup."],
  ["Attendance & Time", "TimeJob", "Tasks/jobs under a project.", "Many jobs per project — child rows."],
  ["Attendance & Time", "TimeLog", "Individual time entries.", "Many entries per timesheet — child rows."],
  ["Attendance & Time", "JobScheduleEntry", "Scheduled job/shift planning entries.", "Many scheduling rows — separate from people."],

  // ── Leave ──
  ["Leave", "LeaveType", "Kinds of leave (casual, sick).", "Shared lookup."],
  ["Leave", "LeavePolicy", "Leave rules (accrual, limits).", "Config reused by many."],
  ["Leave", "LeaveGroup", "A bundle of leave policies (header).", "Reused by many employees."],
  ["Leave", "LeaveGroupItem", "Policies inside a leave group.", "Many items per group — child rows."],
  ["Leave", "LeaveGroupAssignment", "Assigns a leave group to employees.", "A join (group × employee)."],
  ["Leave", "LeaveBalance", "Remaining leave per person per type.", "One row per employee per leave type."],
  ["Leave", "LeaveRequest", "Leave applications.", "Many per employee — separate rows."],
  ["Leave", "LeaveApproval", "Approval steps for a leave request.", "A request can have several approvers — child rows."],

  // ── Work From Home ──
  ["WFH", "WfhQuotaGroup", "WFH allowance groups.", "Config reused by many."],
  ["WFH", "WfhRequest", "Work-from-home applications.", "Many per employee."],
  ["WFH", "WfhApproval", "Approval steps for a WFH request.", "Multiple approvers — child rows."],

  // ── Payroll ──
  ["Payroll", "PayrollSettings", "Payroll configuration.", "One row for the whole company."],
  ["Payroll", "SalaryComponent", "Earning/deduction types (Basic, HRA).", "Shared lookup reused everywhere."],
  ["Payroll", "SalaryStructure", "A salary template (header).", "Reused by many employees."],
  ["Payroll", "SalaryStructureComponent", "Components inside a salary structure.", "Many components per structure — child rows."],
  ["Payroll", "EmployeeSalary", "An employee's current salary setup.", "Per employee; kept apart from the shared templates."],
  ["Payroll", "SalaryRevision", "History of salary changes.", "Many revisions per employee — a timeline."],
  ["Payroll", "PaySchedule", "The pay calendar.", "Config reused for every run."],
  ["Payroll", "PayRun", "A payroll run for one period (header).", "One run produces many payslips."],
  ["Payroll", "PayRunAdjustment", "Manual tweaks inside a run.", "Many adjustments per run — child rows."],
  ["Payroll", "PayRunApproval", "Approval steps for a pay run.", "Several approvers — child rows."],
  ["Payroll", "Payslip", "One employee's payslip in a run.", "One per employee per run; has many lines."],
  ["Payroll", "PayslipLine", "Each earning/deduction on a payslip.", "Many lines per payslip — child rows."],
  ["Payroll", "OneTimeEarning", "Ad-hoc one-off earnings (bonus).", "Per-event rows, not part of the fixed salary."],
  ["Payroll", "OneTimeStatutoryDefault", "Defaults for one-time statutory items.", "Reusable defaults, kept apart from actual entries."],
  ["Payroll", "PayrollTaxDetails", "Per-employee tax details for payroll.", "One per employee, used during runs."],
  ["Payroll", "PriorPayroll", "Mid-year prior payroll (header).", "Brought-forward totals; has detail rows."],
  ["Payroll", "PriorPayrollRecord", "Detail rows of prior payroll.", "Many per prior-payroll header — child rows."],
  ["Payroll", "EmployeeLoan", "Loans given to an employee.", "One per loan; has its own repayment schedule."],
  ["Payroll", "LoanRepayment", "Each loan repayment installment.", "Many installments per loan — child rows."],
  ["Payroll", "GratuityRecord", "Gratuity calculation per employee.", "Per employee/event."],
  ["Payroll", "FullAndFinalSettlement", "Exit (F&F) settlement.", "One per employee exit — its own lifecycle."],
  ["Payroll", "ReimbursementClaim", "Reimbursement requests.", "Many per employee — separate rows."],
  ["Payroll", "ExpenseClaim", "Expense claims.", "Many per employee — separate rows."],
  ["Payroll", "ExpenseApproval", "Approval steps for an expense claim.", "Several approvers — child rows."],
  ["Payroll", "ExpensePolicy", "Expense rules/limits.", "Config reused by many."],
  ["Payroll", "ClaimsDeclarationSettings", "Settings for claims declarations.", "Company-level config."],

  // ── Statutory & Tax (India) ──
  ["Statutory & Tax", "EPFConfig", "Provident Fund settings.", "One company-level config."],
  ["Statutory & Tax", "ESIConfig", "ESI settings.", "One company-level config."],
  ["Statutory & Tax", "LWFConfig", "Labour Welfare Fund settings.", "Config (often per state) — separate."],
  ["Statutory & Tax", "ProfessionalTaxConfig", "Professional Tax slabs.", "State-wise config lookup."],
  ["Statutory & Tax", "StatutoryBonusConfig", "Statutory bonus rules.", "Company-level config."],
  ["Statutory & Tax", "StateMinimumWage", "Minimum wage by state.", "A reference lookup table."],
  ["Statutory & Tax", "Form12BBDeclaration", "Employee tax declaration form.", "One per employee per financial year."],
  ["Statutory & Tax", "InvestmentProof", "Proof uploads for tax saving.", "Many per employee — separate files."],
  ["Statutory & Tax", "TdsChallan", "TDS payment challans.", "One per challan paid to govt."],
  ["Statutory & Tax", "TdsChallanAllocation", "How a challan is split across employees.", "Many allocations per challan — child rows."],
  ["Statutory & Tax", "TdsLiabilityPeriod", "TDS owed per period.", "One per period."],
  ["Statutory & Tax", "TdsOverride", "Manual TDS corrections.", "Per-override rows."],
  ["Statutory & Tax", "BankReconciliation", "Bank reconciliation (header).", "One per statement; has line items."],
  ["Statutory & Tax", "BankReconciliationLine", "Lines in a bank reconciliation.", "Many lines per reconciliation — child rows."],
  ["Statutory & Tax", "Donation", "Donations (80G / giving).", "Per-donation rows."],

  // ── Performance ──
  ["Performance", "Goal", "Employee goals / OKRs.", "Many goals per employee."],
  ["Performance", "KeyResult", "Measurable results under a goal.", "Many results per goal — child rows."],
  ["Performance", "GoalCheckIn", "Progress updates on a goal.", "Many updates per goal over time."],
  ["Performance", "AppraisalCycle", "A review period (header).", "Reused across all employees in that cycle."],
  ["Performance", "EmployeeAppraisal", "One person's appraisal in a cycle.", "One per employee per cycle."],
  ["Performance", "ReviewForm", "Appraisal form template.", "Reused by many appraisals."],
  ["Performance", "KraTemplateEntry", "KRA template lines.", "Reusable template rows."],
  ["Performance", "EmployeeKraAssignment", "KRAs assigned to an employee.", "Per employee — their own copy."],
  ["Performance", "KraScorecard", "Scoring of KRAs.", "Per employee/cycle scores."],
  ["Performance", "ContinuousFeedback", "Ongoing feedback notes.", "Many per employee over time."],
  ["Performance", "PIP", "Performance Improvement Plans.", "Per employee, its own lifecycle."],
  ["Performance", "Recognition", "Kudos / recognition.", "Per-event rows."],

  // ── Recruitment / ATS ──
  ["Recruitment", "JobRequisition", "A request to open a job.", "Per requisition."],
  ["Recruitment", "RequisitionApproval", "Approvals for a requisition.", "Several approvers — child rows."],
  ["Recruitment", "HiringPipeline", "Stages for hiring a role.", "Per job pipeline."],
  ["Recruitment", "Candidate", "Applicant master record.", "One per candidate; reused across jobs."],
  ["Recruitment", "JobApplication", "A candidate applying to a job.", "A join (candidate × job)."],
  ["Recruitment", "Interview", "Interview rounds.", "Many per application — separate rows."],
  ["Recruitment", "CandidatePortalAccess", "Candidate login access.", "Per candidate — separate from internal users."],
  ["Recruitment", "CandidateDocumentType", "Types of docs requested.", "Shared lookup."],
  ["Recruitment", "CandidateDocumentRequest", "Docs requested from a candidate.", "Per request."],
  ["Recruitment", "CandidateDocumentUpload", "Docs a candidate uploaded.", "Per uploaded file."],
  ["Recruitment", "ApprovalChain", "Reusable approval routing.", "Shared config used by many approvals."],

  // ── Onboarding / Offboarding ──
  ["Onboarding", "OnboardingTemplate", "Onboarding checklist template.", "Reused for many new hires."],
  ["Onboarding", "OnboardingInstance", "A new hire's onboarding run.", "One per employee."],
  ["Onboarding", "OnboardingTask", "Tasks within onboarding.", "Many tasks per instance — child rows."],
  ["Onboarding", "OffboardingInstance", "An exit process run.", "One per leaving employee."],
  ["Onboarding", "OffboardingTask", "Tasks within offboarding.", "Many tasks per instance — child rows."],
  ["Onboarding", "ESignRequest", "E-signature requests.", "Per request."],

  // ── Assets ──
  ["Assets", "Asset", "Company assets (laptops etc.).", "One per asset."],
  ["Assets", "AssetAssignment", "Asset handed to an employee.", "A join (asset × employee) over time."],
  ["Assets", "AssetScrap", "Retired/scrapped assets.", "Per scrap event."],

  // ── Tasks, Tickets & Engagement ──
  ["Tasks & Engage", "TaskList", "A board/list of tasks.", "One list holds many tasks."],
  ["Tasks & Engage", "Task", "An individual task.", "Many tasks per list — child rows."],
  ["Tasks & Engage", "TaskActivity", "Task history/comments.", "Many activities per task — child rows."],
  ["Tasks & Engage", "Ticket", "Helpdesk tickets.", "Per ticket."],
  ["Tasks & Engage", "TicketCategory", "Ticket categories.", "Shared lookup."],
  ["Tasks & Engage", "TicketComment", "Comments on a ticket.", "Many per ticket — child rows."],
  ["Tasks & Engage", "TicketActivity", "Ticket status history.", "Many per ticket — child rows."],
  ["Tasks & Engage", "TicketAttachment", "Files attached to a ticket.", "Many per ticket — child rows."],
  ["Tasks & Engage", "Survey", "Employee surveys (header).", "One survey has many responses."],
  ["Tasks & Engage", "SurveyResponse", "Each person's survey answers.", "One per respondent — child rows."],
  ["Tasks & Engage", "SocialPost", "Internal social-feed posts.", "Per post."],
  ["Tasks & Engage", "PostComment", "Comments on a social post.", "Many per post — child rows."],
  ["Tasks & Engage", "Notification", "User notifications.", "Many per user — separate rows."],
  ["Tasks & Engage", "EmailTemplate", "Email templates.", "Shared lookup/config."],
  ["Tasks & Engage", "Report", "Saved report definitions.", "Per saved report."],
  ["Tasks & Engage", "DataImport", "Bulk import jobs.", "Per import job, with its own status."],
];

const groups = [];
const seen = new Map();
for (const [mod, table, use, merge] of ROWS) {
  if (!seen.has(mod)) { seen.set(mod, []); groups.push(mod); }
  seen.get(mod).push([table, use, merge]);
}

const today = process.argv[2] || "";
let body = "";
for (const mod of groups) {
  const rows = seen.get(mod);
  body += `<tr class="mod"><td colspan="3">${mod} <span class="cnt">(${rows.length})</span></td></tr>`;
  for (const [t, u, m] of rows) {
    body += `<tr><td class="tname">${t}</td><td>${u}</td><td class="merge">${m}</td></tr>`;
  }
}

const html = `<!doctype html><html><head><meta charset="utf-8"><title>HRMS Tables</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#1f2937; font-size:11px; }
  h1 { font-size:20px; margin:0 0 2px; color:#16243A; }
  .sub { color:#6b7280; font-size:11px; margin:0 0 14px; }
  table { width:100%; border-collapse:collapse; }
  th { background:#16243A; color:#fff; text-align:left; padding:7px 8px; font-size:11px; }
  td { padding:6px 8px; border-bottom:1px solid #eef0f3; vertical-align:top; }
  tr.mod td { background:#eaf0f6; color:#16243A; font-weight:700; font-size:12px; padding:7px 8px; }
  tr.mod .cnt { color:#7b8aa0; font-weight:600; }
  .tname { font-weight:700; color:#16243A; white-space:nowrap; }
  .merge { color:#475569; }
  td:nth-child(2){ width:38%; } td:nth-child(3){ width:42%; }
  tr { break-inside: avoid; }
</style></head><body>
<h1>QuikHRMS — Tables &amp; Why They Exist</h1>
<p class="sub">All ${ROWS.length} tables, grouped by module. Each shows what it is used for and why it is kept as its own table (not merged). ${today}</p>
<table>
  <thead><tr><th>Table</th><th>Why we use it</th><th>Why not merge it with another</th></tr></thead>
  <tbody>${body}</tbody>
</table>
</body></html>`;

writeFileSync(new URL("./HRMS_TABLES_MERGE.html", import.meta.url), html);
console.log("wrote HRMS_TABLES_MERGE.html with", ROWS.length, "tables");
