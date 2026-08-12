import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { createFormSection, FormStructureError } from "@/lib/services/forms/form-structure.service";

export const runtime = "nodejs";

const createSectionSchema = z.object({
  name: z.string().trim().max(60).optional().nullable(),
  sortOrder: z.number().int().nonnegative(),
});

/** POST /api/forms/tabs/[tabId]/sections — add a section to a tab (draft version). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ tabId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { tabId } = await params;
    const parsed = createSectionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const section = await createFormSection({
      formTabId: tabId,
      name: parsed.data.name ?? null,
      sortOrder: parsed.data.sortOrder,
    });
    return NextResponse.json({ success: true, data: section }, { status: 201 });
  } catch (e) {
    if (e instanceof FormStructureError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
