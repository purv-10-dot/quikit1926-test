import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  getField,
  updateCustomField,
  deleteCustomField,
  FieldDefError,
} from "@/lib/services/fields/repo";
import { fieldDefinitionPatchSchema } from "@/lib/validators/field-definition";

export const runtime = "nodejs";

/** GET /api/settings/fields/[key] */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const f = await getField(user.tenantId, key);
    if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(f);
  } catch (e) {
    return errorResponse(e);
  }
}

/** PATCH /api/settings/fields/[key] */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const parsed = fieldDefinitionPatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid patch", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const updated = await updateCustomField(user.tenantId, key, parsed.data);
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof FieldDefError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    return errorResponse(e);
  }
}

/** DELETE /api/settings/fields/[key] */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "delete");
    await deleteCustomField(user.tenantId, key);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FieldDefError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    return errorResponse(e);
  }
}
