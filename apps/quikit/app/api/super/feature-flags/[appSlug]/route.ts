import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { getAppConfig } from "@quikit/shared/moduleRegistry";

/**
 * GET /api/super/feature-flags/[appSlug]?tenantId=X
 *
 * Returns the set of disabled moduleKeys for the given (tenant, app). The
 * registry is static + client-safe so the caller can merge this result with
 * the module tree on the client. Also returns the registry for convenience
 * — saves the client from re-importing it when rendering the tree.
 *
 * Response: { success: true, data: { app, disabledKeys: string[] } }
 */
export const GET = withSuperAdminAuth<{ appSlug: string }>(async (auth, request: NextRequest, { params }) => {
  try {
    const { appSlug } = params;
    const config = getAppConfig(appSlug);
    if (!config) {
      return NextResponse.json(
        { success: false, error: "Unknown app" },
        { status: 404 },
      );
    }

    const tenantId = request.nextUrl.searchParams.get("tenantId");
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "tenantId query param required" },
        { status: 400 },
      );
    }

    const app = await db.app.findUnique({
      where: { slug: appSlug },
      select: { id: true },
    });
    if (!app) {
      return NextResponse.json(
        { success: false, error: "App not registered in database" },
        { status: 404 },
      );
    }

    const rows = await db.appModuleFlag.findMany({
      where: { tenantId, appId: app.id, enabled: false },
      select: { moduleKey: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        appSlug,
        tenantId,
        disabledKeys: rows.map((r) => r.moduleKey),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
