import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { placeFormField, FormStructureError } from "@/lib/services/forms/form-structure.service";

export const runtime = "nodejs";

const placementSchema = z.object({
  formTabId: z.string().trim().min(1).optional().nullable(),
  formSectionId: z.string().trim().min(1).optional().nullable(),
});

/** PATCH /api/forms/fields/[fieldId]/placement — move a field onto a tab/section. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ fieldId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { fieldId } = await params;
    const parsed = placementSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const field = await placeFormField({
      fieldId,
      formTabId: parsed.data.formTabId ?? null,
      formSectionId: parsed.data.formSectionId ?? null,
    });
    return NextResponse.json({ success: true, data: field });
  } catch (e) {
    if (e instanceof FormStructureError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
