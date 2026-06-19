import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextRequest, NextResponse } from "next/server";
import { boqService, BOQError } from "@/lib/boq";

/**
 * RAB — billable balance per BOQ leaf (RA Bill Phase 1).
 *
 * GET /api/projects/rab/billable?projectId=&category=
 *
 * The read-only half of the double-billing invariant:
 *
 *     billable = executed − billed
 *       executed = subDoneQty + selfDoneQty   (cumulative, approved DPRs)
 *       billed   = billedQty                  (cumulative, approved RABs)
 *
 * Returns one row per BOQ leaf whose un-billed balance is > 0. Leaves that
 * are fully billed (billable <= 0) are omitted — there is nothing left to
 * bill against them. Groups are never returned (only leaves carry qty).
 *
 * No writes; the ledger is untouched. Quantities reuse the same rollup the
 * BOQ tree read uses, so executed/billed here match the BOQ screen exactly.
 */

const QTY_DP = 4;
const MONEY_DP = 2;

function roundQty(n: number): number {
  return Number(n.toFixed(QTY_DP));
}
function roundMoney(n: number): number {
  return Number(n.toFixed(MONEY_DP));
}

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.rab", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? "";
  const category = searchParams.get("category") ?? undefined;

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  // Per-user project scope: a site user can never read a project they're not
  // assigned to via the query string. Return an empty result rather than
  // leaking the project's existence.
  if (ctx.projectIds !== undefined && !ctx.projectIds.includes(projectId)) {
    return NextResponse.json({ data: [], total: 0 });
  }

  try {
    // getLeafItems is org-scoped and returns the rolled-up leaves where
    // done_qty = sub_done_qty + self_done_qty (executed) and billed_qty is
    // the cumulative billed quantity.
    const leaves = await boqService.getLeafItems(ctx, projectId, category);

    const data = leaves
      .map((i) => {
        const executed = roundQty(i.done_qty ?? 0);
        const billed = roundQty(i.billed_qty ?? 0);
        const billable = roundQty(executed - billed);
        const rate = Number(i.rate ?? 0);
        return {
          boqItemId: i.id,
          boqNo: i.boq_no,
          category: i.category ?? "",
          description: i.display_name || i.description || "",
          unit: i.unit ?? "",
          rate: String(rate),
          executedQty: String(executed),
          billedQty: String(billed),
          billableQty: String(billable),
          billableAmount: String(roundMoney(billable * rate)),
        };
      })
      .filter((r) => Number(r.billableQty) > 0);

    return NextResponse.json({ data, total: data.length });
  } catch (err: unknown) {
    if (err instanceof BOQError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus },
      );
    }
    const message = err instanceof Error ? err.message : "Failed to compute billable";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
