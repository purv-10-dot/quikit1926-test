import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { deleteFormTab, FormStructureError } from "@/lib/services/forms/form-structure.service";

export const runtime = "nodejs";

/** DELETE /api/forms/tabs/[tabId] — delete a tab (the protected tab is rejected). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ tabId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { tabId } = await params;
    await deleteFormTab(tabId);
    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (e) {
    if (e instanceof FormStructureError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
