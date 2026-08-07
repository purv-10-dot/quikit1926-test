import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { getFormRuntime } from "@/lib/services/forms/form-runtime.service";
import { FormStructureError } from "@/lib/services/forms/form-structure.service";

export const runtime = "nodejs";

/**
 * GET /api/forms/versions/[versionId]/runtime — the live form payload the agent
 * client renders + evaluates (structure + EvalRule-shaped rules).
 *
 * Agent-facing: requireApiUser only, NO settings gate. The tenant scope IS the
 * security here — getFormRuntime rejects (404) a version outside the caller's
 * tenant, so an agent can never read another tenant's form.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const { versionId } = await params;
    const data = await getFormRuntime(versionId, user.orgId);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e instanceof FormStructureError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
