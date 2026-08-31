import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { canEditWWW } from "@/lib/api/wwwPermissions";
import { deriveLifecycle, daysToClose } from "@/lib/services/wwwLifecycle";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("www", "WWW");

/**
 * GET /api/www/[id]/status-history
 *
 * The full lifecycle of one WWW item: every status transition in order, plus
 * the derived state today.
 *
 * This is what makes the requirement doc's WWW Review section answerable —
 * "what happened to the items created in previous meetings?" — from the
 * business record rather than from a transcript. Status is never inferred from
 * what somebody said in a meeting; it comes from here.
 *
 * Rows written before the application started recording transitions are marked
 * `source: "backfill"` and reconstructed from the audit trail, which is
 * best-effort. They are labelled so nobody mistakes reconstructed history for
 * recorded history.
 *
 * Unlike the sibling `audit` and `logs` routes, this checks the `WWW` resource
 * permission and the item's row-level visibility — history is item content, not
 * module metadata.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` section I.2.
 */
export const GET = auth.view<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const item = await db.wWWItem.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: {
        id: true,
        who: true,
        what: true,
        when: true,
        status: true,
        dueDateTBD: true,
        revisedDates: true,
        createdAt: true,
        createdBy: true,
        completedAt: true,
      },
    });
    if (!item) {
      return NextResponse.json(
        { success: false, error: "WWW item not found" },
        { status: 404 },
      );
    }

    // Row-level visibility: non-admins see only items they own or created.
    // Without this the history endpoint would be a way to read the content of
    // an item the same user cannot see in the list.
    const allowed = await canEditWWW(userId, orgId, {
      createdBy: item.createdBy,
      who: item.who,
    });
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const history = await db.wWWStatusHistory.findMany({
      where: { orgId, wwwItemId: params.id },
      orderBy: { changedAt: "asc" },
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        changedBy: true,
        changedAt: true,
        reason: true,
        source: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        item: { id: item.id, what: item.what, who: item.who, when: item.when },
        history,
        /**
         * Today's derived state. OVERDUE and CARRIED_FORWARD are computed, not
         * stored — see `wwwLifecycle.ts` for why storing them would need a
         * nightly job to stay truthful.
         */
        current: deriveLifecycle(item),
        daysToClose: daysToClose(item),
        /** True when any row was reconstructed rather than recorded live. */
        hasBackfilledRows: history.some((h) => h.source === "backfill"),
      },
    });
  },
  { fallbackErrorMessage: "Failed to load WWW status history" },
);
