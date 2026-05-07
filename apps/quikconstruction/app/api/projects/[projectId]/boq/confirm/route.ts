import { NextRequest, NextResponse } from "next/server";
import { boqService, BOQError } from "@/lib/boq";
import { requirePermission, badRequest } from "@/lib/auth/context";

/**
 * BOQ Confirm — per spec §8.2
 * POST /api/projects/:projectId/boq/confirm
 * Body: { batchId: string }
 *
 * Requires `boq.import` permission.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const ctxOrResponse = await requirePermission("boq.import");
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  try {
    const body = await req.json();
    if (!body.batchId) {
      return badRequest("batchId is required");
    }

    const result = await boqService.confirmImport(ctx, params.projectId, body.batchId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (err instanceof BOQError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: err.httpStatus }
      );
    }
    return NextResponse.json(
      { error: e.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
