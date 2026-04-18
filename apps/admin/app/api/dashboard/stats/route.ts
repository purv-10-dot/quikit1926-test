import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";

export const GET = withAdminAuth(async ({ tenantId }) => {
  const blocked = await gateModuleApi("admin", "overview", tenantId);
  if (blocked) return blocked as NextResponse;

  const [memberCount, teamCount, pendingInvites, appCount] = await Promise.all([
    db.membership.count({
      where: { tenantId, status: "active" },
    }),
    db.team.count({
      where: { tenantId },
    }),
    db.membership.count({
      where: { tenantId, status: "invited" },
    }),
    db.userAppAccess.groupBy({
      by: ["appId"],
      where: { tenantId },
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
