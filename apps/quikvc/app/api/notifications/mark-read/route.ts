/**
 * Mark notifications read.
 *
 *   POST /api/notifications/mark-read       — mark all as read
 *   POST /api/notifications/mark-read  body { ids: string[] } — mark specific
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const bodySchema = z.object({
  ids: z.array(z.string()).optional(),
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  let ids: string[] | undefined;
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (parsed.success) ids = parsed.data.ids;
  } catch {
    // Empty body is fine — mark all read
  }

  const now = new Date();
  const where = ids && ids.length
    ? { orgId, userId, id: { in: ids }, readAt: null }
    : { orgId, userId, readAt: null };

  const result = await db.vCNotification.updateMany({
    where,
    data: { readAt: now },
  });

  return NextResponse.json({ success: true, data: { updated: result.count } });
});
