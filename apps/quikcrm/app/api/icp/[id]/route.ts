/**
 * GET    /api/icp/[id] — ICP profile detail (with linked taxonomy/products/accounts)
 * PATCH  /api/icp/[id] — update scalars and/or replace link sets
 * DELETE /api/icp/[id] — soft delete (moves to trash); ?permanent=true hard-deletes
 */

import { type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { updateIcpProfileSchema } from "@/lib/validators/icp";
import {
  getIcpProfile,
  permanentDeleteIcpProfile,
  softDeleteIcpProfile,
  updateIcpProfile,
} from "@/lib/services/icp/icp-service";
import { ok, fail, failFromError, zodFieldErrors } from "@/lib/services/icp/responses";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "icp", "view");

    const profile = await getIcpProfile(user.orgId, id);
    if (!profile) return fail(404, "ICP profile not found");
    return ok(profile);
  } catch (error: unknown) {
    return failFromError(error, "api/icp/[id] GET", "Failed to load ICP profile");
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "icp", "edit");

    const body = await req.json().catch(() => null);
    const parsed = updateIcpProfileSchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, "Validation failed", zodFieldErrors(parsed.error));
    }

    try {
      const updated = await updateIcpProfile({
        orgId: user.orgId,
        id,
        userId: user.userId,
        input: parsed.data,
      });
      return ok(updated);
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "P2002") {
        return fail(409, "An ICP profile with this name already exists.", {
          name: "Duplicate name",
        });
      }
      throw e;
    }
  } catch (error: unknown) {
    return failFromError(error, "api/icp/[id] PATCH", "Failed to update ICP profile");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "icp", "delete");

    const permanent = new URL(req.url).searchParams.get("permanent") === "true";
    if (permanent) {
      await permanentDeleteIcpProfile(user.orgId, id);
    } else {
      await softDeleteIcpProfile({ orgId: user.orgId, id, userId: user.userId });
    }
    return ok({ id, permanent });
  } catch (error: unknown) {
    return failFromError(error, "api/icp/[id] DELETE", "Failed to delete ICP profile");
  }
}
