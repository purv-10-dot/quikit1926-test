import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { db } from "@quikit/database";
import { type NextAuthOptions } from "next-auth";
import { ROLE_HIERARCHY } from "@quikit/shared";

const ADMIN_MIN_LEVEL = ROLE_HIERARCHY["admin"];

export function createRequireAdmin(authOptions: NextAuthOptions) {
  return async function requireAdmin() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      console.warn("[auth:requireAdmin] Denied: no session");
      return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
    }

    const tenantId = session.user.tenantId;
    if (!tenantId) {
      console.warn("[auth:requireAdmin] Denied: no tenantId for user", session.user.id);
      return { error: NextResponse.json({ success: false, error: "No organisation selected" }, { status: 400 }) };
    }

    const membership = await db.membership.findFirst({
      where: { userId: session.user.id, tenantId, status: "active" },
    });

    if (!membership) {
      console.warn("[auth:requireAdmin] Denied: no active membership", { userId: session.user.id, tenantId });
      return { error: NextResponse.json({ success: false, error: "No active membership" }, { status: 403 }) };
    }

    const roleLevel = ROLE_HIERARCHY[membership.role] ?? 0;
    if (roleLevel < ADMIN_MIN_LEVEL) {
      console.warn("[auth:requireAdmin] Denied: insufficient role", { userId: session.user.id, role: membership.role });
      return { error: NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 }) };
    }

    return { session, userId: session.user.id, tenantId, membership };
  };
}
