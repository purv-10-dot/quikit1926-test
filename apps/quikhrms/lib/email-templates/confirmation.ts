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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inr(n: number): string {
  return `&#8377; ${Number(n).toLocaleString("en-IN")}`;
}

// Convert integer (≤ 99,99,99,999) to Indian English words. Simple impl, sufficient for salary amounts.
function numberToIndianWords(num: number): string {
  if (!Number.isFinite(num) || num < 0) return "";
  num = Math.round(num);
  if (num === 0) return "Zero";

  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const twoDigit = (n: number): string => {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    const t = Math.floor(n / 10), o = n % 10;
    return tens[t] + (o ? "-" + ones[o] : "");
  };
  const threeDigit = (n: number): string => {
    const h = Math.floor(n / 100), r = n % 100;
    return (h ? ones[h] + " Hundred" + (r ? " " : "") : "") + twoDigit(r);
  };

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const rest = num % 1000;

  return [
    crore ? threeDigit(crore) + " Crore" : "",
    lakh ? threeDigit(lakh) + " Lakh" : "",
    thousand ? threeDigit(thousand) + " Thousand" : "",
    rest ? threeDigit(rest) : "",
  ].filter(Boolean).join(" ").trim();
}

export function buildConfirmationEmail(data: ConfirmationEmailData): { subject: string; html: string } {
  const senderName = data.senderName ?? "HR Department";
  const senderPosition = data.senderPosition ?? "Human Resources";
  const effectiveDate = data.effectiveDate ?? data.confirmationDate;
  const monthlySalary = data.revisedMonthlySalary ?? (data.revisedCTC ? Math.round(data.revisedCTC / 12) : null);
  const probationNotice = data.probationNoticeDays ?? 15;
  const confirmedNotice = data.confirmedNoticePeriodMonths ?? 2;

  const reviewMonth = data.reviewMonth ?? (data.nextReviewDate
    ? new Date(data.nextReviewDate).toLocaleDateString("en-IN", { month: "long" })
    : null);

  const summaryRow = (k: string, v: string) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#6b7280;width:170px;vertical-align:top;">${k}</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">${v}</td>
    </tr>`;

  const summary: Array<[string, string] | null> = [
    ["Employee Code", escapeHtml(data.employeeCode)],
    ["Date of Joining", escapeHtml(data.dateOfJoining)],
    ["Confirmation Date", escapeHtml(data.confirmationDate)],
    data.probationMonths ? ["Probation Duration", `${data.probationMonths} month${data.probationMonths === 1 ? "" : "s"}`] : null,
    data.designation || data.jobTitle ? ["Designation", escapeHtml(data.revisedDesignation ?? data.designation ?? data.jobTitle ?? "")] : null,
    data.department ? ["Department", escapeHtml(data.department)] : null,
    data.managerName ? ["Reporting Manager", escapeHtml(data.managerName)] : null,
    monthlySalary ? ["Revised Monthly Salary", inr(monthlySalary)] : null,
    data.revisedCTC ? ["Revised Annual CTC", inr(data.revisedCTC)] : null,
    data.nextReviewDate ? ["Next Performance Review", escapeHtml(data.nextReviewDate)] : null,
  ];
  const summaryFiltered = summary.filter((r): r is [string, string] => r !== null);

  const salarySentence = monthlySalary
    ? `With effect from <strong>${escapeHtml(effectiveDate)}</strong>, your salary has been revised to <strong>INR ${monthlySalary.toLocaleString("en-IN")} (${numberToIndianWords(monthlySalary)}) per month</strong>.${reviewMonth ? ` Your remuneration will be reviewed again in the month of <strong>${escapeHtml(reviewMonth)}</strong> after a proper evaluation and will be based on your performance.` : ""}`
    : `${reviewMonth ? `Your remuneration will be reviewed in the month of <strong>${escapeHtml(reviewMonth)}</strong> based on your performance.` : ""}`;

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f0fdf4;color:#1f2937;">
  <div style="max-width:680px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

      <div style="background:linear-gradient(135deg,#047857 0%,#10b981 60%,#34d399 100%);padding:32px 36px;color:#ffffff;">
        <p style="margin:0;font-size:11px;letter-spacing:3px;font-weight:700;text-transform:uppercase;opacity:0.9;">Employment Confirmed</p>
        <h1 style="margin:6px 0 0;font-size:24px;font-weight:800;letter-spacing:-0.3px;">Congratulations, ${escapeHtml(data.employeeName)}!</h1>
      </div>

      <div style="padding:28px 36px 4px;">
        <p style="margin:0;font-size:14px;color:#111827;">Hello <strong>${escapeHtml(data.employeeName)}</strong>,</p>

        <p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
          In recognition of your performance and contribution to the company, <strong>${escapeHtml(data.companyName)}</strong> is pleased to confirm your employment with the organization.
        </p>

        ${salarySentence ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">${salarySentence}</p>` : ""}

        ${data.revisedDesignation ? `
          <p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
            Your designation stands updated to <strong>${escapeHtml(data.revisedDesignation)}</strong> with effect from this confirmation date.
          </p>` : ""}

        <p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
          You will now be entitled to all the benefits of confirmed employment as per company norms.
        </p>

        <div style="margin:18px 0 0;padding:14px 18px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#065f46;letter-spacing:0.5px;text-transform:uppercase;">Confirmation Summary</p>
          <table style="border-collapse:collapse;width:100%;">${summaryFiltered.map(([k, v]) => summaryRow(k, v)).join("")}</table>
        </div>

        <p style="margin:22px 0 0;font-size:13px;font-weight:700;color:#111827;letter-spacing:0.5px;text-transform:uppercase;">Separation Policy</p>
        <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;line-height:1.7;color:#1f2937;">
          <li style="margin:3px 0;">During probation, a notice period of <strong>${probationNotice} days</strong> is required.</li>
          <li style="margin:3px 0;">After confirmation, you will be required to serve a <strong>${confirmedNotice}-month notice period</strong> in case of separation from the organization.</li>
          <li style="margin:3px 0;">However, a notice period will not be applicable if the company terminates employment due to misconduct or non-performance.</li>
          <li style="margin:3px 0;">The company reserves the right to waive or reduce the notice period based on individual circumstances and management discretion.</li>
        </ul>

        <p style="margin:18px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">Kindly share your acceptance for the same.</p>

        ${data.portalUrl ? `
          <div style="text-align:center;margin:24px 0 0;">
            <a href="${data.portalUrl}" style="display:inline-block;background:#10b981;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Open Employee Portal</a>
          </div>` : ""}

        <p style="margin:24px 0 0;font-size:14px;color:#111827;">Best regards,</p>
        <p style="margin:20px 0 0;font-size:14px;font-weight:700;color:#111827;">${escapeHtml(senderName)}</p>
        <p style="margin:2px 0 0;font-size:13px;color:#4b5563;">${escapeHtml(senderPosition)}</p>
        <p style="margin:2px 0 28px;font-size:13px;color:#4b5563;">${escapeHtml(data.companyName)}</p>
      </div>

      <div style="background:#f9fafb;padding:14px 36px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;">
        Automated confirmation letter from ${escapeHtml(data.companyName)} HRMS.
      </div>
    </div>
  </div>
</body>
</html>`;

  return {
    subject: `Employment Confirmation — ${data.companyName}`,
    html,
  };
}
