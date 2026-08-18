import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";
import { createSalesGroupSchema } from "@/lib/validators/settings-sales-groups";
import { listGroups, createGroup } from "@/lib/services/settings/sales-groups.service";
import { SettingsConflictError } from "@/lib/services/settings/users.service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "view");
    const items = await listGroups(user.orgId);
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof SettingsConflictError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "create");
    const parsed = createSalesGroupSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const created = await createGroup({ actor: user, data: parsed.data });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof SettingsConflictError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    return errorResponse(e);
  }
}
