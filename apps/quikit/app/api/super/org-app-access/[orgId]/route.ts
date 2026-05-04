/**
 * SA-B.1 — Super-admin per-organization app access control.
 *
 * GET  /api/super/org-app-access/:orgId
 *   Returns the tenant's access status for each registered app:
 *   { appId, slug, name, enabled, reason, updatedAt }[]
 *
 * POST /api/super/org-app-access/:orgId
 *   Toggles access for one (appId).
 *   Body: { appId: string, enabled: boolean, reason?: string }
 *   Sparse storage: an `enabled: true` toggle deletes the row (default state).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";

export const GET = withSuperAdminAuth<{ orgId: string }>(async (auth, _req: NextRequest, { params }) => {
  try {
    const { orgId } = params;
    const org = await db.org.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, slug: true },
    });
    if (!org) {
      return NextResponse.json({ success: false, error: "Organization not found" }, { status: 404 });
    }

    const [apps, accessRows] = await Promise.all([
      db.app.findMany({
        select: { id: true, slug: true, name: true, status: true, iconUrl: true },
        orderBy: { name: "asc" },
      }),
      db.orgAppAccess.findMany({
        where: { orgId },
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

    return NextResponse.json({ success: true, data: { org, apps: data } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load organization app access";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

export const POST = withSuperAdminAuth<{ orgId: string }>(async (auth, req: NextRequest, { params }) => {
  try {
    const { orgId } = params;
    const body = await req.json();
    const appId = typeof body.appId === "string" ? body.appId : null;
    const enabled = typeof body.enabled === "boolean" ? body.enabled : null;
    const reason = typeof body.reason === "string" && body.reason.trim().length ? body.reason.trim().slice(0, 200) : null;

    if (!appId || enabled === null) {
      return NextResponse.json({ success: false, error: "appId and enabled are required" }, { status: 400 });
    }

    const [org, app] = await Promise.all([
      db.org.findUnique({ where: { id: orgId }, select: { id: true, name: true } }),
      db.app.findUnique({ where: { id: appId }, select: { id: true, slug: true, name: true } }),
    ]);
    if (!org || !app) {
      return NextResponse.json({ success: false, error: "Unknown organization or app" }, { status: 404 });
    }

    const existing = await db.orgAppAccess.findUnique({
      where: { orgId_appId: { orgId, appId } },
      select: { id: true, enabled: true, reason: true },
    });

    // Sparse storage: when toggling back to enabled (default), just delete the row.
    if (enabled === true) {
      if (existing) {
        await db.orgAppAccess.delete({ where: { id: existing.id } });
      }
      logAudit({
        orgId,
        actorId: auth.userId,
        action: "UPDATE",
        entityType: "TenantAppAccess",
        entityId: `${orgId}:${appId}`,
        newValues: JSON.stringify({ enabled: true, reason: null }),
        oldValues: existing ? JSON.stringify({ enabled: existing.enabled, reason: existing.reason }) : undefined,
      });
      return NextResponse.json({
        success: true,
        data: { appId, enabled: true, reason: null, updatedAt: new Date().toISOString() },
      });
    }

    // Blocking (enabled = false): upsert a sparse row.
    const row = await db.orgAppAccess.upsert({
      where: { orgId_appId: { orgId, appId } },
      update: { enabled: false, reason, updatedBy: auth.userId },
      create: { orgId, appId, enabled: false, reason, updatedBy: auth.userId },
      select: { id: true, enabled: true, reason: true, updatedAt: true },
    });

    logAudit({
      orgId,
      actorId: auth.userId,
      action: "UPDATE",
      entityType: "TenantAppAccess",
      entityId: `${orgId}:${appId}`,
      newValues: JSON.stringify({ enabled: false, reason }),
      oldValues: existing ? JSON.stringify({ enabled: existing.enabled, reason: existing.reason }) : undefined,
    });

    return NextResponse.json({
      success: true,
      data: { appId, enabled: row.enabled, reason: row.reason, updatedAt: row.updatedAt.toISOString() },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update organization app access";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
