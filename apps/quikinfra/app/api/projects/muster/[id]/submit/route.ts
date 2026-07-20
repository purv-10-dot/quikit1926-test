import { toErrorMessage } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { err as envelopeErr } from "@/lib/http/envelope";
import { DomainError } from "@/lib/http";
import { submitMuster } from "@/lib/labour/muster-repository";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.dpr", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  try {
    const next = await submitMuster(ctx.orgId, params.id, ctx.userId, new Date());
    if (!next) return NextResponse.json({ error: "Muster not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (e: unknown) {
    if (e instanceof DomainError) return envelopeErr(e.code, e.message, e.httpStatus);
    console.error("[muster.submit] failed:", e);
    return envelopeErr("INTERNAL_ERROR", toErrorMessage(e, "Failed to submit muster"), 500);
  }
}
