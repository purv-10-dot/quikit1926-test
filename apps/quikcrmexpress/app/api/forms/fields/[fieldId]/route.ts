import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { updateFormField, deleteFormField, FormStructureError } from "@/lib/services/forms/form-structure.service";

export const runtime = "nodejs";

const updateFieldSchema = z.object({
  label: z.string().trim().min(1).max(160).optional(),
  requiredLevel: z.enum(["none", "soft", "hard"]).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  userPickerMode: z.enum(["single", "multi"]).optional().nullable(),
  userPickerScope: z.enum(["all_users", "team", "role"]).optional().nullable(),
});

/** PATCH /api/forms/fields/[fieldId] — edit a field on its (draft) version. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ fieldId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { fieldId } = await params;
    const parsed = updateFieldSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const field = await updateFormField({ fieldId, ...parsed.data });
    return NextResponse.json({ success: true, data: field });
  } catch (e) {
    if (e instanceof FormStructureError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}

/** DELETE /api/forms/fields/[fieldId] — remove a non-protected field. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ fieldId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { fieldId } = await params;
    await deleteFormField(fieldId);
    return NextResponse.json({ success: true, data: { id: fieldId } });
  } catch (e) {
    if (e instanceof FormStructureError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
