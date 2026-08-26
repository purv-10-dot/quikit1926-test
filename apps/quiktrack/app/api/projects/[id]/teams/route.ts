import { NextResponse } from "next/server";
import { z } from "zod";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { forbidden, userCanInProject } from "@/lib/api/permissions";
import {
  listAvailableTeams,
  listLinkedTeams,
  linkTeamToProject,
} from "@/lib/services/projectTeams";

const linkSchema = z.object({ teamId: z.string().min(1) });

/**
 * GET /api/projects/:id/teams — the space's linked teams, plus the org teams
 * still available to link (so the picker needs one round-trip, not two).
 *
 * Readable by any project member: knowing which teams work on a space is part
 * of the space's context, the same way its member list is. `canManage` tells the
 * client whether to render the link/unlink controls; the mutating routes
 * enforce it independently.
 */
export const GET = withProjectAccess<{ id: string }>(
  async ({ orgId, userId, projectId, isTenantAdmin }) => {
    try {
      const canManage =
        isTenantAdmin || (await userCanInProject(userId, orgId, projectId, "Project", "update"));
      const [linked, available] = await Promise.all([
        listLinkedTeams(orgId, projectId),
        listAvailableTeams(orgId, projectId),
      ]);
      return NextResponse.json({ success: true, data: { linked, available, canManage } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load teams";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { paramKey: "id" },
);

/**
 * POST /api/projects/:id/teams — link an org team to this space.
 * Gated on Project:update (Space Admins + org/app admins), matching the rest of
 * the space-configuration surface.
 */
export const POST = withProjectAccess<{ id: string }>(
  async ({ orgId, userId, projectId, isTenantAdmin }, req) => {
    try {
      if (
        !isTenantAdmin &&
        !(await userCanInProject(userId, orgId, projectId, "Project", "update"))
      ) {
        return forbidden("You don't have permission to manage this space's teams.");
      }

      const parsed = linkSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "teamId is required" },
          { status: 400 },
        );
      }

      const result = await linkTeamToProject(orgId, projectId, parsed.data.teamId, userId);
      if (result === "team-not-found") {
        return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
      }
      // Already linked is a no-op success, not a conflict: two admins clicking
      // "Link" at once should both end up in the intended state.
      return NextResponse.json(
        { success: true, data: { teamId: parsed.data.teamId, linked: true } },
        { status: result === "linked" ? 201 : 200 },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to link team";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { paramKey: "id" },
);
