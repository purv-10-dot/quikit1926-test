import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

export const GET = withOrgAuth(async ({ orgId, userId }) => {
  try {
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
