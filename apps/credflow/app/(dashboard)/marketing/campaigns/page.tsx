import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default async function CampaignsPage() {
  const user = await requireUser();
  const items = await prisma.qcfCampaign.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle={`${items.length} total`}
        actions={
          <Link href="/marketing/campaigns/new" className="crm-btn-primary inline-flex items-center gap-1.5">
            <Plus size={16} />
            New campaign
          </Link>
        }
      />
      <div className="crm-card overflow-hidden">
        <Table>
          <THead><TR><TH>Name</TH><TH>Status</TH><TH>Type</TH><TH>Created</TH></TR></THead>
          <TBody>
            {items.length === 0 ? (
              <TR><TD colSpan={4} className="py-8 text-center text-crm-muted">No campaigns.</TD></TR>
            ) : (
              items.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">
                    <Link
                      href={`/marketing/campaigns/${c.id}`}
                      className="text-crm-text hover:text-crm-blue hover:underline"
                    >
                      {c.name}
                    </Link>
                  </TD>
                  <TD>{c.status}</TD>
                  <TD>{c.type || "—"}</TD>
                  <TD>{new Date(c.createdAt).toLocaleDateString()}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
