import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dailyHuddle");

/** POST /api/client-meetings/daily-huddles/[id]/restore — undo soft delete. */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, request, { params }) => {
  const existing = await db.clientDailyHuddle.findFirst({
    where: { id: params.id, orgId, deletedAt: { not: null } },
    include: { client: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Huddle not found in trash" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const reason =
    typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  await db.clientDailyHuddle.update({ where: { id: params.id }, data: { deletedAt: null, updatedBy: userId } });
  await writeAuditLog({
    orgId, actorId: userId, action: "RESTORE",
    entityType: "DailyHuddle", entityId: params.id,
    reason: reason ?? undefined,
  });

  // ── Centralized audit (dual-write) ── RESTORE event for the timeline.
  await audit.log({
    entityType: "DAILY_HUDDLE",
    entityId: params.id,
    action: "RESTORE",
    actor: { userId, orgId, teamId: null },
    reason,
    snapshot: { name: `${existing.client.name} · ${existing.meetingDate.toISOString().slice(0, 10)}` },
    ...requestContext(request),
  });

  return NextResponse.json({ success: true });
});
