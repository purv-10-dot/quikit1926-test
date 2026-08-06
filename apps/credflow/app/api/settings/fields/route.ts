import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { listLeadFields, createCustomField, FieldDefError } from "@/lib/services/fields/repo";
import { fieldDefinitionCreateSchema } from "@/lib/validators/field-definition";

export const runtime = "nodejs";

/**
 * GET /api/settings/fields
 *   Returns all lead field definitions for the org (standard + custom).
 *
 * Query params:
 *   ?customOnly=true  → returns only custom (org-defined) fields
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const customOnly = new URL(req.url).searchParams.get("customOnly") === "true";
    const items = await listLeadFields(user.tenantId);
    return NextResponse.json({ items: customOnly ? items.filter((f) => !f.isStandard) : items });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/settings/fields — create a new custom field.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "create");
    const parsed = fieldDefinitionCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid field definition", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const created = await createCustomField(user.tenantId, { ...parsed.data, isStandard: false });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof FieldDefError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
