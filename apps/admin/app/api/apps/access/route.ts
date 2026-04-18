import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";

export const GET = withAdminAuth(async ({ tenantId }) => {
  const blocked = await gateModuleApi("admin", "apps", tenantId);
  if (blocked) return blocked as NextResponse;

  // Parallel fetch: members, apps, and access records
  const [members, apps, accessRecords] = await Promise.all([
    db.membership.findMany({
      where: { tenantId, status: { in: ["active", "invited"] } },
      select: {
        status: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
        },
      },
      orderBy: { user: { firstName: "asc" } },
    }),
    db.app.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, status: true } }),
    db.userAppAccess.findMany({
      where: { tenantId },
      select: { userId: true, appId: true, role: true },
    }),
  ]);

  const accessSet = new Set(accessRecords.map((a) => `${a.userId}:${a.appId}`));
  const accessRoleMap = new Map(accessRecords.map((a) => [`${a.userId}:${a.appId}`, a.role]));

  const matrix = members.map((m) => ({
    userId: m.user.id,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    email: m.user.email,
    avatar: m.user.avatar,
    status: m.status,
    apps: apps.map((app) => ({
      appId: app.id,
      appName: app.name,
      hasAccess: accessSet.has(`${m.user.id}:${app.id}`),
      role: accessRoleMap.get(`${m.user.id}:${app.id}`) || null,
    })),
  }));

  return NextResponse.json({
    success: true,
    data: {
      apps,
      matrix,
    },
  });
});

export const POST = withAdminAuth(async ({ tenantId, userId: grantedBy }, request: NextRequest) => {
  const blocked = await gateModuleApi("admin", "apps", tenantId);
  if (blocked) return blocked as NextResponse;
  const { userId, appId, role = "member" } = await request.json();

  if (!userId || !appId) {
    return NextResponse.json(
      { success: false, error: "userId and appId are required" },
      { status: 400 }
    );
  }

  const validRoles = ["owner", "admin", "member", "viewer"];
  if (!validRoles.includes(role)) {
    return NextResponse.json(
      { success: false, error: `role must be one of: ${validRoles.join(", ")}` },
      { status: 400 }
    );
  }

  await db.userAppAccess.upsert({
    where: { userId_tenantId_appId: { userId, tenantId, appId } },
    create: { userId, tenantId, appId, role, grantedBy },
    update: { role },
  });

  return NextResponse.json({ success: true, message: "Access granted" });
});

export const DELETE = withAdminAuth(async ({ tenantId }, request: NextRequest) => {
  const blocked = await gateModuleApi("admin", "apps", tenantId);
  if (blocked) return blocked as NextResponse;
  const { userId, appId } = await request.json();

  if (!userId || !appId) {
    return NextResponse.json(
      { success: false, error: "userId and appId are required" },
      { status: 400 }
    );
  }

  await db.userAppAccess.deleteMany({
    where: { userId, tenantId, appId },
  });

  return NextResponse.json({ success: true, message: "Access revoked" });
});
