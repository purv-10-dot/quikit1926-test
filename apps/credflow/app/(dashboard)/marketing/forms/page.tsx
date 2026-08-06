import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default async function FormsPage() {
  const user = await requireUser();
  const items = await prisma.crmFormDefinition.findMany({ where: { tenantId: user.tenantId } });
  return (
    <div>
      <PageHeader title="Forms" subtitle={`${items.length} forms`} />
      <div className="crm-card overflow-hidden">
        <Table>
          <THead><TR><TH>Name</TH><TH>Updated</TH></TR></THead>
          <TBody>
            {items.length === 0 ? (
              <TR><TD colSpan={2} className="py-8 text-center text-crm-muted">No forms.</TD></TR>
            ) : (
              items.map((f) => (
                <TR key={f.id}>
                  <TD className="font-medium">{f.name}</TD>
                  <TD>{new Date(f.updatedAt).toLocaleDateString()}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
