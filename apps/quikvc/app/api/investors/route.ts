/**
 * Investor CRUD endpoints.
 *
 *   GET  /api/investors  — list per tenant
 *   POST /api/investors  — create
 *
 * Per-investor detail/update is handled at /api/investors/[id].
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { getVCRole, denyIfNotInRoles, FUND_ADMIN_ROLES } from "@/lib/rbac";

const postSchema = z.object({
  name: z.string().min(2).max(200),
  type: z.enum(["lp", "hni", "angel"]).default("lp"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  accountClass: z.string().max(80).optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
});

export const GET = withTenantAuth(async ({ orgId }) => {
  const investors = await db.vCInvestor.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, type: true, kycStatus: true,
      email: true, phone: true, createdAt: true,
      _count: { select: { commitments: true, allocations: true } },
    },
  });
  return NextResponse.json({ success: true, data: investors });
});

export const POST = withTenantAuth(async ({ orgId, userId }, req: NextRequest) => {
  const denied = denyIfNotInRoles(await getVCRole(userId, orgId), FUND_ADMIN_ROLES);
  if (denied) return denied;

  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const investor = await db.vCInvestor.create({
    data: {
      orgId,
      name: data.name,
      type: data.type,
      email: data.email || null,
      phone: data.phone || null,
      accountClass: data.accountClass || null,
      notes: data.notes ?? null,
      createdBy: userId,
      updatedBy: userId,
    },
    select: { id: true, name: true, type: true, kycStatus: true },
  });
  return NextResponse.json({ success: true, data: investor }, { status: 201 });
});
