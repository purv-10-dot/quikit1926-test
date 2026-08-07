/**
 * GET /api/accounts/health-summary — aggregate counts for a manager dashboard.
 * Returns: { red, amber, green, total, renewing30d, renewing90d, byStatus }.
 *
 * Filters: ?ownerId, ?segment (Enterprise|MidMarket|SMB), ?healthLt.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getScope } from "@/lib/auth/account-acl";
import { healthSummaryQuerySchema } from "@/lib/validators/account";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "accounts", "view");

    const { searchParams } = new URL(req.url);
    const parsed = healthSummaryQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { ownerId, segment, healthLt } = parsed.data;

    const scope = await getScope(user);

    const where: Prisma.QcfAccountWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
    };
    if (!scope.unrestricted) {
      if (scope.allowedAccountIds.length === 0) {
        return NextResponse.json({
          red: 0,
          amber: 0,
          green: 0,
          total: 0,
          renewing30d: 0,
          renewing90d: 0,
          byStatus: { Active: 0, Prospect: 0, Inactive: 0 },
        });
      }
      where.id = { in: scope.allowedAccountIds };
    }
    if (ownerId) where.ownerId = ownerId;
    if (segment) where.segmentEnum = segment;
    if (healthLt !== undefined) where.healthScore = { lt: healthLt };

    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const [
      total,
      red,
      amber,
      green,
      renewing30d,
      renewing90d,
      active,
      prospect,
      inactive,
    ] = await Promise.all([
      prisma.qcfAccount.count({ where }),
      prisma.qcfAccount.count({ where: { ...where, healthScore: { lt: 40 } } }),
      prisma.qcfAccount.count({ where: { ...where, healthScore: { gte: 40, lt: 70 } } }),
      prisma.qcfAccount.count({ where: { ...where, healthScore: { gte: 70 } } }),
      prisma.qcfAccount.count({ where: { ...where, renewalDate: { gte: now, lte: in30 } } }),
      prisma.qcfAccount.count({ where: { ...where, renewalDate: { gte: now, lte: in90 } } }),
      prisma.qcfAccount.count({ where: { ...where, status: "Active" } }),
      prisma.qcfAccount.count({ where: { ...where, status: "Prospect" } }),
      prisma.qcfAccount.count({ where: { ...where, status: "Inactive" } }),
    ]);

    return NextResponse.json({
      red,
      amber,
      green,
      total,
      renewing30d,
      renewing90d,
      byStatus: { Active: active, Prospect: prospect, Inactive: inactive },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
