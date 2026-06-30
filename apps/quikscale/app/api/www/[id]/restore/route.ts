import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";

const withOrgAuth = withOrgAuthForModule("www");

export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
  }

  const existing = await db.wWWItem.findFirst({ where: { id, orgId } });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (existing.deletedAt == null) {
    return NextResponse.json({ success: true, message: "Already active" });
  }

  // Optional (never required) reason — shown in the timeline if provided.
  const body = await req.json().catch(() => ({}));
  const reason =
    typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  const restored = await db.wWWItem.update({
    where: { id },
    data: { deletedAt: null },
    select: { id: true, what: true, deletedAt: true },
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "RESTORE",
    entityType: "WWWItem",
    entityId: id,
    newValues: restored,
    reason: reason ?? undefined,
  });

  // ── Centralized audit (dual-write) ── RESTORE event for the timeline.
  await audit.log({
    entityType: "WWW",
    entityId: id,
    action: "RESTORE",
    actor: { userId, orgId, teamId: null },
    reason,
    snapshot: { name: existing.what },
    ...requestContext(req),
  });

  return NextResponse.json({ success: true, data: restored });
});
