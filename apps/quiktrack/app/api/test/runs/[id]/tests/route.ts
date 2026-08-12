import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";
import { listRunTestsSchema } from "@/lib/validation/testRun";

/**
 * GET /api/test/runs/{id}/tests — the runner's work list.
 *
 * Returns each test with its case title and CURRENT status, plus the pinned
 * `caseVersion`. The runner shows the steps from the pinned version, not the
 * live case, so a mid-run case edit cannot change what a tester is executing.
 */

type Params = { id: string };

export const GET = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const run = await db.qtTestRun.findFirst({
        where: { id: params.id, orgId, isDeleted: false },
        select: { id: true, projectId: true, name: true, refId: true, state: true },
      });
      if (!run) {
        return NextResponse.json(
          { success: false, error: "Run not found" },
          { status: 404 },
        );
      }

      const denied = await gateProject(orgId, userId, run.projectId, "TestRun", "view");
      if (denied) return denied;

      const parsed = listRunTestsSchema.safeParse(
        Object.fromEntries(new URL(req.url).searchParams),
      );
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? "Invalid query");
      }
      const q = parsed.data;

      const where = {
        orgId,
        runId: params.id,
        ...(q.status ? { currentStatus: { key: q.status } } : {}),
        ...(q.mine ? { assigneeId: userId } : {}),
      };

      const [total, tests] = await Promise.all([
        db.qtTest.count({ where }),
        db.qtTest.findMany({
          where,
          select: {
            id: true,
            refId: true,
            caseVersion: true,
            assigneeId: true,
            currentStatus: { select: { id: true, key: true, label: true, color: true } },
            case: {
              select: {
                id: true,
                refId: true,
                title: true,
                priority: true,
                type: true,
              },
            },
            config: { select: { id: true, name: true } },
          },
          orderBy: { refId: "asc" },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ]);

      return NextResponse.json({
        success: true,
        data: { run, items: tests, total, page: q.page, pageSize: q.pageSize },
      });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);
