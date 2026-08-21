/**
 * GET    /api/upwork/[id]  — one captured Upwork job
 * PATCH  /api/upwork/[id]  — edit the CRM-side copy
 * DELETE /api/upwork/[id]  — soft delete
 * POST   /api/upwork/[id]  — restore a soft-deleted row
 *
 * Same shape as /api/products/[id]: `{ params }` is a Promise (house
 * convention), id + orgId are always in the `where` rather than post-checked,
 * and a miss is a 404 rather than a 403 — under owner-scoped visibility, "not
 * yours" and "does not exist" must be indistinguishable, or the API leaks which
 * job ids exist in the org.
 */

import { type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { updateUpworkJobSchema } from "@/lib/validators/upwork";
import {
  deleteUpworkJob,
  getUpworkJob,
  restoreUpworkJob,
  updateUpworkJob,
} from "@/lib/services/upwork/upwork-service";
import {
  resolveUpworkUser,
  upworkOwnerScope,
} from "@/lib/services/upwork/resolve-upwork-user";
import { ok, fail, failFromError, zodFieldErrors } from "@/lib/services/icp/responses";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await resolveUpworkUser(req);
    if (isResponse(user)) return user;
    await assertModule(user, "upwork", "view");

    const job = await getUpworkJob(user.orgId, id, upworkOwnerScope(user));
    if (!job) return fail(404, "Upwork job not found");
    return ok(job);
  } catch (error: unknown) {
    return failFromError(error, "api/upwork/:id GET", "Failed to load Upwork job");
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await resolveUpworkUser(req);
    if (isResponse(user)) return user;
    await assertModule(user, "upwork", "edit");

    // Existence + ownership first, so a non-owner gets 404 rather than a silent
    // no-op that looks like success.
    const existing = await getUpworkJob(user.orgId, id, upworkOwnerScope(user));
    if (!existing) return fail(404, "Upwork job not found");

    const body = await req.json().catch(() => null);
    const parsed = updateUpworkJobSchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, "Validation failed", zodFieldErrors(parsed.error));
    }

    const job = await updateUpworkJob({
      orgId: user.orgId,
      id,
      userId: user.userId,
      input: parsed.data,
    });
    if (!job) return fail(404, "Upwork job not found");
    return ok(job);
  } catch (error: unknown) {
    return failFromError(error, "api/upwork/:id PATCH", "Failed to update Upwork job");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await resolveUpworkUser(req);
    if (isResponse(user)) return user;
    await assertModule(user, "upwork", "delete");

    const existing = await getUpworkJob(user.orgId, id, upworkOwnerScope(user));
    if (!existing) return fail(404, "Upwork job not found");

    const deleted = await deleteUpworkJob({ orgId: user.orgId, id, userId: user.userId });
    if (!deleted) return fail(404, "Upwork job not found");
    return ok({ id, deleted: true });
  } catch (error: unknown) {
    return failFromError(error, "api/upwork/:id DELETE", "Failed to delete Upwork job");
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await resolveUpworkUser(req);
    if (isResponse(user)) return user;
    // Restoring is an edit of an existing row, not a new capture.
    await assertModule(user, "upwork", "edit");

    const existing = await getUpworkJob(user.orgId, id, upworkOwnerScope(user));
    if (!existing) return fail(404, "Upwork job not found");

    const restored = await restoreUpworkJob({ orgId: user.orgId, id, userId: user.userId });
    if (!restored) return fail(404, "Upwork job not found or not deleted");
    return ok({ id, restored: true });
  } catch (error: unknown) {
    return failFromError(error, "api/upwork/:id POST", "Failed to restore Upwork job");
  }
}
