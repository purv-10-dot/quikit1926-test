import { NextRequest, NextResponse } from "next/server";
import { boqService, BOQError } from "@/lib/boq";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getTenantContext, badRequest } from "@/lib/auth/context";
import { parsePagination } from "@/lib/http/pagination";

/**
 * BOQ API — per Aakar BOQ Import Developer Spec v2.0 §8.3
 *
 * GET  /api/projects/:projectId/boq  — Fetch BOQ tree with rollups
 * POST /api/projects/:projectId/boq  — Add a manual BOQ item (when unlocked)
 *
 * v2 permission gate: `construction.boq` + (view | create).
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

export const GET = auth.view<{ projectId: string }>(
  async (_authCtx, req: NextRequest, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const { searchParams } = new URL(req.url);
      const category = searchParams.get("category") ?? undefined;
      const leavesOnly = searchParams.get("leavesOnly") === "true";

      const p = parsePagination(req);

      if (leavesOnly) {
        const leaves = await boqService.getLeafItems(ctx, params.projectId, category);
        if (p.paginated) {
          const sliced = leaves.slice(p.skip, p.skip + p.take);
          return NextResponse.json({
            data: sliced,
            total: leaves.length,
            page: p.page,
            pageSize: p.pageSize,
            hasMore: p.skip + sliced.length < leaves.length,
          });
        }
        return NextResponse.json({
          data: leaves,
          total: leaves.length,
        });
      }

      const { items, summary, lockState } = await boqService.getBOQTree(
        ctx,
        params.projectId,
        category,
      );

      const renderedAll = items;
      const renderedSlice = p.paginated
        ? renderedAll.slice(p.skip, p.skip + p.take)
        : renderedAll;

      const dataSlice = renderedSlice.map((i) => ({
        ...i,
        boqNo: i.boq_no,
        parentBoqNo: i.parent_boq_no,
        isGroup: i.is_group,
        isLeaf: !i.is_group,
        description: i.display_name || i.description,
        uomCode: i.unit,
        quantity: i.tender_qty !== null ? String(i.tender_qty) : "",
        contractRate: i.rate !== null ? String(i.rate) : "",
        contractAmount: String(i.estimate_amt ?? 0),
        subDoneQty: String(i.sub_done_qty ?? 0),
        selfDoneQty: String(i.self_done_qty ?? 0),
        executedQty: String(i.done_qty ?? 0),
        billedQty: String(i.billed_qty ?? 0),
        progressPercent: String(i.completion_pct ?? 0),
        startDate: i.start_date ?? null,
        endDate: i.end_date ?? null,
      }));

      const responseBody: Record<string, unknown> = {
        items: renderedSlice,
        data: dataSlice,
        total: renderedAll.length,
        summary: {
          contractValue: summary.contractValue,
          workingValue: summary.contractValue,
          executedValue: summary.executedValue,
          billedValue: summary.billedValue,
          balanceValue: summary.balanceValue,
          progressPercent: summary.progressPercent,
          leafCount: summary.leafCount,
          groupCount: summary.groupCount,
          totalCount: summary.totalCount,
        },
        lockState: {
          isLocked: lockState.is_locked,
          lockedAt: lockState.locked_at,
          lockedBy: lockState.locked_by,
          version: lockState.version,
        },
      };
      if (p.paginated) {
        responseBody.page = p.page;
        responseBody.pageSize = p.pageSize;
        responseBody.hasMore = p.skip + renderedSlice.length < renderedAll.length;
      }
      return NextResponse.json(responseBody);
    } catch (err) {
      return toErrorResponse(err);
    }
  },
);

export const POST = auth.create<{ projectId: string }>(
  async (_authCtx, req: NextRequest, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const body = await req.json();

      const item: Record<string, unknown> = {
        boq_no: body.boqNo ?? body.boq_no ?? null,
        parent_boq_no: body.parentBoqNo ?? body.parent_boq_no ?? null,
        category: body.category ?? "Civil Building",
        display_name:
          body.description ??
          body.displayName ??
          body.display_name ??
          body.name ??
          "",
        description: body.fullDescription ?? body.description ?? "",
        unit: body.uomCode ?? body.unit ?? null,
        tender_qty:
          body.quantity !== undefined
            ? parseFloat(body.quantity)
            : body.tenderQty !== undefined
            ? parseFloat(body.tenderQty)
            : null,
        rate:
          body.contractRate !== undefined
            ? parseFloat(body.contractRate)
            : body.rate !== undefined
            ? parseFloat(body.rate)
            : null,
        is_group: body.isGroup ?? false,
        depth: body.depth ?? 0,
        start_date: body.startDate ?? body.start_date ?? null,
        end_date: body.endDate ?? body.end_date ?? null,
      };

      if (!item.display_name) {
        return badRequest("Description / name is required");
      }
      if (typeof item.tender_qty === "number" && item.tender_qty < 0) {
        return badRequest("Tender quantity cannot be negative");
      }

      const inserted = await boqService.addManualItem(
        ctx,
        params.projectId,
        item as Parameters<typeof boqService.addManualItem>[2],
      );
      return NextResponse.json(inserted, { status: 201 });
    } catch (err) {
      return toErrorResponse(err);
    }
  },
);
