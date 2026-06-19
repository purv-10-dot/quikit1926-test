import { baseLayout, infoTable } from "./_base";

export interface PayslipEmailInput {
  employeeName: string;
  employeeCode: string;
  companyName: string;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  payslipUrl?: string;
}

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function monthLabel(start: Date): string {
  return start.toLocaleString("en-IN", { month: "long", year: "numeric" });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function buildPayslipEmail(input: PayslipEmailInput): { subject: string; html: string } {
  const label = monthLabel(input.periodStart);
  const subject = `Payslip for ${label} — ${input.employeeName}`;

  const body = `
    <p style="margin:0 0 16px;font-size:14px;">
      Your payslip for <strong>${label}</strong> has been released.
    </p>
    ${infoTable([
      ["Employee Code", input.employeeCode],
      ["Period", `${formatDate(input.periodStart)} – ${formatDate(input.periodEnd)}`],
      ["Pay Date", formatDate(input.payDate)],
      ["Gross Earnings", INR.format(input.grossEarnings)],
      ["Total Deductions", INR.format(input.totalDeductions)],
      ["Net Pay", INR.format(input.netPay)],
    ])}
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
      For a full breakdown of earnings and deductions, view your payslip in the employee portal.
    </p>
  `;

  const html = baseLayout({
    title: "Payslip Released",
    subtitle: label,
    greeting: `Hi ${input.employeeName.split(" ")[0] ?? input.employeeName},`,
    body,
    ctaLabel: input.payslipUrl ? "View Payslip" : undefined,
    ctaUrl: input.payslipUrl,
    companyName: input.companyName,
  });

  return { subject, html };
}
