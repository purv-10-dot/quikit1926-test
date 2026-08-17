import { prisma } from "@/lib/prisma";
import { generateAppraisalLetterPdf, type AppraisalSalaryComponent } from "@/lib/services/appraisal-letter-pdf";
import { numberToIndianWords } from "@/lib/utils/number-to-words";

function fmtDate(d?: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

/** Read the editable appraisal-letter body via raw SQL (new column, not in the generated client). */
async function getAppraisalBody(orgId: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<{ appraisalLetterBody: string | null }[]>`
      SELECT "appraisalLetterBody" FROM "app_quikhrms"."CompanySettings" WHERE "orgId" = ${orgId} LIMIT 1`;
    return rows[0]?.appraisalLetterBody ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the appraisal letter PDF for a specific EmployeeAppraisal record.
 * Revised CTC = the employee's current active CTC scaled by the appraisal's
 * recommended salary revision % (0 if none was recorded — letter still
 * generates, just with no change reflected). Returns null when the
 * appraisal, employee, or an active salary aren't found.
 */
export async function buildAppraisalLetterPdf(orgId: string, appraisalId: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const appraisal = await prisma.employeeAppraisal.findFirst({
    where: { id: appraisalId, orgId, deletedAt: null },
    include: {
      employee: {
        select: {
          firstName: true, lastName: true, employeeCode: true, jobTitle: true,
          designation: { select: { title: true } },
          department: { select: { name: true } },
        },
      },
      cycle: { select: { endDate: true } },
    },
  });
  if (!appraisal) return null;

  const activeSalary = await prisma.employeeSalary.findFirst({
    where: { orgId, employeeId: appraisal.employeeId, isActive: true, deletedAt: null },
    orderBy: { effectiveFrom: "desc" },
    include: {
      structure: {
        include: { components: { include: { component: { select: { name: true, type: true } } } } },
      },
    },
  });
  if (!activeSalary) return null;

  const currentCtc = Number(activeSalary.ctc);
  const revisionPct = appraisal.salaryRevisionRecommended != null ? Number(appraisal.salaryRevisionRecommended) : 0;
  const revisedCtc = currentCtc * (1 + revisionPct / 100);

  const salaryComponents: AppraisalSalaryComponent[] = (activeSalary.structure?.components ?? []).map((c) => ({
    name: c.component.name,
    type: c.component.type,
    amountType: c.amountType,
    amountValue: c.amountValue != null ? Number(c.amountValue) : null,
  }));

  const company = await prisma.companySettings.findUnique({ where: { orgId } });
  const bodyTemplate = await getAppraisalBody(orgId);

  const nextAppraisalDate = appraisal.cycle?.endDate ? new Date(appraisal.cycle.endDate) : null;
  const nextAppraisalMonth = nextAppraisalDate
    ? new Date(nextAppraisalDate.getFullYear() + 1, nextAppraisalDate.getMonth(), 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : "";

  const pdf = await generateAppraisalLetterPdf({
    employeeName: `${appraisal.employee.firstName} ${appraisal.employee.lastName}`.trim(),
    employeeCode: appraisal.employee.employeeCode,
    designation: appraisal.employee.designation?.title ?? appraisal.employee.jobTitle ?? "",
    department: appraisal.employee.department?.name ?? null,
    appraisalDate: fmtDate(new Date()),
    effectiveDate: fmtDate(new Date()),
    revisedCtc,
    revisedCtcWords: `${numberToIndianWords(revisedCtc).replace(/\s*RUPEES\s*$/i, "")} Rupees Only`,
    nextAppraisalMonth,
    companyName: company?.companyName ?? "Your Company",
    companyAddress: [company?.addressLine1, company?.addressLine2, company?.city, company?.state]
      .filter(Boolean).join(", ") || null,
    letterDate: fmtDate(new Date()),
    letterheadKey: company?.letterheadKey ?? null,
    sealKey: company?.sealKey ?? null,
    signatureKey: company?.signatureKey ?? null,
    signatoryName: company?.signatoryName ?? "Authorised Signatory",
    signatoryDesignation: company?.signatoryDesignation ?? "Human Resources",
    footer: company?.offerLetterFooter ?? null,
    bodyTemplate,
    salaryComponents,
  });

  const filename = `Appraisal-Letter-${appraisal.employee.firstName}-${appraisal.employee.lastName}.pdf`.replace(/\s+/g, "");
  return { buffer: pdf, filename };
}
