import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import { maskHiddenLeadFields } from "@/lib/auth/permissions";
import { translateFilterToPrismaWhere } from "@/lib/services/leads/filter-engine";
import { filterPayloadSchema } from "@/lib/validators/lead-filter";

export const runtime = "nodejs";

/**
 * GET /api/lead-lists/:id/leads
 *   Materializes the saved list's filter and returns the matching leads.
 *   Same response shape as POST /api/leads/filter.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const list = await prisma.crmLeadSavedList.findFirst({
      where: { id, tenantId: user.tenantId, userId: user.userId },
    });
    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const filterParsed = filterPayloadSchema.safeParse(list.filters);
    if (!filterParsed.success) {
      return NextResponse.json({ error: "Saved list has malformed filters" }, { status: 422 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? "25")));

    const filterWhere = translateFilterToPrismaWhere(filterParsed.data);
    const acl = await accountScopeFilter(user);
    const baseAnd: Record<string, unknown>[] = [{ tenantId: user.tenantId }];
    if (Object.keys(filterWhere).length > 0) baseAnd.push(filterWhere);
    if (acl) baseAnd.push(acl);
    const where = { AND: baseAnd };

    const [items, total] = await Promise.all([
      prisma.crmLead.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.crmLead.count({ where }),
    ]);
    const masked = await Promise.all(items.map((l) => maskHiddenLeadFields(user, l)));
    return NextResponse.json({
      list: { id: list.id, name: list.name, filter: list.filters },
      items: masked,
      total,
      page,
      pageSize,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
