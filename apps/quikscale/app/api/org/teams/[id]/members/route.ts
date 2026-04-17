import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("orgSetup.teams");
import { addTeamMembersSchema } from "@/lib/schemas/teamMembersSchema";

/**
 * POST /api/org/teams/[id]/members
 *
 * Adds one or more users as members of the given team. For each user we:
 *   1. Verify they have an active Membership in the tenant.
 *   2. Set Membership.teamId = team.id (the "primary team" that the
 *      /api/org/teams list query reads through `members: Membership[]`).
 *   3. Upsert a UserTeam row for multi-team tracking (in case a future
 *      UI surfaces secondary teams).
 *
 * Responds with { success, data: { added, skipped, skippedUserIds } }
 * so the client can report partial failures.
 */
export const POST = withTenantAuth<{ id: string }>(async ({ tenantId }, req, { params }) => {
  // Verify team belongs to this tenant and isn't soft-deleted
  const team = await db.team.findFirst({
    where: { id: params.id, tenantId },
  });
  if (!team) {
    return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
  }

  // Validate request body
  const parsed = addTeamMembersSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { userIds } = parsed.data;

  // Fetch the candidate memberships in one query to minimise round trips
  const candidates = await db.membership.findMany({
    where: { tenantId, userId: { in: userIds }, status: "active" },
    select: { id: true, userId: true, teamId: true },
  });
  const candidateByUser = new Map(candidates.map((m) => [m.userId, m]));

  let added = 0;
  const skipped: string[] = [];

  for (const userId of userIds) {
    const membership = candidateByUser.get(userId);
    if (!membership) {
      skipped.push(userId);
      continue;
    }

    // Idempotent: skip if already on this team
    if (membership.teamId === params.id) {
      continue;
    }

    // Primary-team assignment: set Membership.teamId
    await db.membership.update({
      where: { id: membership.id },
      data: { teamId: params.id },
    });

    // Multi-team tracking (join table) — upsert so repeated adds are safe
    await db.userTeam.upsert({
      where: {
        tenantId_userId_teamId: { tenantId, userId, teamId: params.id },
      },
      update: {},
      create: { tenantId, userId, teamId: params.id },
    });

    added++;
  }

  // Return the refreshed team in the same shape the Teams page list uses
  const refreshedTeam = await db.team.findUnique({
    where: { id: params.id },
    include: {
      members: {
        where: { status: "active" },
        select: {
          userId: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  // Resolve head name (mirror of list route)
  let headName: string | null = null;
  if (refreshedTeam?.headId) {
    const head = await db.user.findUnique({
      where: { id: refreshedTeam.headId },
      select: { firstName: true, lastName: true },
    });
    if (head) headName = `${head.firstName} ${head.lastName}`;
  }

  const teamPayload = refreshedTeam
    ? {
        id: refreshedTeam.id,
        name: refreshedTeam.name,
        description: refreshedTeam.description,
        color: refreshedTeam.color,
        headId: refreshedTeam.headId,
        headName,
        memberCount: refreshedTeam.members.length,
        members: refreshedTeam.members.map((m) => ({
          userId: m.user.id,
          firstName: m.user.firstName,
          lastName: m.user.lastName,
          email: m.user.email,
        })),
        createdAt: refreshedTeam.createdAt.toISOString(),
      }
    : null;

  return NextResponse.json({
    success: true,
    data: {
      added,
      skipped: skipped.length,
      skippedUserIds: skipped,
      team: teamPayload,
    },
  });
}, { fallbackErrorMessage: "Failed to add team members" });
