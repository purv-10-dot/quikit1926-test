import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import {
  addCasesToRun,
  removeUntestedCasesFromRun,
  rerunTests,
  setRunState,
  TestRunError,
} from "@/lib/services/testRuns";
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
  /**
   * Edit the run's METADATA. Deliberately not the case list: removing a case that
   * already has results would discard execution history, and `QtTestResult` is
   * append-only precisely so that cannot happen.
   *
   * Nullable fields use `.nullish()` so the form can CLEAR them — `.optional()`
   * alone accepts `undefined` but rejects an explicit `null`, which is the bug that
   * broke "Add folder" earlier (createSectionSchema).
   */
  z.object({ action: z.literal("edit") }).extend({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(10_000).nullish(),
    assigneeId: z.string().min(1).nullish(),
    build: z.string().trim().max(255).nullish(),
    environment: z.string().trim().max(255).nullish(),
    startDate: z.string().date().nullish(),
    endDate: z.string().date().nullish(),
    refTickets: z.string().trim().max(2_000).nullish(),
  }),
  /**
   * ADD cases to an existing run (QUIKTR-341). Deliberately separate from
   * `edit` — a case that was never in the run has no results to lose, so
   * adding is unconditionally safe.
   */
  z.object({ action: z.literal("addCases") }).extend({
    caseIds: z.array(z.string().min(1)).min(1).max(500),
  }),
  /**
   * REMOVE untested cases from a run (QUIKTR-341's "Select cases" modal
   * supports unticking a not-yet-executed case). Still never removes a case
   * with a recorded result — `removeUntestedCasesFromRun` independently
   * re-verifies that server-side rather than trusting this list.
   */
  z.object({ action: z.literal("removeCases") }).extend({
    caseIds: z.array(z.string().min(1)).min(1).max(500),
  }),
]);

/**
 * Cross-field date check, applied only to the fields actually present.
 *
 * Cannot live in the schema: a PATCH may send `endDate` alone, in which case the
 * comparison needs the run's STORED `startDate`. The DB CHECK
 * (`QtTestRun_date_order_check`) is the real backstop; this exists so the form can
 * show a message instead of surfacing a raw constraint violation.
 */
function dateOrderError(
  next: { startDate?: string | null; endDate?: string | null },
  current: { startDate: Date | null; endDate: Date | null },
): string | null {
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const start = next.startDate === undefined ? iso(current.startDate) : next.startDate;
  const end = next.endDate === undefined ? iso(current.endDate) : next.endDate;
  if (start && end && end < start) {
    return "End date cannot be before the start date.";
  }
  return null;
}

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
          // Run owner (QUIKTR-317), shown in the run header. Distinct from
          // per-test assignment.
          assigneeId: true,
          startDate: true,
          endDate: true,
          refTickets: true,
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

      // Owner name so the header doesn't render a cuid.
      const owner = run.assigneeId
        ? await db.user.findUnique({
            where: { id: run.assigneeId },
            select: { id: true, firstName: true, lastName: true },
          })
        : null;

      return NextResponse.json({ success: true, data: { ...run, counts, owner } });
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
        // state + dates are needed by the `edit` branch: a closed run is read-only,
        // and a partial date PATCH must be compared against the stored value.
        select: {
          id: true,
          projectId: true,
          state: true,
          startDate: true,
          endDate: true,
        },
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

      if (body.action === "edit") {
        // A closed run is frozen. Results are append-only by DB trigger, and its
        // metadata is part of that record — silently letting someone retitle or
        // re-date a signed-off run would make the audit trail lie.
        if (run.state === "closed") {
          return badRequest(
            "This run is closed. Reopen it before editing.",
          );
        }

        const dateError = dateOrderError(body, run);
        if (dateError) return badRequest(dateError);

        // If the caller sends an assignee, it must be a member of THIS project —
        // otherwise a run could be owned by someone with no access to it.
        if (body.assigneeId) {
          const member = await db.qtProjectMember.findFirst({
            where: {
              projectId: run.projectId,
              userId: body.assigneeId,
              isDeleted: false,
            },
            select: { id: true },
          });
          if (!member) {
            return badRequest("That person is not a member of this project.");
          }
        }

        // Only keys the caller actually sent are written, so an absent field is
        // "leave alone" while an explicit null is "clear". Spreading the parsed body
        // wholesale would blank every omitted column.
        const data: Prisma.QtTestRunUpdateInput = {};
        if (body.name !== undefined) data.name = body.name;
        if (body.description !== undefined) data.description = body.description ?? null;
        if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId ?? null;
        if (body.build !== undefined) data.build = body.build ?? null;
        if (body.environment !== undefined) data.environment = body.environment ?? null;
        if (body.refTickets !== undefined) data.refTickets = body.refTickets ?? null;
        if (body.startDate !== undefined) {
          data.startDate = body.startDate ? new Date(body.startDate) : null;
        }
        if (body.endDate !== undefined) {
          data.endDate = body.endDate ? new Date(body.endDate) : null;
        }

        // No `updatedBy` on QtTestRun — only createdBy/closedBy exist. `updatedAt`
        // is maintained by Prisma (@updatedAt), so the edit is timestamped even
        // though the editor is not recorded. Attributing edits would need a schema
        // change and owner sign-off, so it is left out rather than invented.
        const updated = await db.qtTestRun.update({
          where: { id: params.id },
          data,
          select: {
            id: true,
            name: true,
            description: true,
            assigneeId: true,
            build: true,
            environment: true,
            startDate: true,
            endDate: true,
            refTickets: true,
          },
        });
        return NextResponse.json({ success: true, data: updated });
      }

      if (body.action === "close" || body.action === "reopen") {
        const updated = await setRunState(
          orgId,
          userId,
          params.id,
          body.action === "close" ? "closed" : "open",
        );
        return NextResponse.json({ success: true, data: updated });
      }

      if (body.action === "addCases") {
        const result = await addCasesToRun(orgId, params.id, body.caseIds);
        return NextResponse.json({ success: true, data: result });
      }

      if (body.action === "removeCases") {
        const result = await removeUntestedCasesFromRun(orgId, params.id, body.caseIds);
        return NextResponse.json({ success: true, data: result });
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
