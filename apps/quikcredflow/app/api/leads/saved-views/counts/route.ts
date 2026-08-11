import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import { ownerScopeFilter } from "@/lib/auth/owner-scope";
import { translateFilterToPrismaWhere } from "@/lib/services/leads/filter-engine";
import { filterPayloadSchema } from "@/lib/validators/lead-filter";
import { listCustomFields } from "@/lib/services/fields/repo";

export const runtime = "nodejs";

/**
 * GET /api/leads/saved-views/counts
 * Returns: { counts: { [viewId]: number } }
 *
 * Runs each saved view's filter against the user's lead scope and reports the
 * matching row count. Done in parallel with bounded concurrency (Promise.all).
 *
 * Parity: legacy GET /leads/saved-views/counts.
 */
export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const views = await prisma.qcfLeadListView.findMany({
      where: { orgId: user.orgId, userId: user.userId },
      select: { id: true, filters: true },
    });
    const acl = await accountScopeFilter(user);
    const ownerScope = await ownerScopeFilter(user);
    const customDefs = await listCustomFields(user.orgId);

    const entries = await Promise.all(
      views.map(async (v) => {
        const parsed = filterPayloadSchema.safeParse(v.filters);
        if (!parsed.success) return [v.id, 0] as const;
        const filterWhere = translateFilterToPrismaWhere(parsed.data, customDefs);
        const baseAnd: Record<string, unknown>[] = [{ orgId: user.orgId }];
        if (Object.keys(filterWhere).length > 0) baseAnd.push(filterWhere);
        if (acl) baseAnd.push(acl);
        if (ownerScope) baseAnd.push(ownerScope);
        const count = await prisma.qcfLead.count({ where: { AND: baseAnd } });
        return [v.id, count] as const;
      }),
    );
    const counts = Object.fromEntries(entries);
    return NextResponse.json({ counts });
  } catch (e) {
    return errorResponse(e);
  }
}
