import { NextRequest, NextResponse } from "next/server";
import { boqService, BOQError } from "@/lib/boq";
import { requirePermission } from "@/lib/auth/context";

/**
 * BOQ per-row endpoints — manual edit + delete.
 *
 * PUT    /api/projects/:projectId/boq/:itemId
 *        Partial update: displayName / unit / tenderQty / rate / scopeQty /
 *        category / description. Blocked when the BOQ is locked.
 *
 * DELETE /api/projects/:projectId/boq/:itemId
 *        Hard-delete one row. Blocked when the BOQ is locked.
 */

export async function PUT(
  req: NextRequest,
  { params }: { params: { projectId: string; itemId: string } }
) {
  const ctxOrResponse = await requirePermission("boq.write", {
    matrix: { menuKey: "pm.boq", action: "edit" },
  });
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  try {
    const body = await req.json();

    const patch: any = {};
    if (body.description !== undefined || body.displayName !== undefined) {
      patch.display_name = body.displayName ?? body.description;
    }
    if (body.fullDescription !== undefined) patch.description = body.fullDescription;
    if (body.uomCode !== undefined || body.unit !== undefined) {
      patch.unit = body.uomCode ?? body.unit ?? null;
    }
    if (body.quantity !== undefined || body.tenderQty !== undefined) {
      const raw = body.quantity ?? body.tenderQty;
      patch.tender_qty = raw === "" || raw === null ? null : Number(raw);
    }
    if (body.contractRate !== undefined || body.rate !== undefined) {
      const raw = body.contractRate ?? body.rate;
      patch.rate = raw === "" || raw === null ? null : Number(raw);
    }
    if (body.scopeQty !== undefined) patch.scope_qty = Number(body.scopeQty) || 0;
    if (body.category !== undefined) patch.category = body.category;
    if (body.startDate !== undefined || body.start_date !== undefined) {
      const raw = body.startDate ?? body.start_date;
      patch.start_date = raw ? String(raw) : null;
    }
    if (body.endDate !== undefined || body.end_date !== undefined) {
      const raw = body.endDate ?? body.end_date;
      patch.end_date = raw ? String(raw) : null;
    }

    const updated = await boqService.updateManualItem(
      ctx,
      params.projectId,
      params.itemId,
      patch
    );
    return NextResponse.json(updated);
  } catch (err: any) {
    if (err instanceof BOQError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus }
      );
    }
    return NextResponse.json(
      { error: err.message ?? "Internal error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { projectId: string; itemId: string } }
) {
  const ctxOrResponse = await requirePermission("boq.write", {
    matrix: { menuKey: "pm.boq", action: "delete" },
  });
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  try {
    await boqService.deleteManualItem(ctx, params.projectId, params.itemId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof BOQError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus }
      );
    }
    return NextResponse.json(
      { error: err.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
