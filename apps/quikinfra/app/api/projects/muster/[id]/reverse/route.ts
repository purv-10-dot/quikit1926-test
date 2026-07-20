import { toErrorMessage } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { err as envelopeErr } from "@/lib/http/envelope";
import { DomainError } from "@/lib/http";
import { reverseMuster } from "@/lib/labour/muster-repository";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.dpr", "reverse");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const body = await req.json().catch(() => ({}));
  try {
    const next = await reverseMuster(ctx.orgId, params.id, ctx.userId, body?.reason ?? "");
    if (!next) return NextResponse.json({ error: "Muster not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (e: unknown) {
    if (e instanceof DomainError) return envelopeErr(e.code, e.message, e.httpStatus);
    console.error("[muster.reverse] failed:", e);
    return envelopeErr("INTERNAL_ERROR", toErrorMessage(e, "Failed to reverse muster"), 500);
  }
}
