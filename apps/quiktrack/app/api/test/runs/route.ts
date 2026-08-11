import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { findOrCreateRunForBuild, TestRunError } from "@/lib/services/testRuns";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";
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

    const denied = await gateProject(orgId, userId, q.projectId, "TestRun", "view");
    if (denied) return denied;

    const where = {
      orgId,
      projectId: q.projectId,
      isDeleted: false,
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

    return NextResponse.json({
      success: true,
      data: {
        items: runs.map((r) => ({
          ...r,
          testCount: r._count.tests,
          counts: countsByRun.get(r.id) ?? {},
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
