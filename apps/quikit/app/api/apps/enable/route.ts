import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/apps/enable
 *
 * Enables an app for the current org. Creates UserAppAccess records
 * for ALL active members of the tenant (so everyone can see the app
 * in their launcher). Admin-only.
 *
 * Body: { appId: string }
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return NextResponse.json({ success: false, error: "No org selected" }, { status: 403 });
  }

  // Check admin role
  const membership = await db.membership.findFirst({
    where: { userId: session.user.id, tenantId, status: "active" },
    select: { role: true },
  });
  if (!membership || !["admin", "super_admin", "owner"].includes(membership.role)) {
    return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
  }

  const { appId } = await request.json();
  if (!appId) {
    return NextResponse.json({ success: false, error: "appId is required" }, { status: 400 });
  }

  // Verify app exists
  const app = await db.app.findUnique({ where: { id: appId }, select: { id: true } });
  if (!app) {
    return NextResponse.json({ success: false, error: "App not found" }, { status: 404 });
  }

  // Get all active members of this tenant
  const members = await db.membership.findMany({
    where: { tenantId, status: "active" },
    select: { userId: true },
  });

  // Create UserAppAccess for each member (skip if already exists)
  let created = 0;
  for (const member of members) {
    const existing = await db.userAppAccess.findUnique({
      where: { userId_tenantId_appId: { userId: member.userId, tenantId, appId } },
    });
    if (!existing) {
      await db.userAppAccess.create({
        data: {
          userId: member.userId,
          tenantId,
          appId,
          role: "member",
          grantedBy: session.user.id,
        },
      });
      created++;
    }
  }

  return NextResponse.json({
    success: true,
    data: { appId, membersGranted: created },
  });
}
