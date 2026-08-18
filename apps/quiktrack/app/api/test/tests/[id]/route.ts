import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";

/**
 * GET   /api/test/tests/{id} — one test, with the steps AS PINNED.
 * PATCH /api/test/tests/{id} — reassign this run-case (QUIKTR-317).
 *
 * The GET is the runner's per-test read, and the reason it exists rather than
 * reusing `GET /api/test/cases/{id}`: a test must show the case as it was when
 * the run materialised it (`test.caseVersion`), NOT the live case. Serving live
 * steps would mean a tester follows a procedure that was edited mid-run — the
 * precise failure that version pinning exists to prevent.
 *
 * Falls back to the live steps only when the pinned snapshot is missing (a case
 * created before versioning, or a snapshot that failed to write), and says so
 * via `stepsSource` so the UI can be honest about it.
 */

type Params = { id: string };

interface SnapshotStep {
  orderNo: number;
  action: string;
  expected: string | null;
}

interface CaseSnapshot {
  title?: string;
  description?: string | null;
  preconditions?: string | null;
  steps?: SnapshotStep[];
}

export const GET = withOrgAuth<Params>(
  async ({ orgId, userId }, _req: NextRequest, { params }) => {
    try {
      const test = await db.qtTest.findFirst({
        where: { id: params.id, orgId },
        select: {
          id: true,
          refId: true,
          caseVersion: true,
          assigneeId: true,
          currentStatus: {
            select: { id: true, key: true, label: true, color: true },
          },
          config: { select: { id: true, name: true } },
          run: {
            select: {
              id: true,
              refId: true,
              name: true,
              state: true,
              build: true,
              environment: true,
              projectId: true,
            },
          },
          case: {
            select: {
              id: true,
              refId: true,
              title: true,
              description: true,
              preconditions: true,
              priority: true,
              type: true,
              automationId: true,
              currentVersion: true,
              steps: {
                orderBy: { orderNo: "asc" },
                select: { id: true, orderNo: true, action: true, expected: true },
              },
            },
          },
        },
      });

      if (!test) {
        return NextResponse.json(
          { success: false, error: "Test not found" },
          { status: 404 },
        );
      }

      const denied = await gateProject(
        orgId,
        userId,
        test.run.projectId,
        "TestRun",
        "view",
      );
      if (denied) return denied;

      const pinned = await db.qtTestCaseVersion.findFirst({
        where: { caseId: test.case.id, versionNo: test.caseVersion, orgId },
        select: { snapshot: true, editedAt: true },
      });

      const snapshot = (pinned?.snapshot ?? null) as CaseSnapshot | null;
      const snapshotSteps = snapshot?.steps;

      // Step ids come from the LIVE step rows, because per-step results FK to
      // them. Matching is positional: the snapshot preserves order, and a live
      // row may no longer exist if the case was edited. A pinned step with no
      // live counterpart gets a null id and the runner records it at case level.
      const steps =
        snapshotSteps && snapshotSteps.length > 0
          ? snapshotSteps.map((s, i) => ({
              id: test.case.steps[i]?.id ?? null,
              orderNo: s.orderNo ?? i + 1,
              action: s.action,
              expected: s.expected ?? null,
            }))
          : test.case.steps.map((s) => ({
              id: s.id,
              orderNo: s.orderNo,
              action: s.action,
              expected: s.expected,
            }));

      return NextResponse.json({
        success: true,
        data: {
          id: test.id,
          refId: test.refId,
          caseVersion: test.caseVersion,
          assigneeId: test.assigneeId,
          currentStatus: test.currentStatus,
          config: test.config,
          run: test.run,
          case: {
            id: test.case.id,
            refId: test.case.refId,
            // Prefer the pinned title/preconditions too — the whole record
            // should reflect the version being executed, not just the steps.
            title: snapshot?.title ?? test.case.title,
            description: snapshot?.description ?? test.case.description,
            preconditions: snapshot?.preconditions ?? test.case.preconditions,
            priority: test.case.priority,
            type: test.case.type,
            automationId: test.case.automationId,
            currentVersion: test.case.currentVersion,
          },
          steps,
          /** "pinned" = the executed version; "live" = snapshot unavailable. */
          stepsSource: snapshotSteps && snapshotSteps.length > 0 ? "pinned" : "live",
          /** True when the case has moved on since this run materialised it. */
          caseHasNewerVersion: test.case.currentVersion > test.caseVersion,
        },
      });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);

/**
 * Reassign a run-case (QUIKTR-317). `assigneeId: null` clears the assignee.
 *
 * Gated on `TestRun:update`, not `TestResult:create`: deciding WHO executes a
 * test is run administration, whereas recording an outcome is execution. A
 * tester who may record results is not automatically allowed to hand work to
 * someone else.
 *
 * Deliberately does NOT touch status — that only ever changes by appending a
 * result, so the append-only trail stays the single source of truth.
 */
const patchSchema = z.object({
  assigneeId: z.string().min(1).nullable(),
});

export const PATCH = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const test = await db.qtTest.findFirst({
        where: { id: params.id, orgId },
        select: { id: true, run: { select: { projectId: true, state: true } } },
      });
      if (!test) {
        return NextResponse.json(
          { success: false, error: "Test not found" },
          { status: 404 },
        );
      }

      const denied = await gateProject(
        orgId,
        userId,
        test.run.projectId,
        "TestRun",
        "update",
      );
      if (denied) return denied;

      // A closed run is a finished record; reassigning work inside it would
      // rewrite who was responsible after the fact.
      if (test.run.state === "closed") {
        return NextResponse.json(
          {
            success: false,
            error: "This run is closed. Reopen it to change assignments.",
          },
          { status: 409 },
        );
      }

      const parsed = patchSchema.safeParse(await req.json());
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
      }
      const { assigneeId } = parsed.data;

      // Verify the assignee is actually a member of this project — otherwise a
      // typo silently assigns work to a user who can never see it.
      if (assigneeId) {
        const member = await db.qtProjectMember.findFirst({
          where: { projectId: test.run.projectId, userId: assigneeId, isDeleted: false },
          select: { id: true },
        });
        if (!member) {
          return badRequest("That user is not a member of this project.");
        }
      }

      const updated = await db.qtTest.update({
        where: { id: params.id },
        data: { assigneeId },
        select: { id: true, refId: true, assigneeId: true },
      });

      return NextResponse.json({ success: true, data: updated });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);
