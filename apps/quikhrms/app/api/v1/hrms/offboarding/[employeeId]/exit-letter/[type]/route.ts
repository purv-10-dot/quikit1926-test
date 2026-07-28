import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { notFound, validationError, forbidden, internalError } from "@/lib/api-response";
import { buildExitLetterPdf, type ExitLetterType } from "@/lib/services/exit-letters";

// GET /api/v1/hrms/offboarding/[employeeId]/exit-letter/[type]  (type = relieving | experience)
// Renders the relieving / experience letter as a PDF. `?download=1` forces download.
export const GET = withAuth(async (req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    // The exiting employee can view their own letter; otherwise require an
    // offboarding/employee read permission (mirrors the resignation-letter route).
    const isSelf = userId === params.employeeId;
    const canRead =
      permissions.includes("*") ||
      permissions.includes("hrms.offboarding.read") ||
      permissions.includes("hrms.offboarding.write") ||
      permissions.includes("hrms.employee.read");
    if (!isSelf && !canRead) return forbidden();

    const type = params.type as ExitLetterType;
    if (type !== "relieving" && type !== "experience") return validationError("Unknown letter type.");

    const built = await buildExitLetterPdf(orgId, params.employeeId, type);
    if (!built) return notFound("No offboarding record found for this employee");

    const download = new URL(req.url).searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(built.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${built.filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /offboarding/[employeeId]/exit-letter/[type] error:", error);
    return internalError();
  }
});
