import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import {
  deleteTestRuns,
  restoreTestRuns,
  TestDeleteError,
} from "@/lib/services/testDelete";
import { badRequest, gateProjectResolved, serverError } from "@/lib/test/gate";

/**
 * POST /api/test/runs/bulk-delete — soft-delete or restore many runs at once.
 *
 * PERMISSION NOTE (deliberate, owner-approved): gated on `TestRun:update`, not
 * `TestRun:delete`. `TestRun` has NO `delete` action in `PERMISSION_TREE` — it was
 * omitted on purpose ("a run is an immutable historical record once it has
 * results"), and adding one is a permission-contract change requiring the
 * integration owner's sign-off. The owner chose to reuse `update` (which already
 * gates close/reopen) so this ships without that gate.
 *
 * The trade-off, stated plainly: anyone who can CLOSE a run can now also delete it.
 * That is looser than ideal for a destructive action. The mitigation is that the
 * delete is a soft delete and fully reversible, and results are never touched.
 * If `TestRun:delete` is added to the tree later, this should switch to it.
 */

const bodySchema = z.object({
  projectId: z.string().min(1),
  action: z.enum(["delete", "restore"]),
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
    }
    const { projectId: idOrKey, action, ids } = parsed.data;

    const { denied, projectId } = await gateProjectResolved(
      orgId,
      userId,
      idOrKey,
      "TestRun",
      "update",
    );
    if (denied) return denied;

    const result =
      action === "delete"
        ? await deleteTestRuns(orgId, projectId, ids)
        : await restoreTestRuns(orgId, projectId, ids);

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    if (error instanceof TestDeleteError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    return serverError(error);
  }
});
