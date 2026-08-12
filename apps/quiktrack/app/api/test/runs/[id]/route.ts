import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { rerunTests, setRunState, TestRunError } from "@/lib/services/testRuns";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";

/**
 * GET   /api/test/runs/{id}          — run detail + status breakdown
 * PATCH /api/test/runs/{id}          — {action: close|reopen|rerun}
 *
 * Close/reopen/rerun are expressed as an action on PATCH rather than separate
 * `:close` style paths, matching how Next's file router works here without
 * inventing pseudo-verbs in the URL.
 */

type Params = { id: string };

// `.extend()` rather than `.and()`: a discriminated union needs ZodObject
// members, and an intersection isn't one.
const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("reopen") }),
  z.object({ action: z.literal("rerun") }).extend({
    only: z.enum(["failed", "incomplete", "retest"]).optional(),
    name: z.string().trim().min(1).max(255).optional(),
  }),
]);

export const GET = withOrgAuth<Params>(
  async ({ orgId, userId }, _req: NextRequest, { params }) => {
    try {
      const run = await db.qtTestRun.findFirst({
        where: { id: params.id, orgId, isDeleted: false },
        select: {
          id: true,
          refId: true,
          name: true,
          description: true,
          source: true,
          state: true,
          build: true,
          environment: true,
          createdAt: true,
          createdBy: true,
          closedAt: true,
          projectId: true,
          suiteId: true,
          planId: true,
          milestoneId: true,
        },
      });
      if (!run) {
        return NextResponse.json(
          { success: false, error: "Run not found" },
          { status: 404 },
        );
      }

      const denied = await gateProject(orgId, userId, run.projectId, "TestRun", "view");
      if (denied) return denied;

      // Status breakdown, keyed by status key so the UI can feed it straight
      // into the shared count/donut maths in lib/test/statuses.ts.
      const grouped = await db.qtTest.groupBy({
        by: ["currentStatusId"],
        where: { orgId, runId: params.id },
        _count: { _all: true },
      });
      const statuses = await db.qtTestStatus.findMany({
        where: { orgId, isDeleted: false },
        select: { id: true, key: true },
      });
      const keyById = new Map(statuses.map((s) => [s.id, s.key]));

      const counts: Record<string, number> = {};
      for (const row of grouped) {
        const key = keyById.get(row.currentStatusId) ?? "unknown";
        counts[key] = (counts[key] ?? 0) + row._count._all;
      }

      return NextResponse.json({ success: true, data: { ...run, counts } });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);

export const PATCH = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const run = await db.qtTestRun.findFirst({
        where: { id: params.id, orgId, isDeleted: false },
        select: { id: true, projectId: true },
      });
      if (!run) {
        return NextResponse.json(
          { success: false, error: "Run not found" },
          { status: 404 },
        );
      }

      const denied = await gateProject(
        orgId,
        userId,
        run.projectId,
        "TestRun",
        "update",
      );
      if (denied) return denied;

      const parsed = patchSchema.safeParse(await req.json());
      if (!parsed.success) {
        return badRequest(
          parsed.error.issues[0]?.message ?? "action must be close, reopen or rerun",
        );
      }
      const body = parsed.data;

      if (body.action === "close" || body.action === "reopen") {
        const updated = await setRunState(
          orgId,
          userId,
          params.id,
          body.action === "close" ? "closed" : "open",
        );
        return NextResponse.json({ success: true, data: updated });
      }

      const created = await rerunTests(
        orgId,
        userId,
        params.id,
        body.only ?? "failed",
        body.name,
      );
      return NextResponse.json({ success: true, data: created }, { status: 201 });
    } catch (error: unknown) {
      if (error instanceof TestRunError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      return serverError(error);
    }
  },
);
