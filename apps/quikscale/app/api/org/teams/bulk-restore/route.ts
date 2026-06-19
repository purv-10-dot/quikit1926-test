import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";

const withOrgAuth = withOrgAuthForModule("orgSetup.teams");

/** POST /api/org/teams/bulk-restore — undo soft delete in bulk. */
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
  // Find candidate trashed teams in scope.
  const trashed = await db.team.findMany({
    where: { id: { in: ids }, orgId, deletedAt: { not: null } },
    select: { id: true, name: true },
  });
  if (trashed.length === 0) {
    return NextResponse.json({ success: true, data: { restored: 0, skipped: [] } });
  }

  // Skip any trashed team whose name collides with an existing active team.
  // Restoring would silently create a duplicate-name pair, so report them
  // back to the user instead.
  const lowerNames = trashed.map((t) => t.name.toLowerCase());
  const collisions = await db.team.findMany({
    where: {
      orgId,
      deletedAt: null,
      name: { in: lowerNames, mode: "insensitive" },
    },
    select: { name: true },
  });
  const blockedNames = new Set(collisions.map((c) => c.name.toLowerCase()));
  const restorableIds = trashed
    .filter((t) => !blockedNames.has(t.name.toLowerCase()))
    .map((t) => t.id);
  const skipped = trashed
    .filter((t) => blockedNames.has(t.name.toLowerCase()))
    .map((t) => ({ id: t.id, name: t.name, reason: "name conflict" as const }));

  const { count } = restorableIds.length
    ? await db.team.updateMany({
        where: { id: { in: restorableIds }, orgId, deletedAt: { not: null } },
        data: { deletedAt: null },
      })
    : { count: 0 };

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "RESTORE",
    entityType: "Team",
    entityId: restorableIds.join(","),
    newValues: { count, restoredIds: restorableIds, skipped },
  });

  return NextResponse.json({
    success: true,
    data: { restored: count, skipped },
  });
}, { fallbackErrorMessage: "Failed to restore teams" });
