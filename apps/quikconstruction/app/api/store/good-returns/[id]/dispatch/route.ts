import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  findGoodReturnById,
  patchGoodReturnStatus,
} from "@/lib/store/good-return-repository";

/**
 * POST /api/store/good-returns/:id/dispatch
 *
 * Marks an approved Good Return as `dispatched` once the material has
 * physically left the store on its way back to the vendor. Only valid
 * from `approved`; draft / pending_approval / rejected / already-
 * dispatched returns are rejected.
 *
 * Body (optional): { vehicleNo?, dispatchedAt?, remarks? }
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

  const gr = await findGoodReturnById(ctx.tenantId, params.id);
  if (!gr) {
    return NextResponse.json(
      { error: "Good Return not found" },
      { status: 404 },
    );
  }
  const status = String(gr.status ?? "").toLowerCase();
  if (status !== "approved") {
    return NextResponse.json(
      {
        error: `Cannot dispatch good return in status: ${gr.status}. Only approved returns can be dispatched.`,
      },
      { status: 400 },
    );
  }

  const dispatchedAt = body.dispatchedAt
    ? new Date(body.dispatchedAt)
    : new Date();

  const updated = await patchGoodReturnStatus(ctx.tenantId, gr.id, {
    status: "dispatched",
    dispatchedAt,
    dispatchedBy: ctx.userId,
    dispatchVehicleNo: body.vehicleNo ?? null,
    dispatchRemarks: body.remarks ?? null,
    updatedBy: ctx.userId,
  });

  return NextResponse.json(updated);
}
