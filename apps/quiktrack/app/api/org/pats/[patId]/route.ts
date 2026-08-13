import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

// DELETE /api/org/pats/[patId] — revoke one of your own tokens (project-scoped
// legacy or user-scoped). Self-service, same as GET/POST on the parent route:
// scoped to `createdById: userId`, not an admin action.
export const DELETE = withOrgAuth<{ patId: string }>(async ({ orgId, userId }, _req, { params }) => {
  const pat = await db.qtPersonalAccessToken.findFirst({
    where: { id: params.patId, orgId, createdById: userId },
    select: { id: true },
  });
  if (!pat) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const revoked = await db.qtPersonalAccessToken.update({
    where: { id: params.patId },
    data: { revokedAt: new Date() },
    select: { id: true, revokedAt: true },
  });
  return NextResponse.json({ success: true, data: revoked });
});
