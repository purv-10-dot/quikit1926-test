import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { ingestResults, IngestError } from "@/lib/services/testIngest";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";

/**
 * POST /api/test/runs/{id}/results — THE AUTOMATED WRITE PATH (JSON).
 *
 * CI posts results keyed by `automationId`, so a framework needs no internal
 * ids. Authenticates via the normal Bearer API token that `withOrgAuth` already
 * accepts, and is gated on `TestResult:create` — the same "Execute Tests"
 * permission the manual runner needs, so a token cannot exceed a human's rights.
 *
 * An unknown automationId does NOT fail the batch: the known results are stored
 * and the unknown ids come back in `unmatched` (and are persisted for the run's
 * mapping report).
 */

type Params = { id: string };

const bodySchema = z.object({
  results: z
    .array(
      z.object({
        automationId: z.string().trim().min(1).max(500),
        status: z.enum(["Passed", "Failed", "Blocked", "Skipped"]),
        elapsedMs: z.number().int().min(0).max(86_400_000).nullish(),
        failureMessage: z.string().max(20_000).nullish(),
        stackTrace: z.string().max(100_000).nullish(),
        build: z.string().trim().max(255).nullish(),
        ciUrl: z.string().trim().max(2_000).nullish(),
      }),
    )
    .min(1)
    .max(5_000),
  /**
   * When false, a matched case that isn't in the run is reported rather than
   * added. Defaults true: an automated run's membership is defined by what CI
   * actually executed.
   */
  materialiseMissing: z.boolean().default(true),
});

export const POST = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const run = await db.qtTestRun.findFirst({
        where: { id: params.id, orgId, isDeleted: false },
        select: { projectId: true },
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
        "TestResult",
        "create",
      );
      if (denied) return denied;

      const parsed = bodySchema.safeParse(await req.json());
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
      }

      const summary = await ingestResults(
        orgId,
        userId,
        params.id,
        parsed.data.results,
        { allowMaterialise: parsed.data.materialiseMissing },
      );

      // 200, not 201: a batch is a report, and it may legitimately have inserted
      // nothing (every id unmatched). The summary says exactly what happened.
      return NextResponse.json({ success: true, data: summary });
    } catch (error: unknown) {
      if (error instanceof IngestError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      return serverError(error);
    }
  },
);
