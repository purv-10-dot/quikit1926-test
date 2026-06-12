import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextRequest, NextResponse } from "next/server";
import { aggregateFromDpr } from "@/lib/rab/from-dpr";

/**
 * RAB — From-DPR preview (RA Bill Phase 2).
 *
 * GET /api/projects/rab/from-dpr?projectId=&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Aggregates approved DPR work in the period into clamped proposed bill
 * lines, flags lines reduced to the un-billed balance, and lists the
 * contributing DPRs. Preview-only — no writes, no ledger change.
 *
 * The response distinguishes "no approved DPRs in the period" (`noDprs:
 * true`) from "DPRs exist but their progress is already fully billed"
 * (`noDprs: false` with empty `lines`) so the UI can message correctly.
 */

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.rab", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? "";
  const fromStr = searchParams.get("from") ?? "";
  const toStr = searchParams.get("to") ?? "";

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  if (!fromStr || !toStr) {
    return NextResponse.json(
      { error: "from and to dates are required" },
      { status: 400 },
    );
  }

  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }
  if (from.getTime() > to.getTime()) {
    return NextResponse.json(
      { error: "from date must be on or before to date" },
      { status: 400 },
    );
  }

  // Per-user project scope: never let the query string reach an unassigned
  // project's data.
  if (ctx.projectIds !== undefined && !ctx.projectIds.includes(projectId)) {
    return NextResponse.json({
      lines: [],
      sources: [],
      total: "0",
      cappedLines: 0,
      noDprs: true,
    });
  }

  try {
    // The to-date is a calendar day; include its full span.
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);

    const result = await aggregateFromDpr(ctx, projectId, from, toEnd);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to build From-DPR preview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
