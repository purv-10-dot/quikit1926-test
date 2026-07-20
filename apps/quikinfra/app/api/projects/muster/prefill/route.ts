import { toErrorMessage } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { err as envelopeErr } from "@/lib/http/envelope";
import { DomainError } from "@/lib/http";
import { prefillMuster } from "@/lib/labour/muster-repository";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.dpr", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const date = searchParams.get("date");
  if (!projectId || !date) {
    return envelopeErr("VALIDATION", "projectId and date are required", 400);
  }
  try {
    const rows = await prefillMuster({
      orgId: ctx.orgId,
      projectId,
      date,
      engagementType: searchParams.get("engagementType") ?? "CONTRACTOR",
      contractorId: searchParams.get("contractorId"),
      shift: searchParams.get("shift") ?? "DAY",
    });
    return NextResponse.json({ data: rows });
  } catch (e: unknown) {
    if (e instanceof DomainError) return envelopeErr(e.code, e.message, e.httpStatus);
    console.error("[muster.prefill] failed:", e);
    return envelopeErr("INTERNAL_ERROR", toErrorMessage(e, "Failed to prefill muster"), 500);
  }
}
