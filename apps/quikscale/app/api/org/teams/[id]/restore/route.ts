import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";

const withOrgAuth = withOrgAuthForModule("orgSetup.teams");

/** POST /api/org/teams/[id]/restore — undo soft delete. */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const existing = await db.qsTeam.findFirst({
    where: { id: params.id, orgId, deletedAt: { not: null } },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Team not found in trash" },
      { status: 404 },
    );
  }
  // Restoring a team that shares a name with an active team would create a
  // duplicate. Block the restore with a clear message instead of silently
  // succeeding into a broken state.
  const nameClash = await db.qsTeam.findFirst({
    where: {
      orgId,
      deletedAt: null,
      name: { equals: existing.name, mode: "insensitive" },
      id: { not: existing.id },
    },
    select: { id: true },
  });
  if (nameClash) {
    return NextResponse.json(
      {
        success: false,
        error: `Another active team is already named "${existing.name}". Rename it first, then restore.`,
      },
      { status: 409 },
    );
  }
  await db.qsTeam.update({
    where: { id: params.id },
    data: { deletedAt: null },
  });
  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "RESTORE",
    entityType: "Team",
    entityId: params.id,
  });
  return NextResponse.json({ success: true });
}, { fallbackErrorMessage: "Failed to restore team" });
