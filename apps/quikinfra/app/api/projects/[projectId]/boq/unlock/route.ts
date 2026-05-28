import { NextRequest, NextResponse } from "next/server";
import { boqService, BOQError } from "@/lib/boq";
import { requirePermission } from "@/lib/auth/context";

/**
 * Unlock BOQ — Super Admin override per spec §11.4
 * POST /api/projects/:projectId/boq/unlock
 *
 * Requires `boq.unlock` permission (typically granted only to Super Admin).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const ctxOrResponse = await requirePermission("boq.unlock", {
    matrix: { menuKey: "pm.boq", action: "edit" },
  });
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  try {
    const state = await boqService.unlockBOQ(ctx, params.projectId);
    return NextResponse.json({ success: true, lockState: state });
  } catch (err: any) {
    if (err instanceof BOQError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
