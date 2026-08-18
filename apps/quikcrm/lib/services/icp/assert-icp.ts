/**
 * Shared org-scoping guard for a client-supplied `icpId`.
 *
 * A cuid arriving in a request body is untrusted: without this check a caller
 * could attach another tenant's ICP to their own lead/prospect by guessing an id.
 * Mirrors assertAccountAccess's role in the lead routes — validate the FK against
 * the caller's org before it reaches Prisma.
 *
 * Throws a 400-shaped error carrying `fieldErrors.icpId` so the lead form renders
 * it under the ICP control, matching the ICP module's own service errors.
 */

import { db } from "@/lib/db";

export class IcpNotFoundError extends Error {
  statusCode = 400;
  fieldErrors = { icpId: "Selected ICP not found" };
  constructor(message = "Selected ICP not found for this organization") {
    super(message);
    this.name = "IcpNotFoundError";
  }
}

/**
 * Resolve an ICP id within `orgId`.
 *
 * `requireActive` defaults to true: pickers only offer active profiles, so a
 * newly-supplied id must be active. Conversion passes `false` — a prospect saved
 * months ago may reference an ICP since deactivated, and silently dropping the
 * reference on convert would lose data the user deliberately recorded.
 */
export async function assertIcpInOrg(
  orgId: string,
  icpId: string,
  opts: { requireActive?: boolean } = {},
): Promise<void> {
  const requireActive = opts.requireActive ?? true;
  const found = await db.crmIcpProfile.findFirst({
    where: {
      id: icpId,
      orgId,
      deletedAt: null,
      ...(requireActive ? { isActive: true } : {}),
    },
    select: { id: true },
  });
  if (!found) throw new IcpNotFoundError();
}
