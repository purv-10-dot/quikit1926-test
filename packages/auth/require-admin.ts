import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { db } from "@quikit/database";
import { type NextAuthOptions } from "next-auth";

const ADMIN_ROLES = ["admin", "super_admin"];
const ROLE_HIERARCHY: Record<string, number> = {
  super_admin: 6, admin: 5, executive: 4, manager: 3, employee: 2, coach: 1,
};
const ADMIN_MIN_LEVEL = ROLE_HIERARCHY["admin"];

export function createRequireAdmin(authOptions: NextAuthOptions) {
  return async function requireAdmin() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
    }

    const tenantId = session.user.tenantId;
    if (!tenantId) {
      return { error: NextResponse.json({ success: false, error: "No organisation selected" }, { status: 400 }) };
    }

    const membership = await db.membership.findFirst({
      where: { userId: session.user.id, tenantId, status: "active" },
    });

    if (!membership) {
      return { error: NextResponse.json({ success: false, error: "No active membership" }, { status: 403 }) };
    }

    const roleLevel = ROLE_HIERARCHY[membership.role] ?? 0;
    if (roleLevel < ADMIN_MIN_LEVEL) {
      return { error: NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 }) };
    }

    return { session, userId: session.user.id, tenantId, membership };
  };
}
