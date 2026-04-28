/**
 * POST /api/memos/[id]/freeze — flip memo status from "draft" → "frozen".
 *
 * Frozen memos are immutable; the IC review screen renders the frozen
 * version's sections as the canonical artifact. To make further edits,
 * unfreeze (admin-only — Sprint 4) or create a fresh draft.
 *
 * Where [id] = dealId. Memo is 1:1 with deal.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { notifyRole } from "@/lib/notifications";
import { ANALYST_ROLES, requireRoleOrAudit } from "@/lib/rbac";

export const POST = withTenantAuth(
  async ({ tenantId, userId }, req: NextRequest, { params }: { params: { id: string } }) => {
    const denied = await requireRoleOrAudit(userId, tenantId, ANALYST_ROLES, {
      action: "deal.advance",
      resource: params.id,
      req,
    });
    if (denied) return denied;

    const dealId = params.id;
    const memo = await db.vCICMemo.findUnique({ where: { dealId } });
    if (!memo || memo.tenantId !== tenantId) {
      return NextResponse.json({ success: false, error: "Memo not found" }, { status: 404 });
    }
    if (!memo.currentVersionId) {
      return NextResponse.json(
        { success: false, error: "Save at least one version before freezing" },
        { status: 409 },
      );
    }
    if (memo.status === "frozen") {
      return NextResponse.json(
        { success: false, error: "Memo is already frozen" },
        { status: 409 },
      );
    }

    await db.$transaction([
      db.vCICMemo.update({
        where: { id: memo.id },
        data: { status: "frozen", updatedBy: userId },
      }),
      db.vCTimelineEvent.create({
        data: {
          tenantId,
          dealId,
          type: "memo-frozen",
          actorId: userId,
          summary: `IC memo frozen for review`,
          visibility: "internal",
        },
      }),
    ]);

    // Notify IC voters that a memo is ready for review
    await Promise.all([
      notifyRole(tenantId, "partner", {
        type: "memo-frozen",
        title: "IC memo frozen for review",
        body: "A new memo is ready for your IC vote.",
        href: `/deals/${dealId}/ic`,
      }),
      notifyRole(tenantId, "ic-member", {
        type: "memo-frozen",
        title: "IC memo frozen for review",
        body: "A new memo is ready for your IC vote.",
        href: `/deals/${dealId}/ic`,
      }),
    ]);

    return NextResponse.json({ success: true, data: { status: "frozen" } });
  },
);
