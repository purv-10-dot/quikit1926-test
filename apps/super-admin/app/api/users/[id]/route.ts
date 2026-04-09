import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/api/requireSuperAdmin";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const user = await db.user.findUnique({
    where: { id: params.id },
  });

  if (!user) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  const memberships = await db.membership.findMany({
    where: { userId: params.id },
    include: {
      tenant: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    success: true,
    data: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      avatar: user.avatar,
      isSuperAdmin: user.isSuperAdmin,
      lastSignInAt: user.lastSignInAt ? user.lastSignInAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      memberships: memberships.map((m) => ({
        id: m.id,
        orgId: m.tenant.id,
        orgName: m.tenant.name,
        orgSlug: m.tenant.slug,
        role: m.role,
        status: m.status,
      })),
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const user = await db.user.findUnique({ where: { id: params.id } });
  if (!user) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  const body = await request.json();
  const { isSuperAdmin } = body;

  if (typeof isSuperAdmin !== "boolean") {
    return NextResponse.json(
      { success: false, error: "isSuperAdmin must be a boolean" },
      { status: 400 }
    );
  }

  const updated = await db.user.update({
    where: { id: params.id },
    data: { isSuperAdmin },
  });

  return NextResponse.json({
    success: true,
    data: {
      id: updated.id,
      isSuperAdmin: updated.isSuperAdmin,
    },
  });
}
