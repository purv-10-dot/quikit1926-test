import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { notFound, forbidden, internalError } from "@/lib/api-response";
import { generateJoiningLetterPdf } from "@/lib/services/joining-letter-pdf";

function fmtDate(d?: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

/**
 * GET /api/v1/hrms/onboarding/[employeeId]/joining-letter
 * Renders the employee's joining (appointment) letter as a PDF using the org's
 * branding + editable template. `?download=1` forces a file download; default
 * opens inline in the browser.
 */
export const GET = withAuth(async (req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    // The letter exposes CTC — only the employee themselves or an onboarding /
    // employee reader may fetch it (blocks IDOR / salary leak across employees).
    const isSelf = userId === params.employeeId;
    const canRead = permissions.includes("*")
      || permissions.includes("hrms.onboarding.read")
      || permissions.includes("hrms.onboarding.write")
      || permissions.includes("hrms.employee.read");
    if (!isSelf && !canRead) return forbidden();

    const employee = await prisma.employee.findFirst({
      where: { id: params.employeeId, orgId, deletedAt: null },
      select: {
        firstName: true, lastName: true, employeeCode: true, jobTitle: true,
        dateOfJoining: true, workLocation: true,
        designation: { select: { title: true } },
        department: { select: { name: true } },
        reportingManager: { select: { firstName: true, lastName: true } },
      },
    });
    if (!employee) return notFound("Employee not found");

    const [company, salary] = await Promise.all([
      prisma.companySettings.findUnique({ where: { orgId } }),
      prisma.employeeSalary.findFirst({
        where: { orgId, employeeId: params.employeeId, isActive: true, deletedAt: null },
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

    const download = new URL(req.url).searchParams.get("download") === "1";
    const name = `Joining-Letter-${employee.firstName}-${employee.lastName}.pdf`.replace(/\s+/g, "");
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      },
    });
  } catch (error) {
    console.error("GET /onboarding/[employeeId]/joining-letter error:", error);
    return internalError();
  }
});
