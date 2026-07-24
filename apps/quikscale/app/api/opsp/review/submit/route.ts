import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { emitOpspStatusChanged } from "@/lib/services/workflowEvents";
import { writeAuditLog } from "@/lib/api/auditLog";
import { resolveOpspOwnerOrSelf } from "@/lib/api/opspOwner";

const withOrgAuth = withOrgAuthForModule("opsp");

/**
 * POST /api/opsp/review/submit
 *
 * Marks an OPSP as fully reviewed for a fiscal period. Two effects:
 *   1. Locks the review surface for that period.
 *   2. Unlocks the next quarter in the OPSP create page (the page reads
 *      the list of reviewed periods from /api/opsp/config and uses it to
 *      gate the Quarter buttons).
 *
 * Pre-condition: the OPSP must already be `finalized`. We don't enforce row-level
 * completeness on the server — the submit button is only enabled in the UI when
 * every Action has an achieved value and every Rock has a status. Client-side gate
 * + server-side state transition is the same pattern as Finalize.
 *
 * Body: { year, quarter }
 */
export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const year = typeof body.year === "number" ? body.year : parseInt(body.year);
  const quarter = String(body.quarter ?? "");

  if (!year || !["Q1", "Q2", "Q3", "Q4"].includes(quarter)) {
    return NextResponse.json({ success: false, error: "Invalid year/quarter" }, { status: 400 });
  }

  // OPSP is org-shared: submit the review of the canonical owner's plan.
  const ownerId = await resolveOpspOwnerOrSelf(orgId, userId);

  const opsp = await db.oPSPData.findUnique({
    where: { orgId_userId_year_quarter: { orgId, userId: ownerId, year, quarter } },
    select: { id: true, status: true },
  });
  if (!opsp) {
    return NextResponse.json({ success: false, error: "OPSP not found" }, { status: 404 });
  }
  if (opsp.status !== "finalized" && opsp.status !== "reviewed") {
    return NextResponse.json(
      { success: false, error: "OPSP must be finalized before review can be submitted" },
      { status: 409 },
    );
  }

  await db.oPSPData.update({
    where: { id: opsp.id },
    data: { status: "reviewed", updatedBy: userId },
  });

  // QuikFlow: emit opsp.stage.changed + opsp.reviewed.
  emitOpspStatusChanged({
    orgId,
    opspId: opsp.id,
    owner: ownerId,
    quarter,
    year,
    before: opsp.status,
    after: "reviewed",
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "UPDATE",
    entityType: "OPSPData",
    entityId: `${orgId}:${ownerId}:${year}:${quarter}`,
    changes: ["status:reviewed"],
    reason: "OPSP review submitted",
  });

  return NextResponse.json({ success: true, data: { year, quarter, status: "reviewed" } });
});
