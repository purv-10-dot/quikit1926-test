/**
 * POST /api/meetings — schedule a new meeting against a deal
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";

const postSchema = z.object({
  dealId: z.string().min(1),
  title: z.string().min(2).max(200),
  type: z.enum(["discovery-call", "partner-meeting", "ic-review", "follow-up"]).default("discovery-call"),
  scheduledAt: z.string().datetime().optional(),
  meetingUrl: z.string().url().or(z.literal("")).optional(),
  agenda: z.string().max(4000).optional(),
});

export const POST = withTenantAuth(async ({ orgId, userId }, req: NextRequest) => {
  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const deal = await db.vCDeal.findFirst({ where: { id: data.dealId, orgId } });
  if (!deal) return NextResponse.json({ success: false, error: "Deal not found" }, { status: 404 });

  const meeting = await db.vCMeeting.create({
    data: {
      orgId,
      dealId: data.dealId,
      title: data.title,
      type: data.type,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      meetingUrl: data.meetingUrl || null,
      agenda: data.agenda ?? null,
      status: data.scheduledAt ? "scheduled" : "scheduled",
      createdBy: userId,
      updatedBy: userId,
    },
    select: { id: true, title: true, type: true, status: true, scheduledAt: true },
  });

  await db.vCTimelineEvent.create({
    data: {
      orgId,
      dealId: data.dealId,
      type: "meeting-scheduled",
      actorId: userId,
      summary: `Meeting scheduled: ${data.title}`,
      visibility: "internal",
    },
  });

  return NextResponse.json({ success: true, data: meeting }, { status: 201 });
});
