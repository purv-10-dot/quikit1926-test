import Link from "next/link";
import { requireUser } from "@/lib/auth/require";
import { listSavedViewsWithCounts } from "@/lib/services/leads/saved-views";
import { LeadsTabBar } from "@/components/leads/leads-tab-bar";
import { PageHeader } from "@/components/shared/page-header";
import { ExportButton } from "@/components/reports/export-button";
import { Star } from "lucide-react";
import { Table, TableScroll, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDate } from "@/lib/utils/date-helpers";

export default async function LeadListsPage() {
  const user = await requireUser();
  const lists = await listSavedViewsWithCounts(user);

  return (
    <div>
      <PageHeader
        title="Leads"
        actions={<ExportButton apiPath="/api/leads" size="md" />}
      />
      <LeadsTabBar />
      <div className="crm-card p-2.5 sm:p-3 lg:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-crm-text">My lead lists</h2>
            <p className="mt-0.5 text-xs text-crm-muted">
              Saved filters from All Leads. Open a list to browse matching leads.
            </p>
          </div>
          <span className="text-sm text-crm-muted">{lists.length} list(s)</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-crm-border bg-white">
          <TableScroll minWidth={640} bleed={false}>
            <Table>
              <THead>
                <TR>
                  <TH className="w-8" />
                  <TH>Name</TH>
                  <TH className="text-right">Leads</TH>
                  <TH className="text-right" hideBelow="sm">
                    Conditions
                  </TH>
                  <TH hideBelow="md">Updated</TH>
                </TR>
              </THead>
              <TBody>
                {lists.length === 0 ? (
                  <TR>
                    <TD colSpan={5} className="py-12 text-center">
                      <p className="text-sm text-crm-muted">No lists yet.</p>
                      <p className="mt-1 text-xs text-crm-muted">
                        On{" "}
                        <Link href="/leads" className="crm-link font-medium">
                          All Leads
                        </Link>
                        , use <span className="font-medium text-crm-text">Advanced</span> →{" "}
                        <span className="font-medium text-crm-text">Save view</span>, or click{" "}
                        <span className="font-medium text-crm-text">+ New view</span>.
                      </p>
                    </TD>
                  </TR>
                ) : (
                  lists.map((l) => (
                    <TR key={l.id}>
                      <TD>
                        {l.isDefault && <Star size={14} className="fill-amber-400 text-amber-400" />}
                      </TD>
                      <TD>
                        <Link href={`/leads/lists/${l.id}`} className="crm-link font-medium">
                          {l.name}
                        </Link>
                        {l.isDefault && (
                          <span className="ml-2 rounded bg-crm-panel px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-crm-muted">
                            Default
                          </span>
                        )}
                      </TD>
                      <TD className="text-right tabular-nums">{l.leadCount}</TD>
                      <TD className="text-right tabular-nums" hideBelow="sm">
                        {l.conditionCount}
                      </TD>
                      <TD className="whitespace-nowrap text-crm-muted" hideBelow="md">
                        {formatDate(l.updatedAt)}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </TableScroll>
        </div>
      </div>
    </div>
  );
}
