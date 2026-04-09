import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ valid: false, reason: "unauthenticated" });
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return NextResponse.json({ valid: true, hasTenant: false });
  }

  const membership = await db.membership.findFirst({
    where: {
      userId: session.user.id,
      tenantId,
      status: "active",
    },
  });

  if (!membership) {
    return NextResponse.json({ valid: false, reason: "deactivated" });
  }

  return NextResponse.json({ valid: true, hasTenant: true });
}
