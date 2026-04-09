import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/api/requireSuperAdmin";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const tenantId = params.id;

  const members = await db.membership.findMany({
    where: { tenantId, status: { in: ["active", "invited"] } },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      },
    },
    orderBy: { user: { firstName: "asc" } },
  });

  const apps = await db.app.findMany({ where: { status: "active" }, orderBy: { name: "asc" } });

  const accessRecords = await db.userAppAccess.findMany({
    where: { tenantId },
  });

  const accessSet = new Set(accessRecords.map((a) => `${a.userId}:${a.appId}`));

  const matrix = members.map((m) => ({
    userId: m.user.id,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    email: m.user.email,
    avatar: m.user.avatar,
    role: m.role,
    status: m.status,
    apps: apps.map((app) => ({
      appId: app.id,
      appName: app.name,
      appSlug: app.slug,
      hasAccess: accessSet.has(`${m.user.id}:${app.id}`),
    })),
  }));

  return NextResponse.json({
    success: true,
    data: {
      apps: apps.map((a) => ({ id: a.id, name: a.name, slug: a.slug })),
      matrix,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const tenantId = params.id;
  const { userId, appId, action } = await request.json();

  if (!userId || !appId || !action) {
    return NextResponse.json(
      { success: false, error: "userId, appId, and action are required" },
      { status: 400 }
    );
  }

  if (action === "grant") {
    await db.userAppAccess.upsert({
      where: { userId_tenantId_appId: { userId, tenantId, appId } },
      create: { userId, tenantId, appId, role: "member", grantedBy: auth.userId },
      update: {},
    });
    return NextResponse.json({ success: true, message: "Access granted" });
  }

  if (action === "revoke") {
    await db.userAppAccess.deleteMany({ where: { userId, tenantId, appId } });
    return NextResponse.json({ success: true, message: "Access revoked" });
  }

  return NextResponse.json(
    { success: false, error: "action must be 'grant' or 'revoke'" },
    { status: 400 }
  );
}
