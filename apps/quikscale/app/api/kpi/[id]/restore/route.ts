import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";

const withOrgAuth = withOrgAuthForModule("kpi");

// POST /api/kpi/[id]/restore — unset deletedAt, bring row back into active set.
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
  }

  const existing = await db.kPI.findFirst({ where: { id, orgId } });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (existing.deletedAt == null) {
    return NextResponse.json({ success: true, message: "Already active" });
  }

  const restored = await db.kPI.update({
    where: { id },
    data: { deletedAt: null },
    select: { id: true, name: true, deletedAt: true },
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "RESTORE",
    entityType: "KPI",
    entityId: id,
    newValues: restored,
  });

  // ── Centralized audit (dual-write) ──
  await audit.log({
    entityType: "KPI",
    entityId: id,
    action: "RESTORE",
    actor: { userId, orgId, teamId: existing.teamId },
    snapshot: { name: existing.name },
    ...requestContext(req),
  });

  return NextResponse.json({ success: true, data: restored });
});
