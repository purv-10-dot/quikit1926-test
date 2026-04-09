import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const ADMIN_APP_SLUG = "admin-portal";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ valid: false, reason: "unauthenticated" });
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return NextResponse.json({ valid: true, hasTenant: false });
  }

  // Check 1: Is the membership still active?
  const membership = await db.membership.findFirst({
    where: {
      userId: session.user.id,
      tenantId,
      status: "active",
    },
  });

  if (!membership) {
    return NextResponse.json({ valid: false, reason: "deactivated" });
  }

  // Check 2: Does the user still have Admin Portal app access?
  const app = await db.app.findUnique({
    where: { slug: ADMIN_APP_SLUG },
  });

  if (app) {
    const appAccess = await db.userAppAccess.findUnique({
      where: {
        userId_tenantId_appId: {
          userId: session.user.id,
          tenantId,
          appId: app.id,
        },
      },
    });

    if (!appAccess) {
      return NextResponse.json({ valid: false, reason: "app_access_revoked" });
    }
  }

  return NextResponse.json({ valid: true, hasTenant: true });
}
