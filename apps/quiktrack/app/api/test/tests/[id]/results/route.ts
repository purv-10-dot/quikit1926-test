import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { recordManualResult, TestRunError } from "@/lib/services/testRuns";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";
import { recordResultSchema } from "@/lib/validation/testRun";

/**
 * POST /api/test/tests/{id}/results — THE MANUAL WRITE PATH
 * GET  /api/test/tests/{id}/results — this test's full execution history
 *
 * Gated on `TestResult:create`, which is the "Execute Tests" permission. Results
 * are append-only: there is deliberately no PATCH or DELETE here, and the
 * database refuses those operations even if a future route tried.
 */

type Params = { id: string };

/** Resolves the test's project via its run. */
async function projectOf(orgId: string, testId: string): Promise<string | null> {
  const row = await db.qtTest.findFirst({
    where: { id: testId, orgId },
    select: { run: { select: { projectId: true } } },
  });
  return row?.run.projectId ?? null;
}

export const POST = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const projectId = await projectOf(orgId, params.id);
      if (!projectId) {
        return NextResponse.json(
          { success: false, error: "Test not found" },
          { status: 404 },
        );
      }

      const denied = await gateProject(
        orgId,
        userId,
        projectId,
        "TestResult",
        "create",
      );
      if (denied) return denied;

      const body: unknown = await req.json();
      const parsed = recordResultSchema.safeParse(body);
      if (!parsed.success) {
        // `issues[0].message` alone is a bare "Required" with no indication of
        // WHICH field — unusable when this fires intermittently in production
        // and the only evidence is the response body. Prefixing the field path
        // makes the message self-diagnosing (e.g. "statusId: Required").
        const issue = parsed.error.issues[0];
        const path = issue?.path.join(".");
        const message = issue && path ? `${path}: ${issue.message}` : issue?.message;

        // This has been reported live (QUIKTR-341) with every known call site
        // re-audited and none able to construct a body missing `statusId` —
        // so the next occurrence needs the ACTUAL wire body, not another guess.
        // Logs only the top-level KEYS present, never values (comment/notes may
        // carry user text — see apps/quiktrack/CLAUDE.md's AI logging rule,
        // applied here defensively even though this path has nothing to do
        // with AI).
        const keys =
          body && typeof body === "object" ? Object.keys(body as object) : typeof body;
        // eslint-disable-next-line no-console
        console.error("[quiktest] recordResultSchema rejected a submission", {
          testId: params.id,
          message,
          bodyKeys: keys,
        });

        return badRequest(message ?? "Invalid body");
      }

      const result = await recordManualResult(orgId, userId, params.id, parsed.data);
      return NextResponse.json({ success: true, data: result }, { status: 201 });
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

export const GET = withOrgAuth<Params>(
  async ({ orgId, userId }, _req: NextRequest, { params }) => {
    try {
      const projectId = await projectOf(orgId, params.id);
      if (!projectId) {
        return NextResponse.json(
          { success: false, error: "Test not found" },
          { status: 404 },
        );
      }

      const denied = await gateProject(
        orgId,
        userId,
        projectId,
        "TestResult",
        "view",
      );
      if (denied) return denied;

      // Chronological, with id as the tie-break so ordering is deterministic
      // when two results share a timestamp (parallel CI writes).
      const results = await db.qtTestResult.findMany({
        where: { testId: params.id, orgId },
        select: {
          id: true,
          source: true,
          executedBy: true,
          executedAt: true,
          elapsedMs: true,
          comment: true,
          failureMessage: true,
          stackTrace: true,
          build: true,
          ciUrl: true,
          createdAt: true,
          status: { select: { id: true, key: true, label: true, color: true } },
          attachments: {
            select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
          },
          defectLinks: { select: { id: true, issueId: true } },
          stepResults: {
            select: {
              id: true,
              stepId: true,
              comment: true,
              status: { select: { key: true, label: true } },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });

      // Resolve actor names for the history view (QUIKTR-340) in one query rather
      // than per result. `User` is global (no orgId column); these ids come from
      // rows already scoped to a project the caller was just gated on.
      const actorIds = [...new Set(results.map((r) => r.executedBy).filter(Boolean))];
      const actors = actorIds.length
        ? await db.user.findMany({
            where: { id: { in: actorIds as string[] } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
      const actorById = new Map(actors.map((u) => [u.id, u]));

      return NextResponse.json({
        success: true,
        data: results.map((r) => ({
          ...r,
          actor: r.executedBy ? actorById.get(r.executedBy) ?? null : null,
        })),
      });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);
