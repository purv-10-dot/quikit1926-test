import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";

const withOrgAuth = withOrgAuthForModule("www");

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ success: false, error: "No ids provided" }, { status: 400 });
  }

  // Capture the rows that will actually be restored BEFORE updateMany so the
  // per-entity audit events name the right ones.
  const targets = await db.wWWItem.findMany({
    where: { id: { in: ids }, orgId, deletedAt: { not: null } },
    select: { id: true, what: true },
  });

  const { count } = await db.wWWItem.updateMany({
    where: { id: { in: ids }, orgId, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  await writeAuditLog({
    orgId, actorId: userId, action: "RESTORE",
    entityType: "WWWItem", entityId: ids.join(","), newValues: { count, ids },
  });

  // ── Centralized audit (dual-write) ── one RESTORE event per item so each
  // entity's own Change History timeline reflects the restore.
  const ctx = requestContext(req);
  for (const t of targets) {
    await audit.log({
      entityType: "WWW",
      entityId: t.id,
      action: "RESTORE",
      actor: { userId, orgId, teamId: null },
      snapshot: { name: t.what },
      ...ctx,
    });
  }

  return NextResponse.json({ success: true, data: { restored: count } });
});
