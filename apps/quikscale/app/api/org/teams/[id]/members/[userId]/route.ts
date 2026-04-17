import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("orgSetup.teams");

type RouteParams = { id: string; userId: string };

/**
 * DELETE /api/org/teams/[id]/members/[userId]
 *
 * Removes a user from a team. Inverse of POST /members:
 *   - If Membership.teamId currently points to this team, clear it to null
 *     (user becomes unassigned to a primary team).
 *   - Delete the UserTeam row if present.
 *   - Does NOT delete or deactivate the Membership itself — the user is
 *     still part of the organisation, just not this team.
 */
export const DELETE = withTenantAuth<RouteParams>(
  async ({ tenantId }, _request, { params }) => {
    // Verify team belongs to this tenant
    const team = await db.team.findFirst({
      where: { id: params.id, tenantId },
    });
    if (!team) {
      return NextResponse.json(
        { success: false, error: "Team not found" },
        { status: 404 },
      );
    }

    // Find the target user's membership in this tenant
    const membership = await db.membership.findFirst({
      where: { tenantId, userId: params.userId, status: "active" },
      select: { id: true, teamId: true },
    });
    if (!membership) {
      return NextResponse.json(
        { success: false, error: "User is not a member of this organisation" },
        { status: 404 },
      );
    }

    // Clear Membership.teamId only if it currently points to THIS team.
    // Preserves a different primary-team assignment if one exists.
    if (membership.teamId === params.id) {
      await db.membership.update({
        where: { id: membership.id },
        data: { teamId: null },
      });
    }

    // Drop the UserTeam row (no-op if it doesn't exist)
    await db.userTeam.deleteMany({
      where: { tenantId, userId: params.userId, teamId: params.id },
    });

    return NextResponse.json({ success: true });
  },
  { fallbackErrorMessage: "Failed to remove team member" },
);
