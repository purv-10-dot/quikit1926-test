import { prisma } from "@/lib/prisma";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildForm12BBAckEmail } from "@/lib/email-templates/form12bb-acknowledgment";
import { findEmployeesWithPermission } from "@/lib/rbac/permission-holders";

interface DeclSummary {
  id: string;
  financialYear: string;
  hraClaimed: boolean;
  rentPaid: number;
  ltaClaimed: boolean;
  ltaAmount: number;
  homeLoanInterest: number;
  chapterVIATotal: number;
  signedFileUrl: string | null;
  documentCounts: { hra: number; lta: number; homeLoan: number; chapterVIA: number };
}

interface Submitter {
  employeeId: string;
  name: string;
  employeeCode: string;
  workEmail: string | null;
}

/**
 * Drop a Notification row into every payroll-admin's in-app inbox. Fire and
 * forget — never throw, logs failures.
 */
export async function notifyHrPayrollTeam(
  orgId: string,
  decl: DeclSummary,
  submitter: Submitter,
): Promise<{ recipientCount: number }> {
  try {
    // Payroll-admin gate today is hrms.settings.write — matches every
    // payroll route's requiredPermissions guard.
    const recipientIds = await findEmployeesWithPermission(orgId, "hrms.settings.write");

    // Don't notify the submitter about their own submission.
    const filtered = recipientIds.filter((id) => id !== submitter.employeeId);
    if (filtered.length === 0) return { recipientCount: 0 };

    const totalDocs =
      decl.documentCounts.hra + decl.documentCounts.lta +
      decl.documentCounts.homeLoan + decl.documentCounts.chapterVIA;

    const claims: string[] = [];
    if (decl.hraClaimed)              claims.push(`HRA ₹${decl.rentPaid.toLocaleString("en-IN")}`);
    if (decl.ltaClaimed)              claims.push(`LTA ₹${decl.ltaAmount.toLocaleString("en-IN")}`);
    if (decl.homeLoanInterest > 0)    claims.push(`Home Loan ₹${decl.homeLoanInterest.toLocaleString("en-IN")}`);
    if (decl.chapterVIATotal > 0)     claims.push(`Ch.VI-A ₹${decl.chapterVIATotal.toLocaleString("en-IN")}`);
    const claimSummary = claims.length > 0 ? claims.join(" · ") : "No active claims";

    await prisma.hrmsNotification.createMany({
      data: filtered.map((employeeId) => ({
        orgId,
        employeeId,
        type: "Info" as const,
        channel: "InApp" as const,
        title: `Form 12BB submitted — ${submitter.name} (${submitter.employeeCode})`,
        message: `FY ${decl.financialYear} · ${claimSummary} · ${totalDocs} supporting document${totalDocs === 1 ? "" : "s"}`,
        link: `/payroll/form12bb`,
        entityType: "Form12BBDeclaration",
        entityId: decl.id,
      })),
    });

    return { recipientCount: filtered.length };
  } catch (err) {
    console.error("[form12bb-notify] HR notification failed:", err);
    return { recipientCount: 0 };
  }
}

/**
 * Email the submitting employee a receipt of their declaration. Fire and
 * forget — never throw, logs failures. No-ops cleanly when SMTP isn't
 * configured (mailer handles that).
 */
export async function sendEmployeeAcknowledgment(
  orgId: string,
  decl: DeclSummary,
  submitter: Submitter,
): Promise<{ sent: boolean }> {
  try {
    if (!submitter.workEmail) {
      console.warn(`[form12bb-notify] Skipping ack — no workEmail for ${submitter.employeeCode}`);
      return { sent: false };
    }

    const company = await prisma.companySettings.findUnique({
      where: { orgId },
      select: { companyName: true },
    });

    const submittedAt = new Date();
    const ackData = {
      employeeName: submitter.name,
      employeeCode: submitter.employeeCode,
      companyName: company?.companyName ?? "your company",
      financialYear: decl.financialYear,
      submittedAt,
      hraClaimed: decl.hraClaimed,
      rentPaid: decl.rentPaid,
      ltaClaimed: decl.ltaClaimed,
      ltaAmount: decl.ltaAmount,
      homeLoanInterest: decl.homeLoanInterest,
      chapterVIATotal: decl.chapterVIATotal,
      signedFileUrl: decl.signedFileUrl,
      documentCounts: decl.documentCounts,
    };
    const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;

    await resolveAndSend(orgId, {
      key: "form12bb.ack",
      to: submitter.workEmail,
      vars: {
        employeeName: ackData.employeeName,
        employeeCode: ackData.employeeCode,
        financialYear: ackData.financialYear,
        submittedAt: submittedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
        rentPaid: inr(ackData.rentPaid),
        ltaAmount: inr(ackData.ltaAmount),
        homeLoanInterest: inr(ackData.homeLoanInterest),
        chapterVIATotal: inr(ackData.chapterVIATotal),
        signedFileUrl: ackData.signedFileUrl ?? "",
        companyName: ackData.companyName,
      },
      fallback: () => buildForm12BBAckEmail(ackData),
    });
    return { sent: true };
  } catch (err) {
    console.error("[form12bb-notify] Employee ack failed:", err);
    return { sent: false };
  }
}
