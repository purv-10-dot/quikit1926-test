import { NextResponse } from "next/server";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { forbidden, userCanInProject } from "@/lib/api/permissions";
import { unlinkTeamFromProject } from "@/lib/services/projectTeams";

/**
 * DELETE /api/projects/:id/teams/:teamId — unlink a team from this space.
 *
 * Removes only the association row; the team itself and its members are
 * untouched (see the note in `lib/services/projectTeams.ts`). Gated on
 * Project:update, same as linking.
 */
export const DELETE = withProjectAccess<{ id: string; teamId: string }>(
  async ({ orgId, userId, projectId, isTenantAdmin }, _req, { params }) => {
    try {
      if (
        !isTenantAdmin &&
        !(await userCanInProject(userId, orgId, projectId, "Project", "update"))
      ) {
        return forbidden("You don't have permission to manage this space's teams.");
      }

      const removed = await unlinkTeamFromProject(orgId, projectId, params.teamId);
      if (!removed) {
        return NextResponse.json(
          { success: false, error: "That team isn't linked to this space." },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true, data: { teamId: params.teamId } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to unlink team";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { paramKey: "id" },
);
