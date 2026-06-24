import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dailyHuddle");

/** POST /api/client-meetings/daily-huddles/bulk-restore — undo soft delete in bulk. */
export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((x: unknown) => typeof x === "string")
    : [];
  if (ids.length === 0) {
    return NextResponse.json(
      { success: false, error: "No ids provided" },
      { status: 400 },
    );
  }

  // Capture the rows that will actually be restored BEFORE updateMany.
  const targets = await db.clientDailyHuddle.findMany({
    where: { id: { in: ids }, orgId, deletedAt: { not: null } },
    select: { id: true, meetingDate: true, client: { select: { name: true } } },
  });

  const { count } = await db.clientDailyHuddle.updateMany({
    where: { id: { in: ids }, orgId, deletedAt: { not: null } },
    data: { deletedAt: null, updatedBy: userId },
  });
  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "RESTORE",
    entityType: "DailyHuddle",
    entityId: ids.join(","),
    newValues: { count, ids },
  });

  // ── Centralized audit (dual-write) ── one RESTORE event per huddle.
  const ctx = requestContext(req);
  for (const t of targets) {
    await audit.log({
      entityType: "DAILY_HUDDLE",
      entityId: t.id,
      action: "RESTORE",
      actor: { userId, orgId, teamId: null },
      snapshot: { name: `${t.client.name} · ${t.meetingDate.toISOString().slice(0, 10)}` },
      ...ctx,
    });
  }

  return NextResponse.json({ success: true, data: { restored: count } });
});
