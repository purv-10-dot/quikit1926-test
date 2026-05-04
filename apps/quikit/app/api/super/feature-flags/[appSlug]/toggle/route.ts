import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";
import { getAppConfig } from "@quikit/shared/moduleRegistry";
import { invalidate } from "@quikit/shared/redisCache";

/**
 * POST /api/super/feature-flags/[appSlug]/toggle
 * Body: { orgId: string, moduleKey: string, enabled: boolean }
 *
 * Sparse storage:
 *   - enabled: true  → DELETE the row (or no-op if not present).
 *   - enabled: false → UPSERT a row with enabled: false.
 *
 * Writes an AuditLog entry on every successful change.
 *
 * Response: { success: true, data: { orgId, moduleKey, enabled } }
 */

const bodySchema = z.object({
  orgId: z.string().min(1),
  moduleKey: z.string().min(1).max(200),
  enabled: z.boolean(),
});

export const POST = withSuperAdminAuth<{ appSlug: string }>(async (auth, request: NextRequest, { params }) => {
  try {
    const actorId = auth.userId;

    const { appSlug } = params;
    const config = getAppConfig(appSlug);
    if (!config) {
      return NextResponse.json(
        { success: false, error: "Unknown app" },
        { status: 404 },
      );
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid body" },
        { status: 400 },
      );
    }
    const { orgId, moduleKey, enabled } = parsed.data;

    // Sanity: the moduleKey must exist in the registry for this app. We
    // still write/delete even if not — future registry edits would orphan
    // otherwise — but warn so operators see it in logs.
    if (!config.modules.some((m) => m.key === moduleKey)) {
      console.warn(
        `[feature-flags] moduleKey '${moduleKey}' is not in the ${appSlug} registry`,
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

    // Verify the target org exists (useful 404 rather than FK violation).
    const org = await db.org.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });
    if (!org) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    if (enabled) {
      // Delete the "disabled" override if it exists; default = enabled.
      await db.appModuleFlag.deleteMany({
        where: { orgId, appId: app.id, moduleKey },
      });
    } else {
      // Upsert a disabled-row.
      await db.appModuleFlag.upsert({
        where: {
          orgId_appId_moduleKey: { orgId, appId: app.id, moduleKey },
        },
        create: {
          orgId,
          appId: app.id,
          moduleKey,
          enabled: false,
          updatedBy: actorId,
        },
        update: {
          enabled: false,
          updatedBy: actorId,
        },
      });
    }

    logAudit({
      action: enabled ? "feature_flag_enabled" : "feature_flag_disabled",
      entityType: "AppModuleFlag",
      entityId: `${appSlug}/${moduleKey}`,
      actorId,
      orgId,
      newValues: JSON.stringify({ appSlug, moduleKey, enabled, orgName: org.name }),
    });

    // Invalidate the target app's disabled-modules cache so the next
    // /api/feature-flags/me fetch from that app returns fresh state.
    // Without this, the 5-min Redis TTL makes toggles appear "stuck"
    // in the target app's sidebar for up to 5 minutes.
    await invalidate(`ff:me:${appSlug}:${orgId}`);

    return NextResponse.json({
      success: true,
      data: { orgId, moduleKey, enabled },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
