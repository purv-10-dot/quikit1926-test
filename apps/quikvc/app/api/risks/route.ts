import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const postSchema = z.object({
  dealId: z.string().min(1),
  severity: z.enum(["red", "amber", "green"]),
  title: z.string().min(3).max(200),
  description: z.string().max(4000).optional(),
  mitigation: z.string().max(4000).optional(),
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
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

  const signal = await db.vCDealSignal.create({
    data: {
      orgId,
      dealId: data.dealId,
      severity: data.severity,
      source: "manual",
      title: data.title,
      description: data.description ?? null,
      mitigation: data.mitigation ?? null,
      ownerId: userId,
      createdBy: userId,
      updatedBy: userId,
    },
    select: { id: true, severity: true, title: true, status: true },
  });

  await db.vCTimelineEvent.create({
    data: {
      orgId,
      dealId: data.dealId,
      type: "risk-added",
      actorId: userId,
      summary: `Risk: [${data.severity.toUpperCase()}] ${data.title}`,
      visibility: "internal",
    },
  });

  return NextResponse.json({ success: true, data: signal }, { status: 201 });
});
