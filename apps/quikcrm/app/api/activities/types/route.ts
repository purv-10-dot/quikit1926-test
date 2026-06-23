import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { listActivityTypes } from "@/lib/services/activity-types/repo";

export const runtime = "nodejs";

// User-facing list of active activity types for the logging UX (type-picker).
// Gated on activities:view — NOT requirePermission("settings") — so any logger
// can read the types, not just admins (the admin config list lives at
// /api/settings/activity-types and IS settings-gated).
//
// Empty-state-CTA is LOCKED: returns ONLY real, isActive, admin-configured
// types. No built-in Note/Call/Email synthesis. An un-configured org yields
// { success: true, data: [] } — a valid response the UI renders as a CTA.
export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "view");

    const types = await listActivityTypes(user.orgId, { activeOnly: true });
    return NextResponse.json({ success: true, data: types });
  } catch (e) {
    return errorResponse(e);
  }
}
