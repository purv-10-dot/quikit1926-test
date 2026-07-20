import { toErrorMessage } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { err as envelopeErr } from "@/lib/http/envelope";
import { DomainError } from "@/lib/http";
import { previewLabourRab } from "@/lib/rab/labour-rab-service";

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.rab", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const body = await req.json();
  if (!body?.projectId || !body?.workOrderId || !body?.billUpto) {
    return envelopeErr("VALIDATION", "projectId, workOrderId and billUpto are required", 400);
  }
  try {
    const preview = await previewLabourRab({
      orgId: ctx.orgId,
      projectId: body.projectId,
      workOrderId: body.workOrderId,
      billUpto: body.billUpto,
      retentionPercent: body.retentionPercent,
    });
    return NextResponse.json({ data: preview });
  } catch (e: unknown) {
    if (e instanceof DomainError) return envelopeErr(e.code, e.message, e.httpStatus);
    console.error("[labour-rab.preview] failed:", e);
    return envelopeErr("INTERNAL_ERROR", toErrorMessage(e, "Failed to preview labour RA bill"), 500);
  }
}
