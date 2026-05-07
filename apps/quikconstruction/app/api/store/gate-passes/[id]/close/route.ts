import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  findGatePassById,
  patchGatePassStatus,
} from "@/lib/store/gate-pass-repository";

/**
 * POST /api/store/gate-passes/:id/close
 *
 * "Quick Close" — wraps up an approved gate pass once the physical
 * movement is complete (material returned for outward-returnable, GRN
 * posted for inward, etc.). Only valid from `approved` or `issued`;
 * draft / pending_approval / rejected / already-closed entries are
 * rejected.
 *
 * Body (optional): { remarks?, actualReturnDate? }
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

  const gp = await findGatePassById(ctx.tenantId, params.id);
  if (!gp) {
    return NextResponse.json({ error: "Gate Pass not found" }, { status: 404 });
  }
  const status = String(gp.status ?? "").toLowerCase();
  if (!["approved", "issued"].includes(status)) {
    return NextResponse.json(
      {
        error: `Cannot close gate pass in status: ${gp.status}. Only approved or issued gate passes can be closed.`,
      },
      { status: 400 },
    );
  }

  const now = new Date();
  const actualReturn = body.actualReturnDate
    ? new Date(body.actualReturnDate)
    : now;

  const updated = await patchGatePassStatus(ctx.tenantId, gp.id, {
    status: "closed",
    closedAt: now,
    closedBy: ctx.userId,
    actualReturnDate: actualReturn,
    updatedBy: ctx.userId,
  });

  return NextResponse.json(updated);
}
