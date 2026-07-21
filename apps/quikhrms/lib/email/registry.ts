/**
 * Email event registry — the single source of truth for every customizable
 * transactional email the HRMS sends.
 *
 * Each event maps to a code builder in `lib/email-templates/*` (the *fallback*
 * default). This registry stores metadata only (key, label, group, the allowed
 * `{{variables}}` a tenant may use in an override) — it does NOT duplicate the
 * default subject/body, so branded defaults stay rich and DRY.
 *
 * Used by:
 *   - the Email Templates settings UI (lists every event + its variables)
 *   - the save API (rejects overrides that reference unknown variables)
 *   - `resolveAndSend` (send path) via the key
 *
 * `{{companyName}}` is available in every event and is appended automatically.
 */

export interface EmailVar {
  name: string;
  description: string;
  example: string;
}

export interface EmailEvent {
  key: string;
  label: string;
  group: string;
  /** Extra vars beyond `companyName` (which every event gets). */
  variables: EmailVar[];
}

const v = (name: string, description: string, example: string): EmailVar => ({ name, description, example });

/** Appended to every event's variable list. */
const COMPANY: EmailVar = v("companyName", "Your organization's name", "Acme Corp");

/** Common variable definitions reused across events. */
const CANDIDATE = v("candidateName", "Candidate's full name", "Priya Sharma");
const JOB_TITLE = v("jobTitle", "Job / requisition title", "Senior Engineer");
const EMP_NAME = v("employeeName", "Employee's full name", "Rahul Verma");
const EMP_CODE = v("employeeCode", "Employee code", "EMP-0142");
const INTERVIEW_ROWS: EmailVar[] = [
  v("interviewDate", "Interview date", "15 Jul 2026"),
  v("interviewTime", "Interview time (IST)", "3:00 PM"),
  v("duration", "Duration", "45 min"),
  v("type", "Interview mode", "Video"),
  v("meetingLink", "Meeting URL (video)", "https://meet…"),
  v("location", "Location (in-person)", "4th Floor, Indore"),
];

export const GROUPS = [
  "Leave",
  "WFH",
  "Payroll",
  "Recruitment",
  "Onboarding",
  "Employee",
  "Offboarding",
  "Documents & Tax",
] as const;

const EVENTS: EmailEvent[] = [
  // ── Leave ──────────────────────────────────────────────────────────────
  {
    key: "leave.decision", label: "Leave Approved / Rejected", group: "Leave",
    variables: [
      EMP_NAME,
      v("leaveTypeName", "Leave type", "Casual Leave"),
      v("startDate", "From date", "20 Jul 2026"),
      v("endDate", "To date", "22 Jul 2026"),
      v("duration", "Total days", "3"),
      v("approverName", "Approver's name", "Anita Rao"),
      v("comment", "Approver's note", "Approved."),
      v("decision", "Approved or Rejected", "Approved"),
    ],
  },
  {
    key: "leave.approval-chain-missing", label: "Leave Approval Chain Missing (admin)", group: "Leave",
    variables: [
      v("requesterName", "Employee who requested leave", "Rahul Verma"),
      v("settingsUrl", "Link to configure the approval chain", "https://…/settings"),
    ],
  },

  // ── WFH ────────────────────────────────────────────────────────────────
  ...(["wfh.approver-request", "wfh.approved", "wfh.next-approver", "wfh.rejected"] as const).map((key) => ({
    key,
    label: {
      "wfh.approver-request": "WFH Request → Approver",
      "wfh.approved": "WFH Approved → Employee",
      "wfh.next-approver": "WFH → Next Approver (HR)",
      "wfh.rejected": "WFH Rejected → Employee",
    }[key],
    group: "WFH",
    variables: [
      v("recipientName", "Recipient's name", "Anita Rao"),
      EMP_NAME, EMP_CODE,
      v("jobTitle", "Employee's role", "Engineer"),
      v("department", "Department", "Engineering"),
      v("startDate", "From date", "20 Jul 2026"),
      v("endDate", "To date", "21 Jul 2026"),
      v("days", "Number of days", "2"),
      v("session", "Half-day session (if any)", "First Half"),
      v("reason", "Reason for WFH", "Home internet setup"),
      v("status", "Approved / Rejected (decisions)", "Approved"),
      v("comment", "Approver's note", "OK"),
      v("portalUrl", "Link to the request", "https://…"),
    ],
  })),

  // ── Payroll ──────────────────────────────────────────────────────────────
  {
    key: "payslip.release", label: "Payslip Released", group: "Payroll",
    variables: [
      EMP_NAME, EMP_CODE,
      v("period", "Pay period label", "July 2026"),
      v("payDate", "Pay date", "31 Jul 2026"),
      v("grossEarnings", "Gross earnings", "₹1,20,000"),
      v("totalDeductions", "Total deductions", "₹18,000"),
      v("netPay", "Net pay", "₹1,02,000"),
      v("payslipUrl", "Link to payslip", "https://…"),
    ],
  },

  // ── Recruitment ────────────────────────────────────────────────────────
  {
    key: "candidate-doc.request", label: "Candidate Document Request", group: "Recruitment",
    variables: [
      CANDIDATE, JOB_TITLE,
      v("bundle", "Document bundle", "PreOffer"),
      v("portalUrl", "Upload portal link", "https://…"),
      v("expiryDays", "Link validity (days)", "7"),
      v("senderName", "HR contact name", "Anita Rao"),
      v("senderPhone", "HR contact phone", "+91…"),
      v("startDate", "Tentative start date", "1 Aug 2026"),
      v("location", "Work location", "Indore"),
      v("submissionDeadline", "Submit-by date", "25 Jul 2026"),
      v("docsListHtml", "Pre-rendered list of requested documents (HTML)", "<ul>…</ul>"),
    ],
  },
  {
    key: "candidate-doc.reminder", label: "Candidate Document Reminder", group: "Recruitment",
    variables: [
      CANDIDATE, JOB_TITLE,
      v("bundle", "Document bundle", "PreOffer"),
      v("portalUrl", "Upload portal link", "https://…"),
      v("expiryDays", "Link validity (days)", "7"),
      v("reminderLevel", "Reminder level (1-3)", "2"),
      v("submissionDeadline", "Submit-by date", "25 Jul 2026"),
      v("docsListHtml", "Pre-rendered list of pending documents (HTML)", "<ul>…</ul>"),
    ],
  },
  {
    key: "candidate-doc.review", label: "Candidate Document Rejected", group: "Recruitment",
    variables: [
      CANDIDATE,
      v("docName", "Document that was rejected", "PAN Card"),
      v("requisitionTitle", "Requisition title", "Senior Engineer"),
      v("reason", "Rejection reason", "Blurry scan"),
    ],
  },
  {
    key: "requisition.approval", label: "Requisition Approval Request", group: "Recruitment",
    variables: [
      v("recipientName", "Approver's name", "Anita Rao"),
      v("raiserName", "Who raised the requisition", "Rahul Verma"),
      v("title", "Requisition title", "Senior Engineer"),
      v("department", "Department", "Engineering"),
      v("positions", "Number of positions", "2"),
      v("employmentType", "Employment type", "FullTime"),
      v("workLocation", "Work location", "Office"),
      v("justification", "Justification", "Team expansion"),
      v("reviewUrl", "Link to review", "https://…"),
      v("openDeptHeadcount", "Open reqs in the dept", "3"),
    ],
  },
  {
    key: "requisition.decision", label: "Requisition Decision → Raiser", group: "Recruitment",
    variables: [
      v("recipientName", "Recipient's name", "Rahul Verma"),
      v("raiserName", "Who raised the requisition", "Rahul Verma"),
      v("title", "Requisition title", "Senior Engineer"),
      v("department", "Department", "Engineering"),
      v("positions", "Number of positions", "2"),
      v("employmentType", "Employment type", "FullTime"),
      v("workLocation", "Work location", "Office"),
      v("status", "Approved / Rejected", "Approved"),
      v("comment", "Approver's note", "Go ahead"),
      v("reviewUrl", "Link to requisition", "https://…"),
    ],
  },
  {
    key: "interview.candidate-invite", label: "Interview Invite → Candidate", group: "Recruitment",
    variables: [CANDIDATE, JOB_TITLE, ...INTERVIEW_ROWS, v("interviewerName", "Interviewer's name", "Anita Rao")],
  },
  {
    key: "interview.interviewer-notify", label: "Interview Assignment → Interviewer", group: "Recruitment",
    variables: [
      v("interviewerName", "Interviewer's name", "Anita Rao"),
      CANDIDATE,
      v("candidateEmail", "Candidate email", "priya@…"),
      v("candidatePhone", "Candidate phone", "+91…"),
      JOB_TITLE, ...INTERVIEW_ROWS,
      v("roundName", "Interview round", "Technical"),
      v("resumeUrl", "Candidate resume link", "https://…"),
      v("feedbackUrl", "Feedback form link", "https://…"),
      v("jobDescription", "Job description (technical rounds only; empty otherwise)", "We are looking for…"),
    ],
  },
  {
    key: "interview.feedback-request", label: "Interview Feedback Request", group: "Recruitment",
    variables: [
      v("interviewerName", "Interviewer's name", "Anita Rao"),
      CANDIDATE, JOB_TITLE,
      v("interviewDate", "Interview date", "15 Jul 2026"),
      v("interviewTime", "Interview time", "3:00 PM"),
      v("duration", "Duration", "45 min"),
      v("type", "Interview mode", "Video"),
      v("roundName", "Interview round", "Technical"),
      v("feedbackUrl", "Feedback form link", "https://…"),
      v("expiryDays", "Link validity (days)", "7"),
    ],
  },
  {
    key: "interview.feedback-reminder", label: "Interview Feedback Reminder", group: "Recruitment",
    variables: [
      v("interviewerName", "Interviewer's name", "Anita Rao"),
      CANDIDATE, JOB_TITLE,
      v("interviewDate", "Interview date", "15 Jul 2026"),
      v("interviewTime", "Interview time", "3:00 PM"),
      v("duration", "Duration", "45 min"),
      v("type", "Interview mode", "Video"),
      v("roundName", "Interview round", "Technical"),
      v("feedbackUrl", "Feedback form link", "https://…"),
      v("expiryDays", "Link validity (days)", "7"),
      v("reminderLevel", "Reminder level (1-3)", "2"),
    ],
  },
  {
    key: "interview.hr-notify", label: "Interview Feedback Submitted → HR", group: "Recruitment",
    variables: [
      v("hrName", "HR recipient's name", "Anita Rao"),
      v("interviewerName", "Interviewer's name", "Vikram S"),
      CANDIDATE,
      v("requisitionTitle", "Requisition title", "Senior Engineer"),
      v("overallRating", "Overall rating", "4/5"),
      v("recommendation", "Recommendation", "Hire"),
      v("strengths", "Strengths", "Strong DSA"),
      v("concerns", "Concerns", "—"),
      v("overallComments", "Overall comments", "Solid candidate"),
    ],
  },
  {
    key: "recruit.interview-invite", label: "Pipeline Interview Invite → Candidate", group: "Recruitment",
    variables: [CANDIDATE, JOB_TITLE, ...INTERVIEW_ROWS, v("interviewerName", "Interviewer's name", "Anita Rao")],
  },
  {
    key: "recruit.offer-branded", label: "Offer Letter (branded, with PDF)", group: "Recruitment",
    variables: [
      CANDIDATE, JOB_TITLE,
      v("designation", "Designation", "Senior Engineer"),
      v("offeredCTC", "Offered CTC", "₹18,00,000"),
      v("joiningDate", "Joining date", "1 Aug 2026"),
      v("joiningBonus", "Joining bonus", "₹50,000"),
      v("expiresAt", "Offer expiry", "20 Jul 2026"),
    ],
  },
  {
    key: "recruit.offer-default", label: "Offer Letter (default, no PDF)", group: "Recruitment",
    variables: [
      CANDIDATE, JOB_TITLE,
      v("designation", "Designation", "Senior Engineer"),
      v("offeredCTC", "Offered CTC", "₹18,00,000"),
      v("joiningDate", "Joining date", "1 Aug 2026"),
      v("joiningBonus", "Joining bonus", "₹50,000"),
      v("expiresAt", "Offer expiry", "20 Jul 2026"),
      v("department", "Department", "Engineering"),
      v("reportingTo", "Reporting manager", "Anita Rao"),
      v("companyAddress", "Company address", "Indore"),
      v("signatoryName", "Signatory name", "Anita Rao"),
      v("signatoryDesignation", "Signatory designation", "Head HR"),
      v("letterDate", "Letter date", "10 Jul 2026"),
    ],
  },
  {
    key: "recruit.joining-letter", label: "Joining Letter → Candidate", group: "Recruitment",
    variables: [
      CANDIDATE, JOB_TITLE, EMP_CODE,
      v("designation", "Designation", "Senior Engineer"),
      v("offeredCTC", "Offered CTC", "₹18,00,000"),
      v("joiningDate", "Joining date", "1 Aug 2026"),
      v("department", "Department", "Engineering"),
      v("reportingTo", "Reporting manager", "Anita Rao"),
      v("workLocation", "Work location", "Indore"),
      v("companyAddress", "Company address", "Indore"),
      v("signatoryName", "Signatory name", "Anita Rao"),
      v("signatoryDesignation", "Signatory designation", "Head HR"),
      v("letterDate", "Letter date", "10 Jul 2026"),
    ],
  },
  {
    key: "recruit.rejection", label: "Application Rejected → Candidate", group: "Recruitment",
    variables: [
      CANDIDATE, JOB_TITLE,
      v("coolingMonths", "Re-apply cooling period in months (blank if none)", "6"),
      v("coolingUntil", "Date they can re-apply (blank if none)", "18 Jan 2027"),
    ],
  },
  {
    key: "recruit.interview-passed", label: "Interview Cleared → Candidate", group: "Recruitment",
    variables: [CANDIDATE, JOB_TITLE, v("roundName", "Interview round cleared", "Round 2")],
  },
  {
    key: "recruit.on-hold", label: "Application On Hold → Candidate", group: "Recruitment",
    variables: [CANDIDATE, JOB_TITLE],
  },
  {
    key: "recruit.reconfirm", label: "Still Interested? (restored from hold) → Candidate", group: "Recruitment",
    variables: [CANDIDATE, JOB_TITLE],
  },

  // ── Onboarding / Employee ────────────────────────────────────────────────
  {
    key: "employee.welcome", label: "Welcome Email → Employee", group: "Onboarding",
    variables: [
      EMP_NAME, EMP_CODE,
      v("jobTitle", "Role", "Engineer"),
      v("department", "Department", "Engineering"),
      v("dateOfJoining", "Date of joining", "1 Aug 2026"),
      v("managerName", "Reporting manager", "Anita Rao"),
      v("portalUrl", "Portal login link", "https://…"),
    ],
  },
  {
    key: "employee.invite", label: "Invitation Email → New User", group: "Onboarding",
    variables: [
      v("firstName", "Invitee's first name", "Rahul"),
      v("orgName", "Organization name", "Acme Corp"),
      v("inviterName", "Who sent the invite", "Anita Rao"),
      v("role", "Assigned role", "Employee"),
      v("inviteUrl", "Invitation accept link", "https://…"),
    ],
  },
  {
    key: "employee.confirmation", label: "Employment Confirmation → Employee", group: "Employee",
    variables: [
      EMP_NAME, EMP_CODE,
      v("jobTitle", "Role", "Engineer"),
      v("designation", "Designation", "Senior Engineer"),
      v("department", "Department", "Engineering"),
      v("dateOfJoining", "Date of joining", "1 Feb 2026"),
      v("confirmationDate", "Confirmation date", "1 Aug 2026"),
      v("probationMonths", "Probation length (months)", "6"),
      v("managerName", "Reporting manager", "Anita Rao"),
      v("nextReviewDate", "Next review date", "1 Feb 2027"),
      v("revisedCTC", "Revised annual CTC", "₹20,00,000"),
      v("revisedDesignation", "Revised designation", "Lead Engineer"),
      v("effectiveDate", "Revision effective date", "1 Aug 2026"),
      v("probationNoticeDays", "Notice days during probation", "15"),
      v("confirmedNoticePeriodMonths", "Notice period after confirmation (months)", "2"),
    ],
  },

  // ── Offboarding ──────────────────────────────────────────────────────────
  {
    key: "offboarding.resignation-notice", label: "Resignation Notice → Manager", group: "Offboarding",
    variables: [
      v("recipientName", "Manager's name", "Anita Rao"),
      EMP_NAME, EMP_CODE,
      v("jobTitle", "Role", "Engineer"),
      v("department", "Department", "Engineering"),
      v("resignationDate", "Resignation date", "10 Jul 2026"),
      v("lastWorkingDate", "Last working date", "9 Sep 2026"),
      v("noticePeriodDays", "Notice period (days)", "60"),
      v("reason", "Reason", "Career growth"),
      v("notes", "Additional notes", "—"),
      v("portalUrl", "Link to offboarding", "https://…"),
    ],
  },

  // ── Documents & Tax ──────────────────────────────────────────────────────
  {
    key: "form12bb.ack", label: "Form 12BB Acknowledgment", group: "Documents & Tax",
    variables: [
      EMP_NAME, EMP_CODE,
      v("financialYear", "Financial year", "2026-27"),
      v("submittedAt", "Submission date", "10 Jul 2026"),
      v("rentPaid", "Rent paid (HRA)", "₹2,40,000"),
      v("ltaAmount", "LTA amount", "₹30,000"),
      v("homeLoanInterest", "Home-loan interest", "₹1,50,000"),
      v("chapterVIATotal", "Chapter VI-A total", "₹1,50,000"),
      v("signedFileUrl", "Signed form link", "https://…"),
    ],
  },
];

/** Every event, each with `companyName` guaranteed present in its variables. */
export const EMAIL_EVENTS: EmailEvent[] = EVENTS.map((e) => ({
  ...e,
  variables: e.variables.some((x) => x.name === "companyName") ? e.variables : [...e.variables, COMPANY],
}));

export const EMAIL_EVENT_MAP: Record<string, EmailEvent> = Object.fromEntries(
  EMAIL_EVENTS.map((e) => [e.key, e]),
);

/** Set of variable names an override for `key` may reference (empty if key unknown). */
export function allowedVarNames(key: string): Set<string> {
  const e = EMAIL_EVENT_MAP[key];
  return new Set(e ? e.variables.map((x) => x.name) : []);
}

export function isKnownEmailKey(key: string): boolean {
  return key in EMAIL_EVENT_MAP;
}
