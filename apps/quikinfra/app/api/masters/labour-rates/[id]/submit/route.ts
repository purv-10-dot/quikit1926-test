import { toErrorMessage } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { err as envelopeErr } from "@/lib/http/envelope";
import { DomainError } from "@/lib/http";
import { submitLabourRate } from "@/lib/masters/labour-rates-repository";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireMastersAction("edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  try {
    const next = await submitLabourRate(ctx.orgId, params.id, ctx.userId);
    if (!next) return NextResponse.json({ error: "Labour rate not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (e: unknown) {
    if (e instanceof DomainError) return envelopeErr(e.code, e.message, e.httpStatus);
    console.error("[labour-rate.submit] failed:", e);
    return envelopeErr("INTERNAL_ERROR", toErrorMessage(e, "Failed to submit labour rate"), 500);
  }
}
