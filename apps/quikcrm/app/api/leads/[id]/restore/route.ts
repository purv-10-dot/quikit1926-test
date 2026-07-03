import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { publishLeadEvent } from "@/lib/services/leads/realtime";
import { recordLeadChange } from "@/lib/services/leads/change-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/leads/[id]/restore
 *
 * Restores a soft-deleted lead by clearing `deletedAt`. Idempotent — restoring
 * an already-active lead returns 200 OK without writes. Permission required:
 * leads.delete (same gate as the soft-delete that put it in the trash —
 * symmetry, not separate "restore" capability).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "delete");

    const existing = await prisma.crmLead.findUnique({ where: { id } });
    if (!existing || existing.orgId !== user.orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertAccountAccess(user, existing.accountId, { recordOwnerId: existing.ownerId });

    if (!existing.deletedAt) {
      // Already active — idempotent success.
      return NextResponse.json({ ok: true, alreadyActive: true });
    }

    const restored = await prisma.crmLead.update({
      where: { id },
      data: { deletedAt: null },
    });
    await recordLeadChange({
      orgId: user.orgId,
      userId: user.userId,
      leadId: id,
      action: "RESTORE",
      before: existing as unknown as Record<string, unknown>,
      after: restored as unknown as Record<string, unknown>,
    });
    publishLeadEvent(user.orgId, {
      type: "updated",
      leadId: id,
      stage: restored.stage,
    }).catch(() => {});
    return NextResponse.json({ ok: true, lead: restored });
  } catch (e) {
    return errorResponse(e);
  }
}
