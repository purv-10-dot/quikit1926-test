import { toErrorMessage } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { err as envelopeErr } from "@/lib/http/envelope";
import { DomainError } from "@/lib/http";
import { findMusterById, updateMuster } from "@/lib/labour/muster-repository";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.dpr", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const row = await findMusterById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "Muster not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.dpr", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const body = await req.json();
  try {
    const next = await updateMuster(ctx.orgId, params.id, {
      updatedBy: ctx.userId,
      remarks: body.remarks,
      workOrderId: body.workOrderId,
      lines: body.lines,
    });
    if (!next) return NextResponse.json({ error: "Muster not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (e: unknown) {
    if (e instanceof DomainError) return envelopeErr(e.code, e.message, e.httpStatus);
    console.error("[muster.update] failed:", e);
    return envelopeErr("INTERNAL_ERROR", toErrorMessage(e, "Failed to update muster"), 500);
  }
}
