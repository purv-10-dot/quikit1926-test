/**
 * PATCH  /api/icp/taxonomy/[id] — rename / recode / reparent / (de)activate
 * DELETE /api/icp/taxonomy/[id] — hard delete, refused while the entry is in use
 *
 * `kind` is not patchable (see updateIcpTaxonomySchema): link rows carry a
 * denormalised `kind`, so flipping it would desync them.
 */

import { type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { updateIcpTaxonomySchema } from "@/lib/validators/icp";
import { deleteIcpTaxonomy, updateIcpTaxonomy } from "@/lib/services/icp/icp-taxonomy-service";
import { ok, fail, failFromError, zodFieldErrors } from "@/lib/services/icp/responses";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "icp", "edit");

    const body = await req.json().catch(() => null);
    const parsed = updateIcpTaxonomySchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, "Validation failed", zodFieldErrors(parsed.error));
    }

    const updated = await updateIcpTaxonomy({ orgId: user.orgId, id, input: parsed.data });
    return ok(updated);
  } catch (error: unknown) {
    return failFromError(error, "api/icp/taxonomy/[id] PATCH", "Failed to update taxonomy entry");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "icp", "delete");

    await deleteIcpTaxonomy(user.orgId, id);
    return ok({ id });
  } catch (error: unknown) {
    return failFromError(error, "api/icp/taxonomy/[id] DELETE", "Failed to delete taxonomy entry");
  }
}
