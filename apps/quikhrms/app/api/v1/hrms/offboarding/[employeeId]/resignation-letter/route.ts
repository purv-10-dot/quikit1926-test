import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { notFound, forbidden, internalError } from "@/lib/api-response";
import { buildResignationLetterPdf } from "@/lib/services/resignation-letter";

/**
 * GET /api/v1/hrms/offboarding/[employeeId]/resignation-letter
 * Renders the resignation-acceptance letter as a PDF. `?download=1` forces a
 * download; default opens inline.
 */
export const GET = withAuth(async (req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    // Only the employee themselves or an offboarding/employee reader may fetch
    // it — blocks cross-employee IDOR access to the resignation letter.
    const isSelf = userId === params.employeeId;
    const canRead = permissions.includes("*")
      || permissions.includes("hrms.offboarding.read")
      || permissions.includes("hrms.offboarding.write")
      || permissions.includes("hrms.employee.read");
    if (!isSelf && !canRead) return forbidden();

    const built = await buildResignationLetterPdf(orgId, params.employeeId);
    if (!built) return notFound("No resignation record found for this employee");

    const download = new URL(req.url).searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(built.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${built.filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /offboarding/[employeeId]/resignation-letter error:", error);
    return internalError();
  }
});
