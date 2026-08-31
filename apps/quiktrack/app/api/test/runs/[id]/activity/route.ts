import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { gateProject, serverError } from "@/lib/test/gate";

/**
 * GET /api/test/runs/{id}/activity — the run's result trail and its defects.
 *
 * Serves the Activity and Defects tabs (QUIKTR-339) from ONE query pass: both read
 * the same append-only `QtTestResult` rows, so splitting them into two endpoints
 * would double the work to render one screen.
 *
 * The trail is append-only by DB trigger, which is what makes this a genuine audit
 * log rather than a reconstruction: every row is a result that was actually
 * recorded, in order.
 */

type Params = { id: string };

/** Newest first, and bounded — a long-running CI run can hold thousands. */
const LIMIT = 200;

export const GET = withOrgAuth<Params>(
  async ({ orgId, userId }, _req: NextRequest, { params }) => {
    try {
      const run = await db.qtTestRun.findFirst({
        where: { id: params.id, orgId, isDeleted: false },
        select: { projectId: true },
      });
      if (!run) {
        return NextResponse.json(
          { success: false, error: "Test run not found" },
          { status: 404 },
        );
      }
      const denied = await gateProject(orgId, userId, run.projectId, "TestRun", "view");
      if (denied) return denied;

      // `runId` is on the result itself (indexed), so this does NOT need to join
      // through QtTest.
      const [total, results] = await Promise.all([
        db.qtTestResult.count({ where: { orgId, runId: params.id } }),
        db.qtTestResult.findMany({
          where: { orgId, runId: params.id },
          select: {
            id: true,
            statusId: true,
            comment: true,
            elapsedMs: true,
            source: true,
            executedAt: true,
            executedBy: true,
            failureMessage: true,
            build: true,
            test: {
              select: {
                id: true,
                case: { select: { id: true, refId: true, title: true } },
              },
            },
            defectLinks: { select: { issueId: true } },
          },
          orderBy: { executedAt: "desc" },
          take: LIMIT,
        }),
      ]);

      // Resolve status labels, actors and defect issues in one query each rather
      // than per row.
      const statuses = await db.qtTestStatus.findMany({
        where: { orgId, isDeleted: false },
        select: { id: true, key: true, label: true },
      });
      const statusById = new Map(statuses.map((s) => [s.id, s]));

      const actorIds = [...new Set(results.map((r) => r.executedBy).filter(Boolean))];
      const actors = actorIds.length
        ? await db.user.findMany({
            where: { id: { in: actorIds as string[] } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
      const actorById = new Map(actors.map((u) => [u.id, u]));

      const issueIds = [
        ...new Set(results.flatMap((r) => r.defectLinks.map((d) => d.issueId))),
      ];
      // No FK on issueId (deleting a Bug must never cascade into test history), so
      // a linked issue can legitimately be gone — those simply don't resolve.
      const issues = issueIds.length
        ? await db.qtIssue.findMany({
            where: { id: { in: issueIds }, orgId, isDeleted: false },
            select: { id: true, key: true, title: true, priority: true, statusId: true },
          })
        : [];
      const issueById = new Map(issues.map((i) => [i.id, i]));

      const events = results.map((r) => ({
        id: r.id,
        executedAt: r.executedAt,
        source: r.source,
        comment: r.comment,
        elapsedMs: r.elapsedMs,
        failureMessage: r.failureMessage,
        build: r.build,
        status: statusById.get(r.statusId) ?? null,
        actor: r.executedBy ? actorById.get(r.executedBy) ?? null : null,
        testId: r.test.id,
        case: r.test.case,
        defectIssueIds: r.defectLinks.map((d) => d.issueId),
      }));

      // One row per defect issue, carrying which cases hit it. A bug found by
      // three cases is one defect with three failing cases, not three defects.
      const defectMap = new Map<
        string,
        { issueId: string; cases: Array<{ id: string; refId: number; title: string }> }
      >();
      for (const e of events) {
        for (const issueId of e.defectIssueIds) {
          const entry = defectMap.get(issueId) ?? { issueId, cases: [] };
          if (!entry.cases.some((c) => c.id === e.case.id)) entry.cases.push(e.case);
          defectMap.set(issueId, entry);
        }
      }

      const defects = [...defectMap.values()].map((d) => ({
        ...d,
        issue: issueById.get(d.issueId) ?? null,
      }));

      return NextResponse.json({
        success: true,
        data: {
          events,
          defects,
          total,
          // Say when the trail is cut short rather than letting the UI imply it is
          // the whole history.
          truncated: total > events.length,
        },
      });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);
