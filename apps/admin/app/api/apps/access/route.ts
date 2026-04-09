import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { db } from "@/lib/db";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const { tenantId } = auth;

  // Get all members (active + invited) — so admins can pre-configure app access
  const members = await db.membership.findMany({
    where: { tenantId, status: { in: ["active", "invited"] } },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      },
    },
    orderBy: { user: { firstName: "asc" } },
  });

  // Get all apps
  const apps = await db.app.findMany({ orderBy: { name: "asc" } });

  // Get all access records for this tenant
  const accessRecords = await db.userAppAccess.findMany({
    where: { tenantId },
  });

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
      apps: apps.map((a) => ({ id: a.id, name: a.name, slug: a.slug, status: a.status })),
      matrix,
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const { tenantId, userId: grantedBy } = auth;
  const { userId, appId, role = "member" } = await request.json();

  if (!userId || !appId) {
    return NextResponse.json(
      { success: false, error: "userId and appId are required" },
      { status: 400 }
    );
  }

  await db.userAppAccess.upsert({
    where: { userId_tenantId_appId: { userId, tenantId, appId } },
    create: { userId, tenantId, appId, role, grantedBy },
    update: { role },
  });

  return NextResponse.json({ success: true, message: "Access granted" });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const { tenantId } = auth;
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
}
