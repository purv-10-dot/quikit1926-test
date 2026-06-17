import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableScroll, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PageContainer } from "@/components/ui/container";
import { PageHeader } from "@/components/shared/page-header";
import { ImportUploader } from "@/components/imports/file-uploader";
import { LeadsImportSampleDownload } from "@/components/leads/leads-import-sample-download";
import { formatDateTime } from "@/lib/utils/date-helpers";

export default async function ImportsPage() {
  const user = await requireUser();
  const jobs = await prisma.crmLeadImportJob.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return (
    <PageContainer size="wide">
      <div className="space-y-4">
        <PageHeader title="Imports" subtitle="Async lead/activity/workflow imports via BullMQ" />
        <Card>
          <CardHeader>
            <CardTitle>Upload</CardTitle>
          </CardHeader>
          <CardBody>
            <ImportUploader />
            <p className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2 text-xs text-crm-muted">
              <span>
                CSV columns: name (required), email, phone, mobile, company, jobTitle, source,
                externalId, sourceSystem, ownerName.
              </span>
              <LeadsImportSampleDownload className="inline-flex items-center gap-1 font-medium text-accent-700 hover:text-accent-800 hover:underline" />
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent jobs</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <TableScroll minWidth={760} bleed={false}>
              <Table>
                <THead>
                  <TR>
                    <TH>File</TH>
                    <TH hideBelow="md">Type</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Rows</TH>
                    <TH hideBelow="md" className="text-right">
                      Imported
                    </TH>
                    <TH hideBelow="lg" className="text-right">
                      Attempts
                    </TH>
                    <TH hideBelow="md">Queued</TH>
                  </TR>
                </THead>
                <TBody>
                  {jobs.length === 0 ? (
                    <TR>
                      <TD colSpan={7} className="py-8 text-center text-crm-muted">
                        No import jobs.
                      </TD>
                    </TR>
                  ) : (
                    jobs.map((j) => (
                      <TR key={j.id}>
                        <TD>
                          <span className="block max-w-[200px] truncate sm:max-w-none">
                            {j.fileName || "—"}
                          </span>
                          {/* `<md` drops Type/Imported/Queued → keep Type visible inline. */}
                          <div className="text-xs text-crm-muted md:hidden">
                            {j.entityType}
                          </div>
                        </TD>
                        <TD hideBelow="md">{j.entityType}</TD>
                        <TD>
                          <span className={statusClass(j.status)}>{j.status}</span>
                        </TD>
                        <TD className="text-right tabular-nums">{j.totalRows}</TD>
                        <TD hideBelow="md" className="text-right tabular-nums">
                          {j.importedCount}
                        </TD>
                        <TD hideBelow="lg" className="text-right tabular-nums">
                          {j.attempts}
                        </TD>
                        <TD hideBelow="md" className="whitespace-nowrap text-xs text-crm-muted">
                          {j.queuedAt ? formatDateTime(j.queuedAt) : "—"}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </TableScroll>
          </CardBody>
        </Card>
      </div>
    </PageContainer>
  );
}

function statusClass(status: string) {
  const base = "rounded-full px-2 py-0.5 text-xs whitespace-nowrap ";
  if (status === "completed") return base + "bg-emerald-100 text-emerald-700";
  if (status === "completed_with_errors") return base + "bg-amber-100 text-amber-700";
  if (status === "dead_letter") return base + "bg-red-100 text-red-700";
  if (status === "processing") return base + "bg-crm-blue-soft text-crm-blue-dark";
  return base + "bg-slate-100 text-slate-700";
}
