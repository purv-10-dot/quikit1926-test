import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";
import { updateTeamSchema } from "@/lib/validators/settings-teams";
import { getTeam, updateTeam, deleteTeam } from "@/lib/services/settings/teams.service";
import { SettingsConflictError } from "@/lib/services/settings/users.service";

export const runtime = "nodejs";

function conflict(e: unknown) {
  if (e instanceof SettingsConflictError)
    return NextResponse.json({ error: e.message }, { status: e.statusCode });
  return errorResponse(e);
}

/** Full team detail: name, managers, members, linked sales groups with counts. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "view");
    const item = await getTeam(user.orgId, id);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(item);
  } catch (e) {
    return conflict(e);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");
    const parsed = updateTeamSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const updated = await updateTeam({ actor: user, id, patch: parsed.data });
    return NextResponse.json(updated);
  } catch (e) {
    return conflict(e);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "delete");
    await deleteTeam({ actor: user, id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return conflict(e);
  }
}
