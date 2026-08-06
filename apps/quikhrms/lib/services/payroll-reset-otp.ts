import { prisma } from "@/lib/prisma";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildPayrollResetOtpEmail } from "@/lib/email-templates/payroll-reset";
import { findAdminEmployees } from "@/lib/rbac/permission-holders";
import { generateOtp, otpExpiry, hashOtp, OTP_TTL_MINUTES } from "@/lib/auth/otp";

/**
 * Issues a fresh OTP for the "Reset Payroll Setup" danger-zone action and
 * emails it to the requester plus every "admin"-role employee. Invalidates
 * any earlier unused OTP for the tenant first, so only the latest is live.
 */
export async function requestPayrollResetOtp(orgId: string, requestedById: string): Promise<{ sent: number }> {
  const requester = await prisma.employee.findFirst({
    where: { id: requestedById, orgId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, workEmail: true },
  });

  const admins = await findAdminEmployees(orgId);

  const recipients = new Map<string, { firstName: string; lastName: string; workEmail: string }>();
  if (requester?.workEmail) recipients.set(requester.workEmail, requester);
  for (const a of admins) if (a.workEmail) recipients.set(a.workEmail, a);

  await prisma.payrollResetOtp.deleteMany({ where: { orgId, usedAt: null } });

  const { raw, hash } = generateOtp();
  await prisma.payrollResetOtp.create({
    data: { orgId, codeHash: hash, requestedBy: requestedById, expiresAt: otpExpiry() },
  });

  const requestedByName = requester ? `${requester.firstName} ${requester.lastName}`.trim() : "An admin";
  const company = await prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } });
  const companyName = company?.companyName ?? "QuikIT HRMS";

  await Promise.all(
    Array.from(recipients.values()).map((r) =>
      resolveAndSend(orgId, {
        key: "payroll.reset-otp",
        to: r.workEmail,
        vars: {
          recipientName: `${r.firstName} ${r.lastName}`.trim(),
          otpCode: raw,
          expiresInMinutes: OTP_TTL_MINUTES,
          requestedByName,
          companyName,
        },
        fallback: () =>
          buildPayrollResetOtpEmail({
            recipientName: `${r.firstName} ${r.lastName}`.trim(),
            otpCode: raw,
            expiresInMinutes: OTP_TTL_MINUTES,
            requestedByName,
            companyName,
          }),
      }).catch((err) => console.error("[payroll-reset] otp email failed:", err)),
    ),
  );

  return { sent: recipients.size };
}

/** Verifies a submitted code against the latest unused OTP; marks it used on success. */
export async function verifyPayrollResetOtp(orgId: string, code: string): Promise<boolean> {
  const otp = await prisma.payrollResetOtp.findFirst({
    where: { orgId, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.codeHash !== hashOtp(code)) return false;

  await prisma.payrollResetOtp.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
  return true;
}
