import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findStockTransferById,
  patchStockTransferStatus,
} from "@/lib/store/stock-transfer-repository";

/**
 * POST /api/store/transfers/:id/dispatch
 *
 * Marks an approved Stock Transfer as `dispatched` once the truck
 * has left the source location. Only valid from `approved`;
 * draft / pending / rejected / already-dispatched transfers are
 * rejected. The next transition (`in_transit` → `received`) is
 * handled by `/receive`.
 *
 * Body (optional): { vehicleNo?, dispatchedAt?, remarks? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireStoreAction("construction.transfer", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.transfer", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for store.transfer`, 403);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }

  const st = await findStockTransferById(ctx.orgId, params.id);
  if (!st) {
    return NextResponse.json(
      { error: "Stock Transfer not found" },
      { status: 404 },
    );
  }
  const status = String(st.status ?? "").toLowerCase();
  if (status !== "approved") {
    return NextResponse.json(
      {
        error: `Cannot dispatch stock transfer in status: ${st.status}. Only approved transfers can be dispatched.`,
      },
      { status: 400 },
    );
  }

  const dispatchedAt = body.dispatchedAt
    ? new Date(body.dispatchedAt)
    : new Date();

  const updated = await patchStockTransferStatus(ctx.orgId, st.id, {
    status: "dispatched",
    dispatchedAt,
    dispatchedBy: ctx.userId,
    updatedBy: ctx.userId,
  });

  return NextResponse.json(updated);
}
