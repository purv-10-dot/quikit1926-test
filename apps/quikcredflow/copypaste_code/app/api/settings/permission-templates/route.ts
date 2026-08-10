import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";
import { createPermissionTemplateSchema } from "@/lib/validators/settings-permission-templates";
import { listTemplates, createTemplate } from "@/lib/services/settings/permission-templates.service";
import { SettingsConflictError } from "@/lib/services/settings/users.service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "view");
    const items = await listTemplates(user.tenantId);
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
    const parsed = createPermissionTemplateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const created = await createTemplate({ actor: user, data: parsed.data });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof SettingsConflictError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    return errorResponse(e);
  }
}
