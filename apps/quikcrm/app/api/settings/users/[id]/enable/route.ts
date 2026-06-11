import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";
import { setUserStatus, SettingsConflictError } from "@/lib/services/settings/users.service";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "users", "edit");
    const updated = await setUserStatus({ actor: user, id, status: "Active" });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof SettingsConflictError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    return errorResponse(e);
  }
}
