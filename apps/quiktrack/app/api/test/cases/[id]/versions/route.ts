import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { rollbackTestCase, TestCaseError } from "@/lib/services/testCases";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";

/**
 * GET  /api/test/cases/{id}/versions            — version list (newest first)
 * GET  /api/test/cases/{id}/versions?versionNo= — one snapshot
 * POST /api/test/cases/{id}/versions            — {versionNo} → roll back
 *
 * Rollback writes the old content FORWARD as a new version rather than rewinding
 * the pointer, so the version list stays append-only and the rollback itself is
 * part of the history.
 */

type Params = { id: string };

const rollbackSchema = z.object({
  versionNo: z.coerce.number().int().min(1),
});

async function projectOf(orgId: string, caseId: string): Promise<string | null> {
  const row = await db.qtTestCase.findFirst({
    where: { id: caseId, orgId, isDeleted: false },
    select: { projectId: true },
  });
  return row?.projectId ?? null;
}

export const GET = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const projectId = await projectOf(orgId, params.id);
      if (!projectId) {
        return NextResponse.json(
          { success: false, error: "Test case not found" },
          { status: 404 },
        );
      }
      const denied = await gateProject(orgId, userId, projectId, "TestCase", "view");
      if (denied) return denied;

      const versionNo = new URL(req.url).searchParams.get("versionNo");

      if (versionNo) {
        const n = Number.parseInt(versionNo, 10);
        if (!Number.isInteger(n) || n < 1) {
          return badRequest("versionNo must be a positive integer");
        }
        const one = await db.qtTestCaseVersion.findFirst({
          where: { caseId: params.id, versionNo: n, orgId },
        });
        if (!one) {
          return NextResponse.json(
            { success: false, error: "Version not found" },
            { status: 404 },
          );
        }
        return NextResponse.json({ success: true, data: one });
      }

      const rows = await db.qtTestCaseVersion.findMany({
        where: { caseId: params.id, orgId },
        select: { id: true, versionNo: true, editedBy: true, editedAt: true },
        orderBy: { versionNo: "desc" },
      });
      return NextResponse.json({ success: true, data: rows });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);

export const POST = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const projectId = await projectOf(orgId, params.id);
      if (!projectId) {
        return NextResponse.json(
          { success: false, error: "Test case not found" },
          { status: 404 },
        );
      }
      // Rolling back rewrites the case, so it needs update — not just view.
      const denied = await gateProject(orgId, userId, projectId, "TestCase", "update");
      if (denied) return denied;

      const parsed = rollbackSchema.safeParse(await req.json());
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
      }

      const result = await rollbackTestCase(
        orgId,
        projectId,
        userId,
        params.id,
        parsed.data.versionNo,
      );
      return NextResponse.json({ success: true, data: result }, { status: 201 });
    } catch (error: unknown) {
      if (error instanceof TestCaseError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      return serverError(error);
    }
  },
);
