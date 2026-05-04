import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";

export const GET = withAdminAuth(async ({ orgId }) => {
  const blocked = await gateModuleApi("admin", "overview", orgId);
  if (blocked) return blocked as NextResponse;

  const [memberCount, teamCount, pendingInvites, appCount] = await Promise.all([
    db.orgMember.count({
      where: { orgId, status: "active" },
    }),
    db.team.count({
      where: { orgId },
    }),
    db.orgMember.count({
      where: { orgId, status: "invited" },
    }),
    db.userAppAccess.groupBy({
      by: ["appId"],
      where: { orgId },
    }).then((groups) => groups.length),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      memberCount,
      teamCount,
      pendingInvites,
      appCount,
    },
  });
});
