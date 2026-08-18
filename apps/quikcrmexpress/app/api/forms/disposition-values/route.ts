import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { getDispositionValues } from "@/lib/services/forms/disposition-values.service";

export const runtime = "nodejs";

const querySchema = z.object({
  activityId: z.string().trim().min(1),
});

/**
 * GET /api/forms/disposition-values?activityId=<id>
 *
 * The saved custom disposition field values for one activity, resolved to a
 * display-ready list ({ label, tabName, display }) for the "See form details"
 * view in the timeline + disposition tab. Agent-facing (agents view their own
 * dispositions); tenant-scoped inside the service so there's no cross-tenant read.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const parsed = querySchema.safeParse({
      activityId: req.nextUrl.searchParams.get("activityId"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const data = await getDispositionValues(user.orgId, parsed.data.activityId);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}
