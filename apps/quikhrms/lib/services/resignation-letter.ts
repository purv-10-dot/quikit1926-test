import { prisma } from "@/lib/prisma";
import { generateResignationLetterPdf } from "@/lib/services/resignation-letter-pdf";
import type { MailAttachment } from "@/lib/services/mailer";

function fmtDate(d?: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

/** Read the editable resignation-letter body via raw SQL (new column, not in the generated client). */
async function getResignationBody(orgId: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<{ resignationLetterBody: string | null }[]>`
      SELECT "resignationLetterBody" FROM "app_quikhrms"."CompanySettings" WHERE "orgId" = ${orgId} LIMIT 1`;
    return rows[0]?.resignationLetterBody ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the resignation-acceptance letter PDF for an employee (used by both the
 * GET route and the email attachment). Returns null if there's no offboarding
 * record (a resignation letter needs the resignation date + LWD).
 */
export async function buildResignationLetterPdf(orgId: string, employeeId: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, orgId, deletedAt: null },
    select: {
      firstName: true, lastName: true, employeeCode: true, jobTitle: true,
      designation: { select: { title: true } },
      department: { select: { name: true } },
    },
  });
  if (!employee) return null;

  const instance = await prisma.offboardingInstance.findFirst({
    where: { orgId, employeeId, deletedAt: null },
    select: { resignationDate: true, lastWorkingDate: true },
  });
  if (!instance) return null;

  const company = await prisma.companySettings.findUnique({ where: { orgId } });
  const bodyTemplate = await getResignationBody(orgId);

  // Notice period = whole days between resignation date and last working day.
  const noticeDays = Math.max(
    0,
    Math.round((new Date(instance.lastWorkingDate).getTime() - new Date(instance.resignationDate).getTime()) / 86400000),
  );

  const pdf = await generateResignationLetterPdf({
    employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
    employeeCode: employee.employeeCode,
    designation: employee.designation?.title ?? employee.jobTitle ?? "",
    department: employee.department?.name ?? null,
    resignationDate: fmtDate(instance.resignationDate),
    lastWorkingDay: fmtDate(instance.lastWorkingDate),
    noticePeriod: `${noticeDays} days`,
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
    bodyTemplate,
  });

  const filename = `Resignation-Acceptance-${employee.firstName}-${employee.lastName}.pdf`.replace(/\s+/g, "");
  return { buffer: pdf, filename };
}

/** Resignation-acceptance letter as an email attachment (for the offboarding Send Email step). */
export async function getResignationLetterAttachment(orgId: string, employeeId: string): Promise<MailAttachment | null> {
  const built = await buildResignationLetterPdf(orgId, employeeId);
  if (!built) return null;
  return { filename: built.filename, content: built.buffer, contentType: "application/pdf" };
}
