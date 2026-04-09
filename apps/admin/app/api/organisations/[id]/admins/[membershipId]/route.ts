import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/api/requireSuperAdmin";
import { db } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; membershipId: string } }
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const membership = await db.membership.findFirst({
    where: { id: params.membershipId, tenantId: params.id },
  });

  if (!membership) {
    return NextResponse.json({ success: false, error: "Admin not found" }, { status: 404 });
  }

  const { status } = await request.json();

  if (!["active", "inactive"].includes(status)) {
    return NextResponse.json(
      { success: false, error: "Status must be 'active' or 'inactive'" },
      { status: 400 }
    );
  }

  const updated = await db.membership.update({
    where: { id: params.membershipId },
    data: { status },
  });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; membershipId: string } }
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const membership = await db.membership.findFirst({
    where: { id: params.membershipId, tenantId: params.id },
  });

  if (!membership) {
    return NextResponse.json({ success: false, error: "Admin not found" }, { status: 404 });
  }

  // Remove team assignments and app access, then delete membership
  await db.userTeam.deleteMany({ where: { tenantId: params.id, userId: membership.userId } });
  await db.userAppAccess.deleteMany({ where: { tenantId: params.id, userId: membership.userId } });
  await db.membership.delete({ where: { id: params.membershipId } });

  return NextResponse.json({ success: true, message: "Admin removed from organisation" });
}
