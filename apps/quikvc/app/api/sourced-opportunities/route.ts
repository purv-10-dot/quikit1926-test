/**
 * Sourced opportunities — inbound deal flow before formal application.
 *
 *   GET  /api/sourced-opportunities[?status=new]
 *   POST /api/sourced-opportunities  — create one (manual)
 *   POST /api/sourced-opportunities  — create many via { items: [...] } (CSV)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { getVCRole, denyIfNotInRoles, ANALYST_ROLES } from "@/lib/rbac";

const itemSchema = z.object({
  startupName: z.string().min(2).max(200),
  contactName: z.string().max(200).optional(),
  contactEmail: z.string().email().optional().or(z.literal("").transform(() => undefined)),
  contactPhone: z.string().max(50).optional(),
  website: z.string().max(500).optional(),
  fundingAskLakhs: z.number().int().nonnegative().optional(),
  pitch: z.string().max(2000).optional(),
  source: z.enum(["manual", "csv", "email", "referral"]).optional(),
  notes: z.string().max(2000).optional(),
});

const postSchema = z.union([
  itemSchema,
  z.object({ items: z.array(itemSchema).min(1).max(500) }),
]);

export const GET = withTenantAuth(async ({ orgId }, req: NextRequest) => {
  const status = req.nextUrl.searchParams.get("status");
  const where: Record<string, string> = { orgId };
  if (status) where.status = status;

  const items = await db.vCSourcedOpportunity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { vertical: { select: { id: true, name: true } } },
    take: 200,
  });

  return NextResponse.json({
    success: true,
    data: items.map((i) => ({
      ...i,
      fundingAsk: i.fundingAsk?.toString() ?? null,
    })),
  });
});

export const POST = withTenantAuth(async ({ orgId, userId }, req: NextRequest) => {
  const denied = denyIfNotInRoles(await getVCRole(userId, orgId), ANALYST_ROLES);
  if (denied) return denied;

  const json = await req.json();
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const items = "items" in parsed.data ? parsed.data.items : [parsed.data];

  const created = await db.vCSourcedOpportunity.createMany({
    data: items.map((it) => ({
      orgId,
      source: it.source ?? "manual",
      startupName: it.startupName,
      contactName: it.contactName,
      contactEmail: it.contactEmail,
      contactPhone: it.contactPhone,
      website: it.website,
      pitch: it.pitch,
      notes: it.notes,
      fundingAsk: it.fundingAskLakhs
        ? BigInt(it.fundingAskLakhs) * BigInt(10_000_000)
        : null,
      createdBy: userId,
      updatedBy: userId,
    })),
  });

  return NextResponse.json({ success: true, data: { count: created.count } }, { status: 201 });
});
