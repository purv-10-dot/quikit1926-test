/**
 * POST /api/settings/teams/[id]/managers   — add manager(s) to a team
 * DELETE /api/settings/teams/[id]/managers — remove a manager from a team
 *
 * CrmTeamManager rows give users the TeamManager role scope for a team.
 * The primary manager is also stored on CrmSalesTeam.managerId for
 * backwards-compatibility with the existing single-manager UI.
 *
 * REQUIRES MIGRATION: docs/migrations/20260610_enterprise_team_hierarchy.sql
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  teamManagersSchema,
  removeManagerSchema,
} from "@/lib/validators/settings-teams";
import {
  addTeamManagers,
  removeTeamManager,
} from "@/lib/services/settings/teams.service";
import { SettingsConflictError } from "@/lib/services/settings/users.service";

export const runtime = "nodejs";

function conflict(e: unknown) {
  if (e instanceof SettingsConflictError)
    return NextResponse.json({ error: e.message }, { status: e.statusCode });
  return errorResponse(e);
}

/** Add one or more managers to a team. Body: { userIds: string[] } */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");

    const parsed = teamManagersSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    await addTeamManagers({ actor: user, teamId: id, userIds: parsed.data.userIds });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return conflict(e);
  }
}

/** Remove a manager from a team. Body: { userId: string } */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");

    const parsed = removeManagerSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    await removeTeamManager({ actor: user, teamId: id, userId: parsed.data.userId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return conflict(e);
  }
}
