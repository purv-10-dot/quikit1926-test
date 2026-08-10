import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { createFormField, FormStructureError } from "@/lib/services/forms/form-structure.service";

export const runtime = "nodejs";

const createFieldSchema = z.object({
  fieldKey: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
  fieldType: z.enum(["text", "datetime", "dropdown", "number", "user_picker", "file_upload"]),
  tab: z.enum(["contact_details", "call_disposition"]).optional(),
  requiredLevel: z.enum(["none", "soft", "hard"]).optional(),
  sortOrder: z.number().int().nonnegative(),
  formTabId: z.string().optional().nullable(),
  formSectionId: z.string().optional().nullable(),
  userPickerMode: z.enum(["single", "multi"]).optional().nullable(),
  userPickerScope: z.enum(["all_users", "team", "role"]).optional().nullable(),
  defaultVisibility: z.enum(["visible", "hidden"]).optional(),
  options: z.array(z.object({ valueKey: z.string().min(1), label: z.string().min(1) })).optional(),
});

/** POST /api/forms/versions/[versionId]/fields — add a field to a draft version. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { versionId } = await params;
    const parsed = createFieldSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const field = await createFormField({ formSetVersionId: versionId, ...parsed.data });
    return NextResponse.json({ success: true, data: field }, { status: 201 });
  } catch (e) {
    if (e instanceof FormStructureError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
