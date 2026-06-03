import { NextRequest, NextResponse } from "next/server";
import { boqService, BOQError } from "@/lib/boq";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getTenantContext } from "@/lib/auth/context";

/**
 * BOQ per-row endpoints — manual edit + delete.
 *
 * PUT    /api/projects/:projectId/boq/:itemId
 *        Partial update: displayName / unit / tenderQty / rate / scopeQty /
 *        category / description. Blocked when the BOQ is locked.
 *
 * DELETE /api/projects/:projectId/boq/:itemId
 *        Hard-delete one row. Blocked when the BOQ is locked.
 *
 * v2 permission gate: `construction.boq` + (edit | delete).
 */
const auth = withOrgAuthForResource("construction.boq");

function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof BOQError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.httpStatus },
    );
  }
  const message = err instanceof Error ? err.message : "Internal error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export const PUT = auth.edit<{ projectId: string; itemId: string }>(
  async (_authCtx, req: NextRequest, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const body = await req.json();

      const patch: Record<string, unknown> = {};
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
        patch,
      );
      return NextResponse.json(updated);
    } catch (err) {
      return toErrorResponse(err);
    }
  },
);

export const DELETE = auth.delete<{ projectId: string; itemId: string }>(
  async (_authCtx, _req, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      await boqService.deleteManualItem(ctx, params.projectId, params.itemId);
      return NextResponse.json({ success: true });
    } catch (err) {
      return toErrorResponse(err);
    }
  },
);
