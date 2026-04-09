import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/api/requireSuperAdmin";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const tenant = await db.tenant.findUnique({
    where: { id: params.id },
  });

  if (!tenant) {
    return NextResponse.json({ success: false, error: "Organisation not found" }, { status: 404 });
  }

  const [memberCount, teamCount, appCount, admins] = await Promise.all([
    db.membership.count({ where: { tenantId: params.id, status: "active" } }),
    db.team.count({ where: { tenantId: params.id } }),
    db.userAppAccess.groupBy({
      by: ["appId"],
      where: { tenantId: params.id },
    }).then((r) => r.length),
    db.membership.findMany({
      where: {
        tenantId: params.id,
        role: { in: ["admin", "super_admin"] },
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
        },
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      description: tenant.description,
      status: tenant.status,
      plan: tenant.plan,
      brandColor: tenant.brandColor,
      logoUrl: tenant.logoUrl,
      billingEmail: tenant.billingEmail,
      createdAt: tenant.createdAt.toISOString(),
      memberCount,
      teamCount,
      appCount,
      admins: admins.map((a) => ({
        membershipId: a.id,
        userId: a.user.id,
        firstName: a.user.firstName,
        lastName: a.user.lastName,
        email: a.user.email,
        avatar: a.user.avatar,
        role: a.role,
        status: a.status,
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

  const tenant = await db.tenant.findUnique({ where: { id: params.id } });
  if (!tenant) {
    return NextResponse.json({ success: false, error: "Organisation not found" }, { status: 404 });
  }

  const body = await request.json();
  const { name, description, status, plan, brandColor, billingEmail } = body;

  const updateData: Record<string, any> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (status !== undefined) updateData.status = status;
  if (plan !== undefined) updateData.plan = plan;
  if (brandColor !== undefined) updateData.brandColor = brandColor;
  if (billingEmail !== undefined) updateData.billingEmail = billingEmail;

  const updated = await db.tenant.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const tenant = await db.tenant.findUnique({ where: { id: params.id } });
  if (!tenant) {
    return NextResponse.json({ success: false, error: "Organisation not found" }, { status: 404 });
  }

  // Delete all related data in order (respecting foreign keys)
  await db.userAppAccess.deleteMany({ where: { tenantId: params.id } });
  await db.userTeam.deleteMany({ where: { tenantId: params.id } });
  await db.membership.deleteMany({ where: { tenantId: params.id } });
  await db.team.deleteMany({ where: { tenantId: params.id } });
  await db.tenant.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true, message: "Organisation deleted" });
}
