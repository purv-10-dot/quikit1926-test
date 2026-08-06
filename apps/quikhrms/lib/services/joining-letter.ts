import { prisma } from "@/lib/prisma";
import { generateJoiningLetterPdf } from "@/lib/services/joining-letter-pdf";
import type { MailAttachment } from "@/lib/services/mailer";

function fmtDate(d?: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

/**
 * Build the employee's joining (appointment) letter PDF as an email attachment,
 * reusing the same data + renderer as the GET /joining-letter route. Returns null
 * if the employee is missing.
 */
export async function getJoiningLetterAttachment(orgId: string, employeeId: string): Promise<MailAttachment | null> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, orgId, deletedAt: null },
    select: {
      firstName: true, lastName: true, employeeCode: true, jobTitle: true,
      dateOfJoining: true, workLocation: true,
      designation: { select: { title: true } },
      department: { select: { name: true } },
      reportingManager: { select: { firstName: true, lastName: true } },
    },
  });
  if (!employee) return null;

  const [company, salary] = await Promise.all([
    prisma.companySettings.findUnique({ where: { orgId } }),
    prisma.employeeSalary.findFirst({
      where: { orgId, employeeId, isActive: true, deletedAt: null },
      orderBy: { effectiveFrom: "desc" },
      select: { ctc: true },
    }),
  ]);

  const managerName = employee.reportingManager
    ? `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}`.trim()
    : null;

  const pdf = await generateJoiningLetterPdf({
    employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
    employeeCode: employee.employeeCode,
    jobTitle: employee.jobTitle ?? employee.designation?.title ?? "",
    designation: employee.designation?.title ?? employee.jobTitle ?? "",
    department: employee.department?.name ?? null,
    reportingManager: managerName,
    joiningDate: fmtDate(employee.dateOfJoining),
    offeredCTC: salary?.ctc != null ? Number(salary.ctc) : null,
    workLocation: employee.workLocation ?? null,
    companyName: company?.companyName ?? "Your Company",
    companyAddress: [company?.addressLine1, company?.addressLine2, company?.city, company?.state]
      .filter(Boolean).join(", ") || null,
    letterDate: fmtDate(new Date()),
    letterheadKey: company?.letterheadKey ?? null,
    sealKey: company?.sealKey ?? null,
    signatureKey: company?.signatureKey ?? null,
    signatoryName: company?.signatoryName ?? null,
    signatoryDesignation: company?.signatoryDesignation ?? null,
    footer: company?.offerLetterFooter ?? null,
    bodyTemplate: company?.joiningLetterBody ?? null,
  });

  const filename = `Joining-Letter-${employee.firstName}-${employee.lastName}.pdf`.replace(/\s+/g, "");
  return { filename, content: Buffer.from(pdf), contentType: "application/pdf" };
}
