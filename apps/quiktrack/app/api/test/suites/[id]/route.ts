import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { gateProject, serverError } from "@/lib/test/gate";

/**
 * DELETE /api/test/suites/{id} — soft-archive a suite and every section in it.
 *
 * Soft delete only, never a hard delete: a suite's cases may be referenced by
 * tests in historical runs, whose result trail is permanent (QtTestResult is
 * append-only). A hard delete's FK cascade would take those cases — and their
 * history — with it. Sections are archived too so nothing is left orphaned
 * (visible nowhere, but still counted) the way `sections/[id]` already treats
 * a section's own subtree.
 */

type Params = { id: string };

export const DELETE = withOrgAuth<Params>(
  async ({ orgId, userId }, _req: NextRequest, { params }) => {
    try {
      const suite = await db.qtTestSuite.findFirst({
        where: { id: params.id, orgId, isDeleted: false },
        select: { projectId: true },
      });
      if (!suite) {
        return NextResponse.json(
          { success: false, error: "Suite not found" },
          { status: 404 },
        );
      }

      const denied = await gateProject(
        orgId,
        userId,
        suite.projectId,
        "TestSuite",
        "delete",
      );
      if (denied) return denied;

      await db.$transaction([
        db.qtTestSection.updateMany({
          where: { orgId, suiteId: params.id, isDeleted: false },
          data: { isDeleted: true },
        }),
        db.qtTestSuite.update({
          where: { id: params.id },
          data: { isDeleted: true },
        }),
      ]);

      return NextResponse.json({ success: true, data: { id: params.id } });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);
