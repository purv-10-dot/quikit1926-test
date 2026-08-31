/**
 * POST /api/icp/[id]/restore — bring a trashed ICP profile back.
 *
 * Separate route (not a PATCH flag) to match /api/price-lists/[id]/restore.
 */

import { type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { restoreIcpProfile } from "@/lib/services/icp/icp-service";
import { ok, failFromError } from "@/lib/services/icp/responses";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    // Restoring is an edit of existing data, not a create.
    await assertModule(user, "icp", "edit");

    await restoreIcpProfile({ orgId: user.orgId, id, userId: user.userId });
    return ok({ id });
  } catch (error: unknown) {
    return failFromError(error, "api/icp/[id]/restore POST", "Failed to restore ICP profile");
  }
}
