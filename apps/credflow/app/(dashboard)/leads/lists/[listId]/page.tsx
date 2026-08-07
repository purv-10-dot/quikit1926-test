import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import { maskHiddenLeadFields } from "@/lib/auth/permissions";
import { translateFilterToPrismaWhere } from "@/lib/services/leads/filter-engine";
import { filterPayloadSchema } from "@/lib/validators/lead-filter";
import { listCustomFields } from "@/lib/services/fields/repo";
import { LeadsTabBar } from "@/components/leads/leads-tab-bar";
import { PageHeader } from "@/components/shared/page-header";
import { ExportButton } from "@/components/reports/export-button";
import { LeadTable } from "@/components/leads/lead-table";

export default async function LeadListDetailPage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params;
  const user = await requireUser();
  const list = await prisma.qcfLeadListView.findFirst({
    where: { id: listId, orgId: user.orgId, userId: user.userId },
  });
  if (!list) notFound();
  const parsed = filterPayloadSchema.safeParse(list.filters);
  const customDefs = await listCustomFields(user.orgId);
  const filterWhere = parsed.success ? translateFilterToPrismaWhere(parsed.data, customDefs) : {};
  const acl = await accountScopeFilter(user);
  const baseAnd: Record<string, unknown>[] = [{ orgId: user.orgId }];
  if (Object.keys(filterWhere).length > 0) baseAnd.push(filterWhere);
  if (acl) baseAnd.push(acl);
  const where = { AND: baseAnd };
  const [items, total] = await Promise.all([
    prisma.qcfLead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        company: true,
        stage: true,
        status: true,
        score: true,
        ownerName: true,
        isStarred: true,
      },
    }),
    prisma.qcfLead.count({ where }),
  ]);
  const masked = await Promise.all(items.map((l) => maskHiddenLeadFields(user, l)));

  return (
    <div>
      <PageHeader
        title="Leads"
        actions={<ExportButton apiPath="/api/leads" size="md" />}
      />
      <LeadsTabBar />
      <Link
        href="/leads/lists"
        className="mb-3 inline-flex items-center gap-1 text-sm text-crm-blue hover:underline"
      >
        <ChevronLeft size={14} /> All lists
      </Link>
      <div className="crm-card p-2.5 sm:p-3 lg:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-crm-text">{list.name}</h2>
          <span className="text-sm text-crm-muted">{total} lead(s)</span>
        </div>
        <LeadTable items={masked} total={total} page={1} pageSize={25} />
      </div>
    </div>
  );
}
