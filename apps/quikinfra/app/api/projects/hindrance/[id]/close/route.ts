import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("projects");

/**
 * POST /api/projects/hindrance/[id]/close  body: { endDate?: string }
 * open → resolved/closed. If no endDate on the hindrance yet, caller provides
 * one so daysImpacted can be computed.
 */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const h = await db.cnHindrance.findFirst({ where: { id: params.id, orgId } });
  if (!h) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (h.status === "closed" || h.status === "resolved") {
    return NextResponse.json({ success: false, error: `Already ${h.status}` }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const endDateStr: string | undefined = body?.endDate;
  const endDate = endDateStr ? new Date(endDateStr) : (h.dateTo ?? new Date());
  const daysImpacted = Math.max(1, Math.ceil((endDate.getTime() - h.dateFrom.getTime()) / 86400000) + 1);

  const updated = await db.cnHindrance.update({
    where: { id: h.id },
    data: {
      status: "closed",
      dateTo: endDate,
      daysLost: daysImpacted,
      updatedBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: updated });
}, { permission: { resource: "construction.dpr", action: "edit" } });
