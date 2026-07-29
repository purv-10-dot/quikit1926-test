import { prisma } from "@/lib/prisma";
import { resolveAndSend } from "@/lib/email/resolve";
import { generateExitInterviewToken } from "./exit-interview-token";
import { appBaseUrl } from "@/lib/utils/app-url";

/**
 * Email the departing employee a link to the self-serve exit-interview form.
 * Stateless (signed) token — no DB column needed. Returns a status object; never throws.
 */
export async function sendExitInterviewInvite(orgId: string, instanceId: string): Promise<{ sent: boolean; to?: string; reason?: string }> {
  try {
    const instance = await prisma.offboardingInstance.findFirst({
      where: { id: instanceId, orgId, deletedAt: null },
    });
    if (!instance) return { sent: false, reason: "Offboarding not found" };
    if (instance.exitInterviewDone) return { sent: false, reason: "Exit interview already submitted" };

    const emp = await prisma.employee.findFirst({
      where: { id: instance.employeeId, orgId },
      select: { firstName: true, lastName: true, personalEmail: true, workEmail: true },
    });
    const to = emp?.personalEmail || emp?.workEmail || null;
    if (!to) return { sent: false, reason: "Employee has no email on file" };

    const company = await prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } });
    const companyName = company?.companyName ?? "Our Company";
    const employeeName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : "there";

    const { token } = generateExitInterviewToken(instanceId, orgId);
    const base = appBaseUrl();
    const link = `${base}/exit-interview/${token}`;

    const subject = `Exit interview — ${companyName}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;padding:20px;">
        <h2 style="color:#16a34a;margin:0 0 10px;">We'd value your feedback</h2>
        <p>Hi ${employeeName},</p>
        <p>As part of your offboarding from <strong>${companyName}</strong>, please take a few minutes to complete your <strong>exit interview</strong>. Your responses help us improve.</p>
        <p style="margin:20px 0;">
          <a href="${link}" style="background:#16a34a;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Fill exit interview</a>
        </p>
        <p style="color:#6b7280;font-size:12px;">Or paste this link into your browser:<br>${link}</p>
        <p style="margin-top:24px;color:#6b7280;font-size:12px;">${companyName} HR</p>
      </div>`;

    await resolveAndSend(orgId, {
      key: "offboarding.exit-interview",
      to,
      vars: { employeeName, companyName, portalUrl: link },
      fallback: () => ({ subject, html }),
    });

    return { sent: true, to };
  } catch (e) {
    console.error("sendExitInterviewInvite failed:", e);
    return { sent: false, reason: "Failed to send" };
  }
}
