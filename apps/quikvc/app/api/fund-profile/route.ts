/**
 * Fund profile — single per-tenant config (IC rules, thesis, etc.).
 *
 *   GET /api/fund-profile
 *   PUT /api/fund-profile  body { fundName?, icVotingMode?, icQuorum?, ... }
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { FUND_ADMIN_ROLES, requireRoleOrAudit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const putSchema = z.object({
  fundName: z.string().min(2).max(120).optional(),
  currency: z.string().length(3).optional(),
  icVotingMode: z.enum(["single", "multi"]).optional(),
  icQuorum: z.number().int().min(1).max(20).optional(),
  icThreshold: z.enum(["simple-majority", "two-thirds", "unanimous"]).optional(),
  icVisibility: z.enum(["open", "anonymous"]).optional(),
  thesis: z.string().max(5000).optional(),
  dailyBriefHour: z.number().int().min(0).max(23).optional(),
});

export const GET = withTenantAuth(async ({ tenantId }) => {
  const profile = await db.vCFundProfile.findUnique({
    where: { tenantId },
  });
  return NextResponse.json({ success: true, data: profile });
});

export const PUT = withTenantAuth(async ({ tenantId, userId }, req: NextRequest) => {
  const denied = await requireRoleOrAudit(userId, tenantId, FUND_ADMIN_ROLES, {
    action: "fund-profile.update",
    req,
  });
  if (denied) return denied;

  const parsed = putSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const profile = await db.vCFundProfile.upsert({
    where: { tenantId },
    update: { ...parsed.data, updatedBy: userId },
    create: {
      tenantId,
      fundName: parsed.data.fundName ?? "Fund I",
      ...parsed.data,
      createdBy: userId,
      updatedBy: userId,
    },
  });

  await audit({
    tenantId,
    userId,
    action: "fund-profile.update",
    metadata: { keys: Object.keys(parsed.data) },
    req,
  });

  return NextResponse.json({ success: true, data: profile });
});
