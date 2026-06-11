import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";
import { createTeamSchema } from "@/lib/validators/settings-teams";
import { listTeams, createTeam } from "@/lib/services/settings/teams.service";
import { SettingsConflictError } from "@/lib/services/settings/users.service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    // Admins see all teams; non-admins see only teams they manage or belong to.
    // Do NOT gate on requirePermission("settings","view") — that silently returns
    // an empty list for TeamManagers/SalesManagers who have no "settings" permission
    // but legitimately need to view their own teams.
    const isAdmin = user.role === "Administrator";
    const items = await listTeams(user.orgId, isAdmin ? undefined : user.userId);
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof SettingsConflictError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "create");
    const parsed = createTeamSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const created = await createTeam({ actor: user, data: parsed.data });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof SettingsConflictError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    return errorResponse(e);
  }
}
