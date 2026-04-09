import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { db } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const { tenantId } = auth;
  const membershipId = params.id;

  const membership = await db.membership.findFirst({
    where: { id: membershipId, tenantId },
  });

  if (!membership) {
    return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
  }

  const { customPermissions } = await request.json();

  if (!Array.isArray(customPermissions)) {
    return NextResponse.json(
      { success: false, error: "customPermissions must be an array" },
      { status: 400 }
    );
  }

  const updated = await db.membership.update({
    where: { id: membershipId },
    data: { customPermissions },
  });

  return NextResponse.json({ success: true, data: updated });
}
