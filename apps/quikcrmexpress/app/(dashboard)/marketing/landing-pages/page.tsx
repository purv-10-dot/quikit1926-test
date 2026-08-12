import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default async function LandingPagesPage() {
  const user = await requireUser();
  const items = await prisma.qceLandingPage.findMany({ where: { orgId: user.orgId }, orderBy: { updatedAt: "desc" } });
  return (
    <div>
      <PageHeader title="Landing Pages" subtitle={`${items.length} total`} />
      <Card className="mb-4 border-amber-200 bg-amber-50">
        <CardBody className="text-sm text-amber-900">
          {/* TODO(post-mvp): port the visual landing-page builder from the legacy frontend */}
          Landing-page WYSIWYG builder is a separate scope. Pages persist via the API but the visual editor is stubbed.
        </CardBody>
      </Card>
      <div className="crm-card overflow-hidden">
        <Table>
          <THead><TR><TH>Name</TH><TH>Slug</TH><TH>Status</TH><TH>Updated</TH></TR></THead>
          <TBody>
            {items.length === 0 ? (
              <TR><TD colSpan={4} className="py-8 text-center text-crm-muted">No landing pages.</TD></TR>
            ) : (
              items.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium">{p.name}</TD>
                  <TD className="font-mono text-xs">/{p.slug}</TD>
                  <TD>{p.status}</TD>
                  <TD>{new Date(p.updatedAt).toLocaleDateString()}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
