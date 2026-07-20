import { toErrorMessage } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { err as envelopeErr } from "@/lib/http/envelope";
import { DomainError } from "@/lib/http";
import { idempotencyGuard } from "@/lib/workflow/idempotency";
import { approveMuster } from "@/lib/labour/muster-repository";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.dpr", "approve");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const guard = await idempotencyGuard(req, ctx, "labour.muster.approve");
  if (guard.cached) return guard.cachedResponse!;
  if (guard.conflict) return guard.conflictResponse!;

  try {
    const next = await approveMuster(ctx.orgId, params.id, ctx.userId);
    if (!next) return NextResponse.json({ error: "Muster not found" }, { status: 404 });
    await guard.commit(200, next);
    return NextResponse.json(next);
  } catch (e: unknown) {
    if (e instanceof DomainError) return envelopeErr(e.code, e.message, e.httpStatus);
    console.error("[muster.approve] failed:", e);
    return envelopeErr("INTERNAL_ERROR", toErrorMessage(e, "Failed to approve muster"), 500);
  }
}
