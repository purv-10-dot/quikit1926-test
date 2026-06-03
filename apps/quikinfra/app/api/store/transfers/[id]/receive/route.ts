import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { db } from "@/lib/db/prisma";
import {
  findStockTransferById,
  patchStockTransferStatus,
} from "@/lib/store/stock-transfer-repository";

/**
 * POST /api/store/transfers/:id/receive
 *
 * Marks an approved Stock Transfer as `received` once the material
 * has physically landed at the destination store. Only valid from
 * `approved` or `dispatched` / `in_transit`; draft / pending /
 * rejected / already-received transfers are rejected.
 *
 * Body (optional): { receivedDate?, remarks? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireStoreAction("construction.transfer", "receive");
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
  if (!["approved", "dispatched", "in_transit"].includes(status)) {
    return NextResponse.json(
      {
        error: `Cannot receive stock transfer in status: ${st.status}. Only approved / dispatched / in-transit transfers can be received.`,
      },
      { status: 400 },
    );
  }

  const now = new Date();
  const receivedDate = body.receivedDate ? new Date(body.receivedDate) : now;

  // Move assets (if any) to the destination. Assets master stores
  // `projectId` + `currentLocation` (string label), so we update both.
  const destProjectId = st.destinationProjectId ?? st.sourceProjectId ?? null;
  const destLocationLabel = st.toLocationName ?? null;
  const assetIds = Array.isArray(st.assetLines)
    ? st.assetLines
        .map((l: any) => String(l.assetId ?? "").trim())
        .filter(Boolean)
    : [];
  if (assetIds.length > 0) {
    await (db as any).cnAsset.updateMany({
      where: { orgId: ctx.orgId, id: { in: assetIds } },
      data: {
        projectId: destProjectId,
        currentLocation: destLocationLabel,
        updatedBy: ctx.userId,
      },
    });
  }

  const updated = await patchStockTransferStatus(ctx.orgId, st.id, {
    status: "received",
    receivedAt: now,
    receivedBy: ctx.userId,
    receivedDate,
    updatedBy: ctx.userId,
  });

  return NextResponse.json(updated);
}
