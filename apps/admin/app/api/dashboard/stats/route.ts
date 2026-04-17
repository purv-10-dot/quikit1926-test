import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const { tenantId } = auth;
  const blocked = await gateModuleApi("admin", "overview", tenantId);
  if (blocked) return blocked;

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
}
