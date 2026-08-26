import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import {
  deleteTestCases,
  restoreTestCases,
  TestDeleteError,
} from "@/lib/services/testDelete";
import { badRequest, gateProjectResolved, serverError } from "@/lib/test/gate";

/**
 * POST /api/test/cases/bulk-delete — soft-delete or restore many cases at once.
 *
 * One endpoint with an `action` rather than two routes: both operations take the
 * same body, the same gate and the same response shape, and splitting them would
 * duplicate all three.
 *
 * Gated on `TestCase:delete` for BOTH directions — restoring is the inverse of a
 * destructive act, so anyone who can undo it should have been able to do it.
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

    // Resolve BEFORE the service call — it asserts a real cuid, and a projectKey
    // reaching the scoping filter would match nothing and silently delete zero rows
    // while reporting success.
    const { denied, projectId } = await gateProjectResolved(
      orgId,
      userId,
      idOrKey,
      "TestCase",
      "delete",
    );
    if (denied) return denied;

    const result =
      action === "delete"
        ? await deleteTestCases(orgId, projectId, userId, ids)
        : await restoreTestCases(orgId, projectId, userId, ids);

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
