import { NextRequest, NextResponse } from "next/server";
import { boqService, BOQError } from "@/lib/boq";
import { requireAuth, requirePermission, badRequest } from "@/lib/auth/context";
import { parsePagination } from "@/lib/http/pagination";

/**
 * BOQ API — per Aakar BOQ Import Developer Spec v2.0 §8.3
 *
 * GET  /api/projects/:projectId/boq        — Fetch BOQ tree with rollups
 * POST /api/projects/:projectId/boq        — Add a manual BOQ item (when unlocked)
 *
 * Auth: both routes require an authenticated tenant context.
 *       POST additionally requires the `boq.write` permission.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const ctxOrResponse = await requirePermission("boq.read");
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") ?? undefined;
    const leavesOnly = searchParams.get("leavesOnly") === "true";

    // Pagination is opt-in via ?page= / ?pageSize=. The BOQ rollup math
    // ALWAYS runs on the full tree (parent totals depend on child rows),
    // so we compute summary on the full set and only slice the rendered
    // items afterwards. This is what powers the BOQ table's infinite-
    // scroll: page 1 returns the first N rows, page 2 the next N, etc.
    // Summary stays correct on every page.
    const p = parsePagination(req);

    if (leavesOnly) {
      // For transactional modules (DPR, WO, MR, RAB) — only leaves are usable
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
      category
    );

    // Slice the rendered items when pagination requested. `summary` and
    // `lockState` are computed/derived from the full tree above and
    // returned unchanged on every page so the header totals stay
    // accurate while the user scrolls.
    const renderedAll = items;
    const renderedSlice = p.paginated
      ? renderedAll.slice(p.skip, p.skip + p.take)
      : renderedAll;

    const dataSlice = renderedSlice.map((i) => ({
      ...i,
      // Legacy field aliases
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
      // Canonical per spec §8.3 — sliced when paginated.
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

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const ctxOrResponse = await requirePermission("boq.write");
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  try {
    const body = await req.json();

    // Map legacy fields to new schema
    const item: any = {
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

    const inserted = await boqService.addManualItem(ctx, params.projectId, item);
    return NextResponse.json(inserted, { status: 201 });
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
