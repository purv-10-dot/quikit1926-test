/**
 * POST /api/settings/teams/[id]/members   — add users to a team
 * DELETE /api/settings/teams/[id]/members — remove a user from a team
 *
 * Team membership drives executive rollup reporting and TeamManager
 * assignment scope.  It does NOT affect record visibility — that is
 * controlled by CrmSalesGroup membership.
 *
 * REQUIRES MIGRATION: docs/migrations/20260610_enterprise_team_hierarchy.sql
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  teamMembersSchema,
  removeMemberSchema,
} from "@/lib/validators/settings-teams";
import {
  addTeamMembers,
  removeTeamMember,
} from "@/lib/services/settings/teams.service";
import { SettingsConflictError } from "@/lib/services/settings/users.service";

export const runtime = "nodejs";

function conflict(e: unknown) {
  if (e instanceof SettingsConflictError)
    return NextResponse.json({ error: e.message }, { status: e.statusCode });
  return errorResponse(e);
}

/** Add one or more members to a team. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");

    const parsed = teamMembersSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    await addTeamMembers({ actor: user, teamId: id, userIds: parsed.data.userIds });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return conflict(e);
  }
}

/** Remove a single member from a team. Body: { userId } */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");

    const parsed = removeMemberSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    await removeTeamMember({ actor: user, teamId: id, userId: parsed.data.userId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return conflict(e);
  }
}
