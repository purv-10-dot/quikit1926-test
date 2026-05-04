import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";

export const GET = withAdminAuth(async ({ orgId }) => {
  const blocked = await gateModuleApi("admin", "apps", orgId);
  if (blocked) return blocked as NextResponse;

  // Parallel fetch: members, apps, and access records
  const [members, apps, accessRecords] = await Promise.all([
    db.membership.findMany({
      where: { orgId, status: { in: ["active", "invited"] } },
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
      where: { orgId },
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

export const POST = withAdminAuth(async ({ orgId, userId: grantedBy }, request: NextRequest) => {
  const blocked = await gateModuleApi("admin", "apps", orgId);
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
    where: { userId_orgId_appId: { userId, orgId, appId } },
    create: { userId, orgId, appId, role, grantedBy },
    update: { role },
  });

  return NextResponse.json({ success: true, message: "Access granted" });
});

export const DELETE = withAdminAuth(async ({ orgId }, request: NextRequest) => {
  const blocked = await gateModuleApi("admin", "apps", orgId);
  if (blocked) return blocked as NextResponse;
  const { userId, appId } = await request.json();

  if (!userId || !appId) {
    return NextResponse.json(
      { success: false, error: "userId and appId are required" },
      { status: 400 }
    );
  }

  await db.userAppAccess.deleteMany({
    where: { userId, orgId, appId },
  });

  return NextResponse.json({ success: true, message: "Access revoked" });
});
