import { NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

type Params = { id: string };

const decisionSchema = z.object({ decision: z.enum(["approved", "rejected"]) });

/**
 * PATCH /api/approvals/:id — approve or reject a pending approval. Recording
 * the decision resumes/stops the paused run (engine wiring lands with the
 * worker phase; here we persist the decision + who made it).
 */
export const PATCH = withOrgAuth<Params>(async ({ orgId, userId }, req, { params }) => {
  const approval = await db.wfApproval.findFirst({
    where: { id: params.id, orgId },
  });
  if (!approval) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (approval.status !== "pending") {
    return NextResponse.json({ success: false, error: "Already decided" }, { status: 409 });
  }

  const parsed = decisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }

  const updated = await db.wfApproval.update({
    where: { id: params.id },
    data: { status: parsed.data.decision, decidedBy: userId, decidedAt: new Date() },
    select: { id: true, status: true },
  });
  return NextResponse.json({ success: true, data: updated });
});
