import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ valid: false, reason: "unauthenticated" });
  }

  if (!session.user.isSuperAdmin) {
    return NextResponse.json({ valid: false, reason: "not_super_admin" });
  }

  return NextResponse.json({ valid: true });
}
