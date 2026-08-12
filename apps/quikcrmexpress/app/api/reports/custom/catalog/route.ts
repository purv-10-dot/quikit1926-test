/**
 * GET /api/reports/custom/catalog — report builder field metadata.
 */
import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { CUSTOM_REPORT_CATALOG } from "@/lib/services/reports/custom/catalog";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "reports", "view");

    return NextResponse.json({
      success: true,
      data: { objects: CUSTOM_REPORT_CATALOG },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
