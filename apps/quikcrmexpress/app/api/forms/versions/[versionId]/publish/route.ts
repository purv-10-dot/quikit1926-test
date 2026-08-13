import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { publishVersion } from "@/lib/services/forms/form-version.service";
import { FormStructureError } from "@/lib/services/forms/form-structure.service";

export const runtime = "nodejs";

/**
 * POST /api/forms/versions/[versionId]/publish — publish a draft: it becomes the
 * form set's live version; the previously-current version is retired.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { versionId } = await params;
    const published = await publishVersion(versionId);
    return NextResponse.json({ success: true, data: published });
  } catch (e) {
    if (e instanceof FormStructureError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
