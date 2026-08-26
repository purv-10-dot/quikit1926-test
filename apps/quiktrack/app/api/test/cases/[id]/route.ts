import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import {
  archiveTestCase,
  TestCaseError,
  updateTestCase,
} from "@/lib/services/testCases";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";
import { updateTestCaseSchema } from "@/lib/validation/testCase";

/**
 * GET    /api/test/cases/{id} — full case incl. ordered steps
 * PATCH  /api/test/cases/{id} — edit; ALWAYS creates a new version
 * DELETE /api/test/cases/{id} — soft-archive (never a hard delete)
 *
 * The case row carries `projectId`, so the gate is resolved from the record
 * itself rather than a caller-supplied value — a caller cannot claim a project
 * they don't hold.
 */

type Params = { id: string };

/** Loads the case's project id, or null when it doesn't exist in this org. */
async function projectOf(orgId: string, caseId: string): Promise<string | null> {
  const row = await db.qtTestCase.findFirst({
    where: { id: caseId, orgId, isDeleted: false },
    select: { projectId: true },
  });
  return row?.projectId ?? null;
}

export const GET = withOrgAuth<Params>(
  async ({ orgId, userId }, _req: NextRequest, { params }) => {
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

      const row = await db.qtTestCase.findFirst({
        where: { id: params.id, orgId, isDeleted: false },
        include: {
          steps: { orderBy: { orderNo: "asc" } },
          tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
          issueLinks: { select: { id: true, issueId: true, type: true } },
        },
      });
      if (!row) {
        return NextResponse.json(
          { success: false, error: "Test case not found" },
          { status: 404 },
        );
      }

      // The read-only detail panel (QUIKTR-336) shows Assigned To / Template as
      // names. Resolved here rather than client-side so the panel doesn't need
      // two more round-trips just to avoid printing a cuid. `User` is a global
      // model (no orgId column) — membership is already established by the
      // project gate above.
      const [owner, template] = await Promise.all([
        row.ownerId
          ? db.user.findUnique({
              where: { id: row.ownerId },
              select: { id: true, firstName: true, lastName: true, avatar: true },
            })
          : null,
        row.templateId
          ? db.qtTestTemplate.findFirst({
              where: { id: row.templateId, orgId },
              select: { id: true, name: true, kind: true },
            })
          : null,
      ]);

      return NextResponse.json({
        success: true,
        // Labels flattened to match the list endpoint's shape, so the table and
        // the panel consume one thing rather than two.
        data: {
          ...row,
          labels: row.tags.map((t) => t.tag),
          owner,
          template,
        },
      });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);

export const PATCH = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const projectId = await projectOf(orgId, params.id);
      if (!projectId) {
        return NextResponse.json(
          { success: false, error: "Test case not found" },
          { status: 404 },
        );
      }
      const denied = await gateProject(orgId, userId, projectId, "TestCase", "update");
      if (denied) return denied;

      const parsed = updateTestCaseSchema.safeParse(await req.json());
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
      }

      const updated = await updateTestCase(
        orgId,
        projectId,
        userId,
        params.id,
        parsed.data,
      );
      return NextResponse.json({ success: true, data: updated });
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

export const DELETE = withOrgAuth<Params>(
  async ({ orgId, userId }, _req: NextRequest, { params }) => {
    try {
      const projectId = await projectOf(orgId, params.id);
      if (!projectId) {
        return NextResponse.json(
          { success: false, error: "Test case not found" },
          { status: 404 },
        );
      }
      const denied = await gateProject(orgId, userId, projectId, "TestCase", "delete");
      if (denied) return denied;

      await archiveTestCase(orgId, projectId, userId, params.id);
      return NextResponse.json({ success: true, data: { id: params.id } });
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
