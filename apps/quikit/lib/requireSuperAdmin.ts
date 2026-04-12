/**
 * API guard: requires the caller to be a super admin.
 * Returns the userId or throws a NextResponse error.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function requireSuperAdmin(): Promise<
  { userId: string } | { error: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  });

  if (!user?.isSuperAdmin) {
    return { error: NextResponse.json({ success: false, error: "Super admin access required" }, { status: 403 }) };
  }

  return { userId: session.user.id };
}
