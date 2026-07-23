import { emailShell, hero, detailBlock, alert, btnPrimary, para, esc } from "./_base";

export interface ConfirmationEmailData {
  employeeName: string;
  employeeCode: string;
  jobTitle?: string | null;
  designation?: string | null;
  department?: string | null;
  dateOfJoining: string;
  confirmationDate: string;
  effectiveDate?: string | null;        // when revised salary applies (defaults to confirmationDate)
  probationMonths?: number | null;
  managerName?: string | null;
  companyName: string;
  senderName?: string | null;
  senderPosition?: string | null;
  nextReviewDate?: string | null;
  reviewMonth?: string | null;          // e.g. "January" — derived if nextReviewDate provided
  revisedCTC?: number | null;           // annual
  revisedMonthlySalary?: number | null; // monthly — derived from CTC/12 if absent
  revisedDesignation?: string | null;
  probationNoticeDays?: number | null;        // default 15
  confirmedNoticePeriodMonths?: number | null;// default 2
  portalUrl?: string | null;
}

export function buildConfirmationEmail(data: ConfirmationEmailData): { subject: string; html: string } {
  const senderName = data.senderName ?? "HR Department";
  const effectiveDate = data.effectiveDate ?? data.confirmationDate;
  const monthlySalary = data.revisedMonthlySalary ?? (data.revisedCTC ? Math.round(data.revisedCTC / 12) : null);

  const confirmedNotice = data.confirmedNoticePeriodMonths ?? 2;
  const probationNotice = data.probationNoticeDays ?? 15;
  const hasNoticeData = data.confirmedNoticePeriodMonths != null || data.probationNoticeDays != null;

  const reviewMonth = data.reviewMonth ?? (data.nextReviewDate
    ? new Date(data.nextReviewDate).toLocaleDateString("en-IN", { month: "long" })
    : null);
  const reviewLabel = reviewMonth ?? data.nextReviewDate ?? null;

  const notNull = (r: [string, string] | null): r is [string, string] => r !== null;

  const designation = data.revisedDesignation ?? data.designation ?? data.jobTitle ?? null;

  const detailRows: Array<[string, string] | null> = [
    ["Employee", `${esc(data.employeeName)} (${esc(data.employeeCode)})`],
    designation ? ["Designation", esc(designation)] : null,
    data.department ? ["Department", esc(data.department)] : null,
    ["Date of Joining", esc(data.dateOfJoining)],
    ["Confirmation Date", esc(data.confirmationDate)],
    data.probationMonths ? ["Probation", `${data.probationMonths} months`] : null,
  ];

  const compRows: Array<[string, string] | null> = data.revisedCTC
    ? [
        ["Revised CTC", `&#8377;${esc(data.revisedCTC.toLocaleString("en-IN"))} per annum`],
        monthlySalary ? ["Monthly", `&#8377;${esc(monthlySalary.toLocaleString("en-IN"))}`] : null,
        ["Effective From", esc(effectiveDate)],
      ]
    : [];

  const body = [
    hero({ emoji: "🎉", title: "Employment Confirmed", subtitle: "Congratulations on successfully completing your probation!", accent: "green" }),
    para(`Hello <strong>${esc(data.employeeName)}</strong>, we're delighted to confirm your employment with <strong>${esc(data.companyName)}</strong> following the successful completion of your probation.`),
    detailBlock(detailRows.filter(notNull), { heading: "Confirmation Details", accent: "green" }),
    data.revisedCTC ? detailBlock(compRows.filter(notNull), { heading: "Revised Compensation", accent: "green" }) : "",
    alert("success", "Welcome aboard as a confirmed member of the team!"),
    hasNoticeData ? para(`Your notice period is now ${confirmedNotice} months (was ${probationNotice} days during probation).`) : "",
    reviewLabel ? para(`Your next review is scheduled for <strong>${esc(reviewLabel)}</strong>.`) : "",
    data.portalUrl ? btnPrimary("View Details", data.portalUrl, "green") : "",
  ].join("");

  const html = emailShell({
    accent: "green",
    companyName: data.companyName,
    preheader: "Congratulations! Your employment has been confirmed.",
    body,
    helpName: senderName,
    helpPhone: null,
  });

  return {
    subject: `Employment Confirmation — ${data.companyName}`,
    html,
  };
}
