import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { createFormSet, listFormSets } from "@/lib/services/forms/form-set.service";
import { FormStructureError } from "@/lib/services/forms/form-structure.service";

export const runtime = "nodejs";

/** GET /api/forms/sets — the tenant's call_disposition form sets (with versions). */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const data = await listFormSets(user.tenantId);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}

const createSchema = z.object({ name: z.string().trim().min(1).max(120) });

/** POST /api/forms/sets — create a set + v1 draft + protected tab/fields. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const data = await createFormSet({
      tenantId: user.tenantId,
      name: parsed.data.name,
      createdByUserId: user.userId,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (e) {
    if (e instanceof FormStructureError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
