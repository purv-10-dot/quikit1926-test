import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { db } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const { tenantId } = auth;
  const teamId = params.id;

  const team = await db.team.findFirst({ where: { id: teamId, tenantId } });
  if (!team) {
    return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
  }

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 });
  }

  // Verify user has membership in this tenant
  const membership = await db.membership.findFirst({
    where: { userId, tenantId, status: "active" },
  });
  if (!membership) {
    return NextResponse.json(
      { success: false, error: "User is not an active member of this organisation" },
      { status: 400 }
    );
  }

  // Create UserTeam (skipDuplicates equivalent via upsert)
  await db.userTeam.upsert({
    where: { tenantId_userId_teamId: { tenantId, userId, teamId } },
    create: { tenantId, userId, teamId },
    update: {},
  });

  return NextResponse.json({ success: true, message: "Member added to team" });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const { tenantId } = auth;
  const teamId = params.id;

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 });
  }

  await db.userTeam.deleteMany({
    where: { tenantId, userId, teamId },
  });

  return NextResponse.json({ success: true, message: "Member removed from team" });
}
