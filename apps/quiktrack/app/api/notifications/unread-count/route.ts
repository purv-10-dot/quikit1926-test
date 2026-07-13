import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { materializeDueChecklistReminders } from "@/lib/checklist/queries";

export const GET = withOrgAuth(async ({ orgId, userId }) => {
  try {
    // Turn any now-due personal-checklist items into in-app notifications before
    // counting, so the bell surfaces them on the poll the client already runs.
    // Best-effort: never let a reminder hiccup break the unread count.
    try {
      await materializeDueChecklistReminders(orgId, userId);
    } catch {
      /* ignore — the count below still returns */
    }

    const [direct, watching] = await Promise.all([
      db.qtNotification.count({ where: { orgId, recipientId: userId, tab: "direct", isRead: false } }),
      db.qtNotification.count({ where: { orgId, recipientId: userId, tab: "watching", isRead: false } }),
    ]);
    return NextResponse.json({
      success: true,
      data: { direct, watching, total: direct + watching },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
