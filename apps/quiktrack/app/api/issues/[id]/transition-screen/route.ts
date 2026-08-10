import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { getTransitionScreen } from "@/lib/services/screens/transition-screen";

/**
 * GET /api/issues/[id]/transition-screen?to=<statusId>
 * The "Show a screen" screen (fields + required flags) that gates moving this
 * issue to `to`. Returns { screen: null } when no screen gates the move.
 */
export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, req: NextRequest, { params }) => {
  const toStatusId = new URL(req.url).searchParams.get("to") ?? "";
  const issue = await db.qtIssue.findFirst({
    where: { id: params.id, orgId, isDeleted: false },
    select: { projectId: true, type: true, statusId: true },
  });
  if (!issue) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (!toStatusId) return NextResponse.json({ success: true, data: { screen: null } });

  const screen = await getTransitionScreen({
    orgId,
    projectId: issue.projectId,
    issueType: issue.type ?? "TASK",
    fromStatusId: issue.statusId,
    toStatusId,
  });
  return NextResponse.json({ success: true, data: { screen } });
});
