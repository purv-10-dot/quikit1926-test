import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * All issue links in a project, in one batch. The Timeline (Gantt) view uses
 * this to draw dependency connection arrows between linked work items without
 * making one request per issue.
 */
export const GET = withProjectAccess<{ id: string }>(
  async ({ orgId, projectId }) => {
    const links = await db.qtIssueLink.findMany({
      where: { orgId, projectId },
      select: {
        id: true,
        type: true,
        sourceIssueId: true,
        targetIssueId: true,
      },
    });
    return NextResponse.json({ success: true, data: links });
  },
  { paramKey: "id" },
);
