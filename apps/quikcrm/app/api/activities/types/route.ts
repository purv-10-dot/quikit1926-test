import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { listActivityTypes } from "@/lib/services/activity-types/repo";
import { ensureDefaultActivityTypes } from "@/lib/services/activity-types/ensure-defaults";

export const runtime = "nodejs";

// User-facing list of active activity types for the logging UX (type-picker).
// Gated on activities:view — NOT requirePermission("settings") — so any logger
// can read the types, not just admins (the admin config list lives at
// /api/settings/activity-types and IS settings-gated).
//
// First read for an org seeds the 12 default activity types + their fields
// (ensureDefaultActivityTypes — idempotent, seed-on-first-read). They are
// ordinary, fully-editable rows afterwards. The empty-state CTA in the modal
// now only shows if an admin has deactivated/deleted every type.
export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "view");

    await ensureDefaultActivityTypes(user.orgId);
    const types = await listActivityTypes(user.orgId, { activeOnly: true });
    return NextResponse.json({ success: true, data: types });
  } catch (e) {
    return errorResponse(e);
  }
}
