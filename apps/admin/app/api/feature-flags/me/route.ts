import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDisabledModules } from "@quikit/auth/feature-gate";

/**
 * GET /api/feature-flags/me
 *
 * Returns the set of disabled moduleKeys for the current user's tenant on
 * THIS app (hard-coded to "admin"). Used by the sidebar to filter the
 * nav tree. Safe to call freely — response dedupes via React.cache on the
 * server.
 *
 * Response: { success: true, data: { appSlug, disabledKeys: string[] } }
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const tenantId = session?.user?.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const disabled = await getDisabledModules(tenantId, "admin");
    return NextResponse.json({
      success: true,
      data: {
        appSlug: "admin",
        disabledKeys: Array.from(disabled),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
