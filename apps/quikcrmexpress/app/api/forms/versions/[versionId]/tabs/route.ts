import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  getFormStructure,
  createFormTab,
  FormStructureError,
} from "@/lib/services/forms/form-structure.service";

export const runtime = "nodejs";

/** GET /api/forms/versions/[versionId]/tabs — full tab/section/field structure. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { versionId } = await params;
    const data = await getFormStructure(versionId);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}

const createTabSchema = z.object({
  name: z.string().trim().min(1).max(60),
  visibility: z.enum(["always", "rule_driven"]).default("always"),
  sortOrder: z.number().int().nonnegative(),
});

/** POST /api/forms/versions/[versionId]/tabs — add a tab to a draft version. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { versionId } = await params;
    const parsed = createTabSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const tab = await createFormTab({
      formSetVersionId: versionId,
      name: parsed.data.name,
      visibility: parsed.data.visibility,
      sortOrder: parsed.data.sortOrder,
      createdByUserId: user.userId,
    });
    return NextResponse.json({ success: true, data: tab }, { status: 201 });
  } catch (e) {
    if (e instanceof FormStructureError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
