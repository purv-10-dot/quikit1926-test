import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { publishLeadEvent } from "@/lib/services/leads/realtime";
import { recordLeadChange } from "@/lib/services/leads/change-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLE = "Administrator";

/**
 * DELETE /api/leads/[id]/permanent
 *
 * Hard-deletes a lead row and all FK-cascaded children (attachments, notes,
 * activities, tasks, call logs, SLA tracking). NO recovery after this.
 *
 * Restricted to Administrator role — soft-delete is the default destructive
 * action, this endpoint exists for compliance / cleanup of true junk records.
 *
 * Pre-condition: lead must already be soft-deleted (has `deletedAt`). This
 * forces a two-step destructive flow (Trash first, then permanent) so a
 * mis-click can't wipe live data.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    if (user.role !== ADMIN_ROLE) {
      return NextResponse.json(
        { error: "Permanent delete is restricted to administrators." },
        { status: 403 },
      );
    }

    const existing = await prisma.crmLead.findUnique({ where: { id } });
    if (!existing || existing.orgId !== user.orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!existing.deletedAt) {
      return NextResponse.json(
        {
          error:
            "Lead is not in trash. Move it to trash first, then permanent-delete.",
        },
        { status: 409 },
      );
    }

    await prisma.$transaction(async (tx) => {
      // Soft-orphan activities so the audit trail survives the parent delete.
      // The relatedOrphanedAt flag drives "(deleted)" rendering in the
      // unified Activities timeline.
      await tx.crmActivity.updateMany({
        where: {
          orgId: user.orgId,
          relatedObjectId: id,
          relatedKind: { in: ["Lead", "lead"] },
          relatedOrphanedAt: null,
        },
        data: { relatedOrphanedAt: new Date() },
      });
      await tx.crmLead.delete({ where: { id } });
    });
    await recordLeadChange({
      orgId: user.orgId,
      userId: user.userId,
      leadId: id,
      action: "PERMANENT_DELETE",
      before: existing as unknown as Record<string, unknown>,
      after: null,
    });
    publishLeadEvent(user.orgId, { type: "deleted", leadId: id }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
