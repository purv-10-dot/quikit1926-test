import { NextRequest, NextResponse } from "next/server";
import { boqService, BOQError } from "@/lib/boq";
import { requirePermission } from "@/lib/auth/context";

/**
 * Lock BOQ — per spec §11.4
 * POST /api/projects/:projectId/boq/lock
 *
 * Requires `boq.lock` permission.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const ctxOrResponse = await requirePermission("boq.lock");
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  try {
    const state = await boqService.lockBOQ(ctx, params.projectId);
    return NextResponse.json({ success: true, lockState: state });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (err instanceof BOQError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: err.httpStatus }
      );
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
