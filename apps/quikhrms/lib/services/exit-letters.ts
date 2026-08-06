import { prisma } from "@/lib/prisma";
import { generateLetterPdf, type LetterBranding } from "@/lib/services/letter-pdf";
import { DEFAULT_RELIEVING_LETTER_BODY, DEFAULT_EXPERIENCE_LETTER_BODY } from "@/lib/offboarding/exit-letter-fields";
import type { MailAttachment } from "@/lib/services/mailer";

export type ExitLetterType = "relieving" | "experience";

const COLUMN: Record<ExitLetterType, string> = {
  relieving: "relievingLetterBody",
  experience: "experienceLetterBody",
};
const DEFAULT_BODY: Record<ExitLetterType, string> = {
  relieving: DEFAULT_RELIEVING_LETTER_BODY,
  experience: DEFAULT_EXPERIENCE_LETTER_BODY,
};
const LETTER_LABEL: Record<ExitLetterType, string> = {
  relieving: "Relieving-Letter",
  experience: "Experience-Letter",
};

function fmtDate(d?: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

/** Read an editable exit-letter body via raw SQL (new columns, not in the client). */
async function getBody(orgId: string, type: ExitLetterType): Promise<string | null> {
  try {
    const col = COLUMN[type];
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, string | null>>>(
      `SELECT "${col}" AS body FROM "app_quikhrms"."CompanySettings" WHERE "orgId" = $1 LIMIT 1`,
      orgId,
    );
    return (rows[0]?.body as string | null) ?? null;
  } catch {
    return null;
  }
}

/** Build a relieving/experience letter PDF for an employee. Null if no offboarding record. */
export async function buildExitLetterPdf(orgId: string, employeeId: string, type: ExitLetterType): Promise<{ buffer: Buffer; filename: string } | null> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, orgId, deletedAt: null },
    select: {
      firstName: true, lastName: true, employeeCode: true, jobTitle: true, dateOfJoining: true,
      designation: { select: { title: true } },
      department: { select: { name: true } },
    },
  });
  if (!employee) return null;

  const instance = await prisma.offboardingInstance.findFirst({
    where: { orgId, employeeId, deletedAt: null },
    select: { lastWorkingDate: true },
  });
  if (!instance) return null;

  const company = await prisma.companySettings.findUnique({ where: { orgId } });
  const bodyTemplate = await getBody(orgId, type);

  const employeeName = `${employee.firstName} ${employee.lastName}`.trim();
  const joiningDate = fmtDate(employee.dateOfJoining);
  const lastWorkingDay = fmtDate(instance.lastWorkingDate);

  const values: Record<string, string> = {
    employeeName,
    employeeCode: employee.employeeCode ?? "",
    designation: employee.designation?.title ?? employee.jobTitle ?? "",
    department: employee.department?.name ?? "",
    joiningDate,
    lastWorkingDay,
    tenure: `${joiningDate} to ${lastWorkingDay}`,
    companyName: company?.companyName ?? "Your Company",
    companyAddress: [company?.addressLine1, company?.addressLine2, company?.city, company?.state].filter(Boolean).join(", "),
    letterDate: fmtDate(new Date()),
    signatoryName: company?.signatoryName ?? "",
    signatoryDesignation: company?.signatoryDesignation ?? "",
  };

  const branding: LetterBranding = {
    companyName: company?.companyName ?? "Your Company",
    companyAddress: values.companyAddress || null,
    letterheadKey: company?.letterheadKey ?? null,
    sealKey: company?.sealKey ?? null,
    signatureKey: company?.signatureKey ?? null,
    footer: company?.offerLetterFooter ?? null,
  };

  const buffer = await generateLetterPdf({ values, bodyTemplate, defaultBody: DEFAULT_BODY[type], branding });
  const filename = `${LETTER_LABEL[type]}-${employee.firstName}-${employee.lastName}.pdf`.replace(/\s+/g, "");
  return { buffer, filename };
}

export async function getExitLetterAttachment(orgId: string, employeeId: string, type: ExitLetterType): Promise<MailAttachment | null> {
  const built = await buildExitLetterPdf(orgId, employeeId, type);
  if (!built) return null;
  return { filename: built.filename, content: built.buffer, contentType: "application/pdf" };
}
