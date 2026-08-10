import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";
import { createUserSchema, listUsersQuerySchema } from "@/lib/validators/settings-users";
import { listUsers, createUser, SettingsConflictError } from "@/lib/services/settings/users.service";

export const runtime = "nodejs";

function conflictResponse(e: unknown) {
  if (e instanceof SettingsConflictError) {
    return NextResponse.json({ error: e.message }, { status: e.statusCode });
  }
  return errorResponse(e);
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "users", "view");
    const parsed = listUsersQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const result = await listUsers({ tenantId: user.tenantId, ...parsed.data });
    return NextResponse.json(result);
  } catch (e) {
    return conflictResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "users", "create");
    const parsed = createUserSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const result = await createUser({ actor: user, data: parsed.data });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return conflictResponse(e);
  }
}
