import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { findOrCreateRunForBuild, TestRunError } from "@/lib/services/testRuns";
import {
  badRequest,
  gateProject,
  gateProjectResolved,
  serverError,
} from "@/lib/test/gate";
import { createTestRunSchema, listRunsSchema } from "@/lib/validation/testRun";

/**
 * GET  /api/test/runs?projectId=&state=&source= — list runs (+ status counts)
 * POST /api/test/runs                          — create (find-or-create by build)
 */

export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
    const url = new URL(req.url);
    const parsed = listRunsSchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? "Invalid query");
    }
    const q = parsed.data;

    if (!q.projectId) return badRequest("projectId is required");

    // q.projectId may be a cuid OR a projectKey (readable URLs). Filter rows on
    // the RESOLVED cuid — querying by key matches nothing and would render an
    // empty runs list, which reads as data loss.
    const { denied, projectId } = await gateProjectResolved(
      orgId,
      userId,
      q.projectId,
      "TestRun",
      "view",
    );
    if (denied) return denied;

    const where = {
      orgId,
      projectId,
      isDeleted: q.deleted === "true",
      ...(q.state ? { state: q.state } : {}),
      ...(q.source ? { source: q.source } : {}),
      ...(q.milestoneId ? { milestoneId: q.milestoneId } : {}),
      ...(q.planId ? { planId: q.planId } : {}),
    };

    const [total, runs] = await Promise.all([
      db.qtTestRun.count({ where }),
      db.qtTestRun.findMany({
        where,
        select: {
          id: true,
          refId: true,
          name: true,
          source: true,
          state: true,
          build: true,
          environment: true,
          createdAt: true,
          closedAt: true,
          milestoneId: true,
          // QUIKTR-338 — the spec's row shows "created by / date" and the planned
          // window alongside the progress bar.
          createdBy: true,
          startDate: true,
          endDate: true,
          // The run's OWNER (QUIKTR-317). Distinct from per-test assignment.
          assigneeId: true,
          // Prefill for the edit panel — without these it would blank the fields it
          // does not know about.
          description: true,
          refTickets: true,
          // QUIKTR-341 — the edit panel's "Include test cases" picker needs to
          // know whether the run already has a suite to browse.
          suiteId: true,
          // Lets the row render Restore instead of Delete in the deleted view.
          isDeleted: true,
          _count: { select: { tests: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    // Status breakdown for every listed run in ONE grouped query. Per-run
    // counting would be an N+1 across the whole list.
    const runIds = runs.map((r) => r.id);
    const grouped = runIds.length
      ? await db.qtTest.groupBy({
          by: ["runId", "currentStatusId"],
          where: { orgId, runId: { in: runIds } },
          _count: { _all: true },
        })
      : [];

    const statuses = await db.qtTestStatus.findMany({
      where: { orgId, isDeleted: false },
      select: { id: true, key: true },
    });
    const keyById = new Map(statuses.map((s) => [s.id, s.key]));

    const countsByRun = new Map<string, Record<string, number>>();
    for (const row of grouped) {
      const key = keyById.get(row.currentStatusId) ?? "unknown";
      const bucket = countsByRun.get(row.runId) ?? {};
      bucket[key] = (bucket[key] ?? 0) + row._count._all;
      countsByRun.set(row.runId, bucket);
    }

    // Creator names in ONE query for the whole page rather than per row. `User` is
    // a global model (no orgId column); these ids come from rows already scoped to
    // this org and project, so no membership is being disclosed.
    // Creators AND owners in one lookup — they overlap heavily, so two queries
    // would fetch mostly the same users twice.
    const userIds = [
      ...new Set(
        runs.flatMap((r) => [r.createdBy, r.assigneeId]).filter(Boolean),
      ),
    ];
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds as string[] } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const creatorById = new Map(users.map((u) => [u.id, u]));

    return NextResponse.json({
      success: true,
      data: {
        items: runs.map((r) => ({
          ...r,
          testCount: r._count.tests,
          counts: countsByRun.get(r.id) ?? {},
          createdByUser: r.createdBy ? creatorById.get(r.createdBy) ?? null : null,
          owner: r.assigneeId ? creatorById.get(r.assigneeId) ?? null : null,
        })),
        total,
        page: q.page,
        pageSize: q.pageSize,
      },
    });
  } catch (error: unknown) {
    return serverError(error);
  }
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
    const parsed = createTestRunSchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
    }

    // Body projectId may be a cuid OR a project KEY (readable URLs). Resolve to
    // the real id before gating AND before creating the run (the run stores this
    // projectId, so a key must never be persisted).
    const project = await db.qtProject.findFirst({
      where: {
        orgId,
        isDeleted: false,
        OR: [{ id: parsed.data.projectId }, { projectKey: parsed.data.projectId }],
      },
      select: { id: true },
    });
    if (!project) return badRequest("Project not found");
    const runInput = { ...parsed.data, projectId: project.id };

    const denied = await gateProject(orgId, userId, project.id, "TestRun", "create");
    if (denied) return denied;

    const run = await findOrCreateRunForBuild(orgId, userId, runInput);
    // A reused run is not a creation, so it answers 200 rather than 201 — CI can
    // tell whether it started the run or joined one.
    return NextResponse.json(
      { success: true, data: run },
      { status: run.reused ? 200 : 201 },
    );
  } catch (error: unknown) {
    if (error instanceof TestRunError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    return serverError(error);
  }
});
