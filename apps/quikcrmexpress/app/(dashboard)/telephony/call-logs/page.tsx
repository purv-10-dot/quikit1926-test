import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { ExportButton } from "@/components/reports/export-button";

export default async function CallLogsPage() {
  const user = await requireUser();
  const items = await prisma.qceCallLog.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <div>
      <PageHeader
        title="Call Logs"
        subtitle={`${items.length} recent`}
        actions={<ExportButton apiPath="/api/telephony/call-logs" size="md" />}
      />
      <div className="crm-card overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Call SID</TH>
              <TH>Direction</TH>
              <TH>From</TH>
              <TH>To</TH>
              <TH>Status</TH>
              <TH className="text-right">Duration</TH>
              <TH>Started</TH>
            </TR>
          </THead>
          <TBody>
            {items.length === 0 ? (
              <TR><TD colSpan={7} className="py-8 text-center text-crm-muted">No calls yet.</TD></TR>
            ) : (
              items.map((c) => (
                <TR key={c.id}>
                  <TD className="font-mono text-xs">{c.callSid?.slice(0, 12) || "—"}</TD>
                  <TD>{c.direction || "—"}</TD>
                  <TD>{c.sourceNumber || "—"}</TD>
                  <TD>{c.destinationNumber || "—"}</TD>
                  <TD>{c.status || "—"}</TD>
                  <TD className="text-right">{c.durationSec ? `${c.durationSec}s` : "—"}</TD>
                  <TD>{c.startTime ? new Date(c.startTime).toLocaleString() : "—"}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
