import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("people.feedback");

type Params = { id: string };

/**
 * DELETE /api/performance/feedback/:id
 *
 * Only the original SENDER can delete their own feedback entry. This
 * protects receivers from having feedback deleted out from under them
 * by the subject, while still letting senders retract something they
 * regret posting.
 */
export const DELETE = withTenantAuth<Params>(
  async ({ tenantId, userId }, _req, { params }) => {
    const existing = await db.feedbackEntry.findFirst({
      where: { id: params.id, tenantId, fromUserId: userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Feedback not found or not authored by you" },
        { status: 404 },
      );
    }

    await db.feedbackEntry.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true, message: "Feedback deleted" });
  },
  { fallbackErrorMessage: "Failed to delete feedback" },
);
