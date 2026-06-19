import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { validationError, internalError, notFound } from "@/lib/api-response";
import { loadPartB, buildPdf } from "@/lib/services/form16-pdf";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const fy = url.searchParams.get("fy");
    const employeeId = url.searchParams.get("employeeId");
    if (!fy || !employeeId) return validationError("fy and employeeId parameters required");

    const data = await loadPartB(orgId, employeeId, fy);
    if (!data) return notFound("No released payslips for this employee in selected FY");

    const pdf = await buildPdf(data);
    const fileName = `Form16-PartB-${data.employee.employeeCode}-FY${fy}.pdf`;
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("GET /payroll/form16/pdf error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"] });
