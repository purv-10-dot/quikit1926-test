import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { writeAuditLog } from "@/lib/api/auditLog";

/** POST /api/client-meetings/clients/[id]/restore — admin-only; undoes soft-delete. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { tenantId, userId } = auth as { tenantId: string; userId: string };

  const existing = await db.client.findFirst({
    where: { id: params.id, tenantId, deletedAt: { not: null } },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Client not found in trash" }, { status: 404 });

  await db.client.update({ where: { id: params.id }, data: { deletedAt: null, updatedBy: userId } });
  await writeAuditLog({
    tenantId, actorId: userId, action: "RESTORE",
    entityType: "Client", entityId: params.id,
    newValues: { name: existing.name },
  });
  return NextResponse.json({ success: true });
}
