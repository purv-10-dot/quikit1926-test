import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { cloneVersionToDraft } from "@/lib/services/forms/form-version.service";
import { FormStructureError } from "@/lib/services/forms/form-structure.service";

export const runtime = "nodejs";

/**
 * POST /api/forms/versions/[versionId]/clone — clone-on-edit: deep-copy a
 * (published/retired/draft) version into a new editable draft. The source is
 * left frozen. The UI calls this when an admin edits a published form.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { versionId } = await params;
    const draft = await cloneVersionToDraft(versionId);
    return NextResponse.json({ success: true, data: draft }, { status: 201 });
  } catch (e) {
    if (e instanceof FormStructureError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
