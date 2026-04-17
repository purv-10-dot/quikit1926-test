/**
 * SA-B.6 — Broadcast announcement (read / update / delete).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/requireSuperAdmin";
import { logAudit } from "@/lib/auditLog";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;
  const item = await db.broadcastAnnouncement.findUnique({ where: { id: params.id } });
  if (!item) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: item });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;

  try {
    const existing = await db.broadcastAnnouncement.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (typeof body.title === "string") updates.title = body.title.trim();
    if (typeof body.body === "string") updates.body = body.body;
    if (["info", "warning", "critical"].includes(body.severity)) updates.severity = body.severity;
    if (Array.isArray(body.targetTenantIds)) updates.targetTenantIds = body.targetTenantIds;
    if (Array.isArray(body.targetAppSlugs)) updates.targetAppSlugs = body.targetAppSlugs;
    if (body.startsAt) updates.startsAt = new Date(body.startsAt);
    if (body.endsAt === null) updates.endsAt = null;
    else if (body.endsAt) updates.endsAt = new Date(body.endsAt);

    const updated = await db.broadcastAnnouncement.update({ where: { id: params.id }, data: updates });

    logAudit({
      actorId: auth.userId,
      action: "UPDATE",
      entityType: "BroadcastAnnouncement",
      entityId: existing.id,
      newValues: JSON.stringify(updates),
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update broadcast";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;
  try {
    const existing = await db.broadcastAnnouncement.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    await db.broadcastAnnouncement.delete({ where: { id: params.id } });
    logAudit({
      actorId: auth.userId,
      action: "DELETE",
      entityType: "BroadcastAnnouncement",
      entityId: existing.id,
      oldValues: JSON.stringify({ title: existing.title }),
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete broadcast";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
