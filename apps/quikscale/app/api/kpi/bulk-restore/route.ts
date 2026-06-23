import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";

const withOrgAuth = withOrgAuthForModule("kpi");

// POST /api/kpi/bulk-restore  body: { ids: string[] }
export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ success: false, error: "No ids provided" }, { status: 400 });
  }

  const { count } = await db.kPI.updateMany({
    where: { id: { in: ids }, orgId, deletedAt: { not: null } },
    data: { deletedAt: null },
  });

  await writeAuditLog({
    orgId, actorId: userId, action: "RESTORE",
    entityType: "KPI", entityId: ids.join(","), newValues: { count, ids },
  });

  // ── Centralized audit (dual-write) ── one RESTORE event per KPI so each
  // restored KPI's timeline reflects it (vs the legacy comma-joined entityId).
  const restoredRows = await db.kPI.findMany({
    where: { id: { in: ids }, orgId },
    select: { id: true, name: true, teamId: true },
  });
  const ctx = requestContext(req);
  for (const row of restoredRows) {
    await audit.log({
      entityType: "KPI",
      entityId: row.id,
      action: "RESTORE",
      actor: { userId, orgId, teamId: row.teamId },
      snapshot: { name: row.name },
      ...ctx,
    });
  }

  return NextResponse.json({ success: true, data: { restored: count } });
});
