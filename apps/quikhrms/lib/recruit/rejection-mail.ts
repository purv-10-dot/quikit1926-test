import { prisma } from "@/lib/prisma";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildRejectionEmail } from "@/lib/email-templates/application-rejected";

/**
 * Send the candidate rejection email (customizable via the `recruit.rejection`
 * template). Adds a re-apply cooling-period note when the org has one configured
 * — UNLESS the rejection is penalty-free (`exempt`, e.g. requisition cancelled /
 * not selected after a hold-resume), in which case no cooling note is shown.
 *
 * Best-effort: never throws, so it can't break the reject flow. Fire it with
 * `void sendRejectionEmail(...)`.
 */
export async function sendRejectionEmail(
  orgId: string,
  args: { to: string; candidateName: string; jobTitle: string; exempt?: boolean },
): Promise<void> {
  try {
    if (!args.to) return;
    const company = await prisma.companySettings.findUnique({
      where: { orgId }, select: { companyName: true, candidateCoolingMonths: true },
    });
    const companyName = company?.companyName ?? "QuikIT HRMS";
    const coolingMonths = args.exempt ? 0 : (company?.candidateCoolingMonths ?? 0);

    let coolingUntil: string | null = null;
    if (coolingMonths > 0) {
      const d = new Date();
      d.setMonth(d.getMonth() + coolingMonths);
      coolingUntil = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    }

    const base = { candidateName: args.candidateName, jobTitle: args.jobTitle, companyName };
    await resolveAndSend(orgId, {
      key: "recruit.rejection",
      to: args.to,
      vars: { ...base, coolingMonths: coolingMonths || "", coolingUntil: coolingUntil ?? "" },
      fallback: () => buildRejectionEmail({ ...base, coolingMonths, coolingUntil }),
    });
  } catch (err) {
    console.error("[rejection-mail] send failed:", err);
  }
}
