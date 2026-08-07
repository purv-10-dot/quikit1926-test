import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/team/www — active WWW items for the user's org, sourced from QuikScale schema.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = session.user.orgId as string | undefined;
  if (!orgId) return NextResponse.json({ items: [] });

  const items = await db.wWWItem.findMany({
    where: { orgId, deletedAt: null },
    select: {
      id:     true,
      who:    true,
      what:   true,
      when:   true,
      status: true,
      notes:  true,
      linkedPriorityId: true,
      linkedKPIId:      true,
    },
    orderBy: [{ position: "asc" }, { when: "asc" }],
    take: 100,
  });

  return NextResponse.json({ items });
}
