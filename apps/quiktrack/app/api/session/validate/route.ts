import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const QUIKTRACK_APP_SLUG = "quiktrack";

export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ valid: false, reason: "unauthenticated" });
  }

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ valid: true, hasTenant: false });
  }

  const membership = await db.orgMember.findFirst({
    where: { userId: session.user.id, orgId, status: "active" },
  });
  if (!membership) {
    return NextResponse.json({ valid: false, reason: "deactivated" });
  }

  const app = await db.app.findUnique({ where: { slug: QUIKTRACK_APP_SLUG } });
  if (app) {
    const appAccess = await db.userAppAccess.findUnique({
      where: {
        userId_orgId_appId: {
          userId: session.user.id,
          orgId,
          appId: app.id,
        },
      },
    });
    if (!appAccess) {
      return NextResponse.json({ valid: false, reason: "app_access_revoked" });
    }
  }

  return NextResponse.json({ valid: true, hasTenant: true });
}
