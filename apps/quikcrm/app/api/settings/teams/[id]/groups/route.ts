/**
 * POST /api/settings/teams/[id]/groups   — link a CrmSalesGroup to a team
 * DELETE /api/settings/teams/[id]/groups — unlink a CrmSalesGroup from a team
 *
 * A sales group can belong to at most one team at a time.
 * Linking a group to a different team first unlinks it from the old one
 * (enforced in sales-groups.service.ts / teams.service.ts at the DB level
 * via SET NULL on the old teamId before the new value is written).
 *
 * REQUIRES MIGRATION: docs/migrations/20260610_enterprise_team_hierarchy.sql
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";
import { teamGroupSchema } from "@/lib/validators/settings-teams";
import {
  linkGroupToTeam,
  unlinkGroupFromTeam,
} from "@/lib/services/settings/teams.service";
import { SettingsConflictError } from "@/lib/services/settings/users.service";

export const runtime = "nodejs";

function conflict(e: unknown) {
  if (e instanceof SettingsConflictError)
    return NextResponse.json({ error: e.message }, { status: e.statusCode });
  return errorResponse(e);
}

/** Link a sales group to this team. Body: { groupId } */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");

    const parsed = teamGroupSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    await linkGroupToTeam({ actor: user, teamId: id, groupId: parsed.data.groupId });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return conflict(e);
  }
}

/** Unlink a sales group from this team. Body: { groupId } */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");

    const parsed = teamGroupSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    await unlinkGroupFromTeam({ actor: user, teamId: id, groupId: parsed.data.groupId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return conflict(e);
  }
}
