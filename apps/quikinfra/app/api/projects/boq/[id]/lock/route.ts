import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("projects");

/**
 * POST /api/projects/boq/[id]/lock — draft → locked. Once locked, downstream
 * docs (Work Orders, RAB, DPR with boqItem refs) can safely reference it.
 * Lock is reversible via /unlock.
 */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const boq = await db.cnBOQ.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true, status: true } });
  if (!boq) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (boq.status === "locked") return NextResponse.json({ success: false, error: "Already locked" }, { status: 409 });
  const updated = await db.cnBOQ.update({
    where: { id: boq.id },
    data: { status: "locked", lockedAt: new Date(), lockedBy: userId, updatedBy: userId },
  });
  return NextResponse.json({ success: true, data: updated });
}, { permission: { resource: "construction.boq", action: "lock" } });
