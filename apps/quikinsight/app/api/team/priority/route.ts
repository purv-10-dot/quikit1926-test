import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/team/priority — active Priorities for the user's org, sourced from QuikScale schema.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = session.user.orgId as string | undefined;
  if (!orgId) return NextResponse.json({ priorities: [] });

  const priorities = await db.priority.findMany({
    where: { orgId, deletedAt: null },
    select: {
      id:           true,
      name:         true,
      description:  true,
      quarter:      true,
      year:         true,
      overallStatus:true,
      startWeek:    true,
      endWeek:      true,
      teamId:       true,
      owner_user: { select: { id: true, firstName: true, lastName: true } },
      team:       { select: { id: true, name: true } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  return NextResponse.json({ priorities });
}
