import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { z } from "zod";

const userIdSchema = z.object({
  userId: z.string().uuid("userId must be a valid UUID"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const { tenantId } = auth;
  const blocked = await gateModuleApi("admin", "teams", tenantId);
  if (blocked) return blocked;
  const teamId = params.id;

  const team = await db.team.findFirst({ where: { id: teamId, tenantId } });
  if (!team) {
    return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = userIdSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }
  const { userId } = parsed.data;

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
  const blocked = await gateModuleApi("admin", "teams", tenantId);
  if (blocked) return blocked;
  const teamId = params.id;

  const delBody = await request.json();
  const delParsed = userIdSchema.safeParse(delBody);
  if (!delParsed.success) {
    return NextResponse.json(
      { success: false, error: delParsed.error.errors[0].message },
      { status: 400 }
    );
  }
  const { userId } = delParsed.data;

  await db.userTeam.deleteMany({
    where: { tenantId, userId, teamId },
  });

  return NextResponse.json({ success: true, message: "Member removed from team" });
}
