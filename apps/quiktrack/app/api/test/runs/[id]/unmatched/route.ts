import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { unmatchedForRun } from "@/lib/services/testIngest";
import { gateProject, serverError } from "@/lib/test/gate";

/**
 * GET /api/test/runs/{id}/unmatched — automation ids CI reported that map to no
 * case in this project.
 *
 * The point of persisting these is that mapping rot is invisible otherwise: a
 * renamed test silently stops reporting, and the run looks fine because the
 * remaining cases still pass. This is the report that makes it visible.
 */

type Params = { id: string };

export const GET = withOrgAuth<Params>(
  async ({ orgId, userId }, _req: NextRequest, { params }) => {
    try {
      const run = await db.qtTestRun.findFirst({
        where: { id: params.id, orgId, isDeleted: false },
        select: { projectId: true },
      });
      if (!run) {
        return NextResponse.json(
          { success: false, error: "Run not found" },
          { status: 404 },
        );
      }

      const denied = await gateProject(orgId, userId, run.projectId, "TestRun", "view");
      if (denied) return denied;

      const rows = await unmatchedForRun(orgId, params.id);
      return NextResponse.json({
        success: true,
        data: {
          items: rows,
          total: rows.reduce((sum, r) => sum + r.count, 0),
        },
      });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);
