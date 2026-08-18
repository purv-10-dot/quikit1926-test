import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { notFound, internalError } from "@/lib/api-response";
import { buildAppraisalLetterPdf } from "@/lib/services/appraisal-letter";

/**
 * GET /api/v1/hrms/performance/appraisals/employee/[id]/letter
 * Renders the appraisal letter (revised CTC + salary breakdown) as a PDF.
 * `?download=1` forces a download; default opens inline. HR-only — this is a
 * formal compensation-revision letter, not general appraisal-read data.
 */
export const GET = withAuth(async (req: NextRequest, { orgId }, params) => {
  try {
    const built = await buildAppraisalLetterPdf(orgId, params.id);
    if (!built) return notFound("Appraisal or active salary not found for this employee");

    const download = new URL(req.url).searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(built.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${built.filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /performance/appraisals/employee/[id]/letter error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.performance.appraise"] });
