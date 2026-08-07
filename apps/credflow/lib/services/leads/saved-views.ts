import { prisma } from "@/lib/db/prisma";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import { translateFilterToPrismaWhere } from "@/lib/services/leads/filter-engine";
import { filterPayloadSchema } from "@/lib/validators/lead-filter";
import { listCustomFields } from "@/lib/services/fields/repo";
import type { SessionUser } from "@/types/permission";
import type { FilterPayload } from "@/types/lead-filter";

export type SavedViewRow = {
  id: string;
  name: string;
  filters: FilterPayload;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  leadCount: number;
  conditionCount: number;
};

/** Saved lead views for the Lists tab (same records as /api/leads/saved-views). */
export async function listSavedViewsWithCounts(user: SessionUser): Promise<SavedViewRow[]> {
  const views = await prisma.qcfLeadListView.findMany({
    where: { tenantId: user.tenantId, userId: user.userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  const acl = await accountScopeFilter(user);
  const customDefs = await listCustomFields(user.tenantId);

  const rows = await Promise.all(
    views.map(async (v) => {
      const parsed = filterPayloadSchema.safeParse(v.filters);
      const filters = parsed.success ? parsed.data : { matchMode: "ALL" as const, conditions: [] };
      let leadCount = 0;
      if (parsed.success) {
        const filterWhere = translateFilterToPrismaWhere(parsed.data, customDefs);
        const baseAnd: Record<string, unknown>[] = [{ tenantId: user.tenantId }];
        if (Object.keys(filterWhere).length > 0) baseAnd.push(filterWhere);
        if (acl) baseAnd.push(acl);
        leadCount = await prisma.qcfLead.count({ where: { AND: baseAnd } });
      }
      return {
        id: v.id,
        name: v.name,
        filters,
        isDefault: v.isDefault,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
        leadCount,
        conditionCount: filters.conditions?.length ?? 0,
      };
    }),
  );
  return rows;
}
