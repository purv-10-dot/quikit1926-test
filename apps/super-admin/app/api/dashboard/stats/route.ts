import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/api/requireSuperAdmin";
import { db } from "@/lib/db";

export async function GET() {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const [orgCount, userCount, activeMembershipCount, appCount] = await Promise.all([
    db.tenant.count(),
    db.user.count(),
    db.membership.count({
      where: { status: "active" },
    }),
    db.app.count(),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      orgCount,
      userCount,
      activeMembershipCount,
      appCount,
    },
  });
}
