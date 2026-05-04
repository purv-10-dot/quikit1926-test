import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const postSchema = z.object({
  dealId: z.string().min(1),
  name: z.string().min(1).max(200),
  sector: z.string().max(120).optional(),
  reason: z.string().max(2000).optional(),
  link: z.string().url().or(z.literal("")).optional(),
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

  const comp = await db.vCComparableCompany.create({
    data: {
      orgId,
      dealId: data.dealId,
      name: data.name,
      sector: data.sector ?? null,
      reason: data.reason ?? null,
      link: data.link || null,
      source: "manual",
      createdBy: userId,
      updatedBy: userId,
    },
    select: { id: true, name: true, sector: true, source: true },
  });

  return NextResponse.json({ success: true, data: comp }, { status: 201 });
});
