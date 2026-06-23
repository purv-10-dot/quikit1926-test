import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getActivityTypeWithFields } from "@/lib/services/activity-types/repo";

export const runtime = "nodejs";

// User-facing per-type field definitions for the logging type-picker (once a
// type is chosen). Gated on activities:view — NOT requirePermission("settings")
// — so any logger can read a type's fields, mirroring the T-P3.1 list endpoint.
// (The admin field-list at /api/settings/activity-types/[id]/fields IS
// settings-gated.)
//
// Returns fieldDefs[] only — the picker already has the type from the list; it
// just needs the fields now. getActivityTypeWithFields is scoped to (orgId,
// id), so a type outside the caller's org resolves to null → 404 (no
// cross-tenant leakage).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "view");

    const { id } = await params;
    const type = await getActivityTypeWithFields(user.orgId, id);
    if (!type) {
      return NextResponse.json(
        { success: false, error: "Activity type not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: type.fieldDefinitions });
  } catch (e) {
    return errorResponse(e);
  }
}
