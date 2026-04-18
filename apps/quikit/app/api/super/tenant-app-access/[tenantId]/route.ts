/**
 * SA-B.1 — Super-admin per-tenant app access control.
 *
 * GET  /api/super/tenant-app-access/:tenantId
 *   Returns the tenant's access status for each registered app:
 *   { appId, slug, name, enabled, reason, updatedAt }[]
 *
 * POST /api/super/tenant-app-access/:tenantId
 *   Toggles access for one (appId).
 *   Body: { appId: string, enabled: boolean, reason?: string }
 *   Sparse storage: an `enabled: true` toggle deletes the row (default state).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";

export const GET = withSuperAdminAuth<{ tenantId: string }>(async (auth, _req: NextRequest, { params }) => {
  try {
    const { tenantId } = params;
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true },
    });
    if (!tenant) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });
    }

    const [apps, accessRows] = await Promise.all([
      db.app.findMany({
        select: { id: true, slug: true, name: true, status: true, iconUrl: true },
        orderBy: { name: "asc" },
      }),
      db.tenantAppAccess.findMany({
        where: { tenantId },
        select: { appId: true, enabled: true, reason: true, updatedAt: true, updatedBy: true },
      }),
    ]);
    const accessMap = new Map(accessRows.map((r) => [r.appId, r]));

    const data = apps.map((app) => {
      const access = accessMap.get(app.id);
      return {
        appId: app.id,
        slug: app.slug,
        name: app.name,
        iconUrl: app.iconUrl,
        appStatus: app.status,
        enabled: access ? access.enabled : true,
        reason: access?.reason ?? null,
        updatedAt: access?.updatedAt?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ success: true, data: { tenant, apps: data } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load tenant app access";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

export const POST = withSuperAdminAuth<{ tenantId: string }>(async (auth, req: NextRequest, { params }) => {
  try {
    const { tenantId } = params;
    const body = await req.json();
    const appId = typeof body.appId === "string" ? body.appId : null;
    const enabled = typeof body.enabled === "boolean" ? body.enabled : null;
    const reason = typeof body.reason === "string" && body.reason.trim().length ? body.reason.trim().slice(0, 200) : null;

    if (!appId || enabled === null) {
      return NextResponse.json({ success: false, error: "appId and enabled are required" }, { status: 400 });
    }

    const [tenant, app] = await Promise.all([
      db.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } }),
      db.app.findUnique({ where: { id: appId }, select: { id: true, slug: true, name: true } }),
    ]);
    if (!tenant || !app) {
      return NextResponse.json({ success: false, error: "Unknown tenant or app" }, { status: 404 });
    }

    const existing = await db.tenantAppAccess.findUnique({
      where: { tenantId_appId: { tenantId, appId } },
      select: { id: true, enabled: true, reason: true },
    });

    // Sparse storage: when toggling back to enabled (default), just delete the row.
    if (enabled === true) {
      if (existing) {
        await db.tenantAppAccess.delete({ where: { id: existing.id } });
      }
      logAudit({
        tenantId,
        actorId: auth.userId,
        action: "UPDATE",
        entityType: "TenantAppAccess",
        entityId: `${tenantId}:${appId}`,
        newValues: JSON.stringify({ enabled: true, reason: null }),
        oldValues: existing ? JSON.stringify({ enabled: existing.enabled, reason: existing.reason }) : undefined,
      });
      return NextResponse.json({
        success: true,
        data: { appId, enabled: true, reason: null, updatedAt: new Date().toISOString() },
      });
    }

    // Blocking (enabled = false): upsert a sparse row.
    const row = await db.tenantAppAccess.upsert({
      where: { tenantId_appId: { tenantId, appId } },
      update: { enabled: false, reason, updatedBy: auth.userId },
      create: { tenantId, appId, enabled: false, reason, updatedBy: auth.userId },
      select: { id: true, enabled: true, reason: true, updatedAt: true },
    });

    logAudit({
      tenantId,
      actorId: auth.userId,
      action: "UPDATE",
      entityType: "TenantAppAccess",
      entityId: `${tenantId}:${appId}`,
      newValues: JSON.stringify({ enabled: false, reason }),
      oldValues: existing ? JSON.stringify({ enabled: existing.enabled, reason: existing.reason }) : undefined,
    });

    return NextResponse.json({
      success: true,
      data: { appId, enabled: row.enabled, reason: row.reason, updatedAt: row.updatedAt.toISOString() },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update tenant app access";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
