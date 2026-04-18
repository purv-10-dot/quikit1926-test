import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { z } from "zod";

const userIdSchema = z.object({
  userId: z.string().uuid("userId must be a valid UUID"),
});

export const POST = withAdminAuth<{ id: string }>(async ({ tenantId }, request: NextRequest, { params }) => {
  const blocked = await gateModuleApi("admin", "teams", tenantId);
  if (blocked) return blocked as NextResponse;
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
});

export const DELETE = withAdminAuth<{ id: string }>(async ({ tenantId }, request: NextRequest, { params }) => {
  const blocked = await gateModuleApi("admin", "teams", tenantId);
  if (blocked) return blocked as NextResponse;
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
});
