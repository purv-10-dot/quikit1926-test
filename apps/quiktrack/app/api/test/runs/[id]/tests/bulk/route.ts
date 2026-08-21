import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import {
  bulkAddLabel,
  bulkAssign,
  bulkRemoveFromRun,
  bulkSetStatus,
  RunTestBulkError,
} from "@/lib/services/runTestBulk";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";

/**
 * POST /api/test/runs/{id}/tests/bulk — the runner grid's selection toolbar
 * (QUIKTR-341): Assign To, Add Results (status), Add Label, Remove from run.
 *
 * One endpoint with a discriminated `action`, rather than four routes, because
 * every action shares the same shape (a run, a set of test ids, one payload
 * value) and the same permission gate.
 *
 * Gated on `TestRun:update` for assign/status/remove (they change the run's
 * state) and on `TestCase:update` ALSO for the label action, since labels are a
 * case property — mirrors the split already used elsewhere (assignment vs.
 * result recording vs. case edits are different grants in PERMISSION_TREE).
 */

type Params = { id: string };

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    ids: z.array(z.string().min(1)).min(1).max(500),
    assigneeId: z.string().min(1).nullable(),
  }),
  z.object({
    action: z.literal("status"),
    ids: z.array(z.string().min(1)).min(1).max(500),
    statusId: z.string().min(1),
  }),
  z.object({
    action: z.literal("label"),
    ids: z.array(z.string().min(1)).min(1).max(500),
    tagId: z.string().min(1),
  }),
  z.object({
    action: z.literal("remove"),
    ids: z.array(z.string().min(1)).min(1).max(500),
  }),
]);

export const POST = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const run = await db.qtTestRun.findFirst({
        where: { id: params.id, orgId, isDeleted: false },
        select: { id: true, projectId: true, state: true },
      });
      if (!run) {
        return NextResponse.json(
          { success: false, error: "Run not found" },
          { status: 404 },
        );
      }

      // A closed run is a finished record — every one of these actions would
      // rewrite it after the fact, same reasoning as the single-test PATCH.
      if (run.state === "closed") {
        return NextResponse.json(
          { success: false, error: "This run is closed. Reopen it to make changes." },
          { status: 409 },
        );
      }

      const parsed = bodySchema.safeParse(await req.json());
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
      }
      const body = parsed.data;

      const resource = body.action === "label" ? "TestCase" : "TestRun";
      const denied = await gateProject(orgId, userId, run.projectId, resource, "update");
      if (denied) return denied;

      const result = await (async () => {
        switch (body.action) {
          case "assign":
            return bulkAssign(orgId, run.id, body.ids, body.assigneeId);
          case "status":
            return bulkSetStatus(orgId, run.id, userId, body.ids, body.statusId);
          case "label":
            return bulkAddLabel(orgId, run.id, userId, body.ids, body.tagId);
          case "remove":
            return bulkRemoveFromRun(orgId, run.id, body.ids);
        }
      })();

      return NextResponse.json({ success: true, data: result });
    } catch (error: unknown) {
      if (error instanceof RunTestBulkError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      return serverError(error);
    }
  },
);
