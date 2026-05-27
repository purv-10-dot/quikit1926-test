import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      ids?: string[];
      all?: boolean;
      tab?: "direct" | "watching";
    };

    const where = {
      orgId,
      recipientId: userId,
      isRead: false,
      ...(body.all
        ? body.tab
          ? { tab: body.tab }
          : {}
        : { id: { in: Array.isArray(body.ids) ? body.ids : [] } }),
    };

    if (!body.all && (!Array.isArray(body.ids) || body.ids.length === 0)) {
      return NextResponse.json({ success: false, error: "ids[] or all=true is required" }, { status: 400 });
    }

    const result = await db.qtNotification.updateMany({
      where,
      data: { isRead: true, readAt: new Date() },
    });

    return NextResponse.json({ success: true, data: { updated: result.count } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
