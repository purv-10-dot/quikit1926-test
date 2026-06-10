import Link from "next/link";
import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default async function WorkflowsListPage() {
  const user = await requireUser();
  const items = await prisma.crmWorkflowDefinition.findMany({
    where: { orgId: user.orgId },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <div>
      <PageHeader title="Workflows" subtitle={`${items.length} defined`} />
      <div className="crm-card overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Status</TH>
              <TH>Trigger</TH>
              <TH className="text-right">Triggered</TH>
              <TH>Updated</TH>
            </TR>
          </THead>
          <TBody>
            {items.length === 0 ? (
              <TR><TD colSpan={5} className="py-8 text-center text-crm-muted">No workflows.</TD></TR>
            ) : (
              items.map((w) => (
                <TR key={w.id}>
                  <TD>
                    <Link href={`/automations/workflows/builder?id=${w.id}`} className="crm-link font-medium">
                      {w.name}
                    </Link>
                  </TD>
                  <TD>
                    <span className={
                      "rounded-full px-2 py-0.5 text-xs " +
                      (w.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700")
                    }>{w.status}</span>
                  </TD>
                  <TD>{w.triggerType || "—"}</TD>
                  <TD className="text-right">{w.triggerCount}</TD>
                  <TD>{new Date(w.updatedAt).toLocaleString()}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
