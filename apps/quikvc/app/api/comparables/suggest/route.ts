/**
 * POST /api/comparables/suggest
 *
 * Body: { dealId }
 * Calls Claude → returns 3-5 candidate comparables. Does NOT auto-insert
 * them; the analyst reviews and individually adds via /api/comparables.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { suggestComparables } from "@/lib/ai/prompts/suggest-comparables";

const bodySchema = z.object({ dealId: z.string().min(1) });

export const POST = withTenantAuth(async ({ orgId }, req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Missing dealId" }, { status: 400 });
  }

  const deal = await db.vCDeal.findFirst({
    where: { id: parsed.data.dealId, orgId },
    select: {
      vertical: { select: { name: true } },
      application: { select: { startupName: true, description: true } },
    },
  });
  if (!deal) {
    return NextResponse.json({ success: false, error: "Deal not found" }, { status: 404 });
  }

  const { comps, isStub } = await suggestComparables({
    startupName: deal.application.startupName,
    description: deal.application.description ?? "",
    sector: deal.vertical.name,
  });

  return NextResponse.json({ success: true, data: { comps, isStub } });
});
