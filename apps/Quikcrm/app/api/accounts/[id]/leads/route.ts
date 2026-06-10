/**
 * GET /api/accounts/[id]/leads — paginated leads on this account.
 * Replaces the React detail page's `?accountId=…` filter on /api/leads with a
 * dedicated nested route, simpler to ACL-gate and easier to mock in tests.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "accounts", "view");
    await assertModule(user, "leads", "view");
    await assertAccountAccess(user, id);

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 100)));

    const where: Prisma.CrmLeadWhereInput = {
      orgId: user.orgId,
      accountId: id,
      deletedAt: null,
    };

    const [items, total] = await Promise.all([
      prisma.crmLead.findMany({
        where,
        select: {
          id: true,
          name: true,
          stage: true,
          status: true,
          ownerId: true,
          ownerName: true,
          email: true,
          phone: true,
          mobile: true,
          score: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.crmLead.count({ where }),
    ]);

    return NextResponse.json({
      items: items.map((l) => ({
        id: l.id,
        name: l.name,
        stage: l.stage,
        status: l.status,
        owner: l.ownerName ?? "",
        ownerId: l.ownerId,
        email: l.email,
        phone: l.phone,
        mobile: l.mobile,
        score: l.score,
      })),
      total,
      page,
      limit,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
