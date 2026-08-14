import { emailShell, hero, alert, para, esc } from "./_base";

export interface PayrollResetOtpData {
  recipientName: string;
  otpCode: string;
  expiresInMinutes: number;
  requestedByName: string;
  companyName: string;
}

/** → the requester + every "admin"-role employee, when a payroll reset is initiated. */
export function buildPayrollResetOtpEmail(data: PayrollResetOtpData): { subject: string; html: string } {
  const codeBlock = `
    <div style="text-align:center;margin:24px 0;">
      <span style="display:inline-block;padding:14px 28px;font-size:32px;font-weight:700;letter-spacing:8px;
        color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;font-family:monospace;">
        ${esc(data.otpCode)}
      </span>
    </div>`;

  const body = `${hero({
    title: "Payroll Reset Requested",
    subtitle: `${esc(data.requestedByName)} requested a full payroll data reset for your organization.`,
    accent: "red",
    emoji: "⚠️",
  })}${para(`Hi ${esc(data.recipientName)}, enter the code below to confirm this destructive action. This will permanently delete all pay runs, payslips, salary structures and statutory configuration.`)}${codeBlock}${alert(
    "warning",
    `This code expires in <b>${data.expiresInMinutes} minutes</b> and can be used once. If you did not expect this, ignore this email and alert your admin team — the reset cannot proceed without this code.`,
  )}`;

  const html = emailShell({
    accent: "red",
    companyName: data.companyName,
    preheader: `Payroll reset verification code: ${data.otpCode}`,
    body,
  });

  return { subject: `Payroll reset verification code: ${data.otpCode}`, html };
}
