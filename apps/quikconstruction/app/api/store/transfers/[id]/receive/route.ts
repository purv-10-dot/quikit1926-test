import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
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
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }

  const st = await findStockTransferById(ctx.tenantId, params.id);
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

  const updated = await patchStockTransferStatus(ctx.tenantId, st.id, {
    status: "received",
    receivedAt: now,
    receivedBy: ctx.userId,
    receivedDate,
    updatedBy: ctx.userId,
  });

  return NextResponse.json(updated);
}
