import { emailShell, hero, detailBlock, alert, btnPrimary, para, esc, BRAND } from "./_base";

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
  const firstName = input.employeeName.split(" ")[0] ?? input.employeeName;

  const body = `
    ${hero({
      title: "Your Payslip",
      subtitle: `For ${esc(label)}. Please find your payslip summary below.`,
      accent: "blue",
    })}
    ${para(`Hi <strong>${esc(firstName)}</strong>, your payslip for <strong>${esc(label)}</strong> has been released.`)}
    ${alert(
      "success",
      `<span style="font-size:22px;font-weight:800;color:${BRAND.green};">₹${input.netPay.toLocaleString("en-IN")}</span>`,
      "Net Salary (In Hand)",
    )}
    ${detailBlock(
      [
        ["Gross Earnings", `₹${input.grossEarnings.toLocaleString("en-IN")}`],
        ["Total Deductions", `₹${input.totalDeductions.toLocaleString("en-IN")}`],
        ["Net Pay", `₹${input.netPay.toLocaleString("en-IN")}`],
        ["Pay Date", esc(formatDate(input.payDate))],
        ["Pay Period", `${esc(formatDate(input.periodStart))} – ${esc(formatDate(input.periodEnd))}`],
      ],
      { heading: "Salary Summary", accent: "blue" },
    )}
    ${input.payslipUrl ? btnPrimary("Download Payslip", input.payslipUrl, "blue") : ""}
    ${para(`<span style="font-size:13px;color:${BRAND.soft};">Employee Code: ${esc(input.employeeCode)} · For a full breakdown of earnings and deductions, view your payslip in the employee portal.</span>`)}
  `;

  const html = emailShell({
    accent: "blue",
    companyName: input.companyName,
    preheader: `Your payslip for ${label} — Net ${INR.format(input.netPay)}`,
    body,
    helpName: "Payroll Team",
  });

  return { subject, html };
}
