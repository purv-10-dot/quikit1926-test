import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { userCanInProject } from "@/lib/api/permissions";

export const DELETE = withProjectAccess<{ id: string; patId: string }>(
  async ({ orgId, userId, projectId, isTenantAdmin }, _req, { params }) => {
    const pat = await db.qtPersonalAccessToken.findFirst({
      where: { id: params.patId, projectId, orgId },
      select: { id: true, createdById: true },
    });
    if (!pat) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const isOwnToken = pat.createdById === userId;
    if (
      !isTenantAdmin &&
      !isOwnToken &&
      !(await userCanInProject(userId, orgId, projectId, "Project", "update"))
    ) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }

    const revoked = await db.qtPersonalAccessToken.update({
      where: { id: params.patId },
      data: { revokedAt: new Date() },
      select: { id: true, revokedAt: true },
    });
    return NextResponse.json({ success: true, data: revoked });
  },
  { paramKey: "id" },
);
