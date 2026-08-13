import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";

export default async function DispositionsPage() {
  const user = await requireUser();
  const items = await prisma.qceCallDisposition.findMany({
    where: { orgId: user.orgId },
    orderBy: { code: "asc" },
  });
  return (
    <div>
      <PageHeader title="Call Dispositions" subtitle="Configure outcomes for call logs" />
      <div className="crm-card overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Label</TH>
              <TH>Category</TH>
              <TH>Triggers Payment</TH>
            </TR>
          </THead>
          <TBody>
            {items.length === 0 ? (
              <TR><TD colSpan={4} className="py-8 text-center text-crm-muted">No dispositions configured.</TD></TR>
            ) : (
              items.map((d) => (
                <TR key={d.id}>
                  <TD className="font-mono text-xs">{d.code}</TD>
                  <TD className="font-medium">{d.label}</TD>
                  <TD>{d.category || "—"}</TD>
                  <TD>{d.triggersPaymentVerification ? "Yes" : "No"}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
