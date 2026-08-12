import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

type Params = { id: string };

/**
 * GET /api/runs/:id — a single run with its step-by-step timeline (PRD FR-G1).
 */
export const GET = withOrgAuth<Params>(async ({ orgId, userId }, _req, { params }) => {
  const run = await db.wfRun.findFirst({
    where: {
      id: params.id,
      orgId,
      workflow: { OR: [{ scope: "org" }, { scope: "personal", ownerId: userId }] },
    },
    include: {
      workflow: { select: { name: true, app: true } },
      steps: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!run) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: run });
});
