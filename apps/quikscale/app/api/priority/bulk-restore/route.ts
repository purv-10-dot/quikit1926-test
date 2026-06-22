import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";
import { publishRealtime } from "@quikit/realtime/server";

const withOrgAuth = withOrgAuthForModule("priority");

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ success: false, error: "No ids provided" }, { status: 400 });
  }

  // Capture the rows that will actually be restored (currently soft-deleted)
  // BEFORE the updateMany, so the per-entity audit events name the right ones.
  const targets = await db.priority.findMany({
    where: { id: { in: ids }, orgId, deletedAt: { not: null } },
    select: { id: true, name: true, teamId: true },
  });

  const { count } = await db.priority.updateMany({
    where: { id: { in: ids }, orgId, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  await writeAuditLog({
    orgId, actorId: userId, action: "RESTORE",
    entityType: "Priority", entityId: ids.join(","), newValues: { count, ids },
  });

  // ── Centralized audit (dual-write) ── one RESTORE event per priority so each
  // entity's own Change History timeline reflects the restore.
  const ctx = requestContext(req);
  for (const t of targets) {
    await audit.log({
      entityType: "PRIORITY",
      entityId: t.id,
      action: "RESTORE",
      actor: { userId, orgId, teamId: t.teamId },
      snapshot: { name: t.name },
      ...ctx,
    });
    await publishRealtime({
      entity: "priority",
      action: "restored",
      id: t.id,
      orgId,
      teamId: t.teamId,
      actorUserId: userId,
    });
  }

  return NextResponse.json({ success: true, data: { restored: count } });
});
