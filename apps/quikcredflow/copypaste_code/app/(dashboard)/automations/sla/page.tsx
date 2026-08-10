import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SlaPage() {
  const user = await requireUser();
  const [rules, tracking] = await Promise.all([
    prisma.crmSlaRule.findMany({ where: { tenantId: user.tenantId } }),
    prisma.crmSlaLeadTracking.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { breachAt: "asc" },
      take: 100,
    }),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="SLA" subtitle="Rules and lead-level tracking" />
      <Card>
        <CardHeader>
          <CardTitle>Rules ({rules.length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR><TH>Name</TH><TH>Target (hours)</TH><TH>Applies to</TH></TR>
            </THead>
            <TBody>
              {rules.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD>{r.targetHours}</TD>
                  <TD>{r.appliesTo || "—"}</TD>
                </TR>
              ))}
              {rules.length === 0 && <TR><TD colSpan={3} className="py-6 text-center text-crm-muted">No rules.</TD></TR>}
            </TBody>
          </Table>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tracking ({tracking.length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR><TH>Rule</TH><TH>Status</TH><TH>Breach at</TH></TR>
            </THead>
            <TBody>
              {tracking.map((t) => (
                <TR key={t.id}>
                  <TD>{t.ruleName}</TD>
                  <TD>{t.status}</TD>
                  <TD>{t.breachAtLabel || (t.breachAt ? new Date(t.breachAt).toLocaleString() : "—")}</TD>
                </TR>
              ))}
              {tracking.length === 0 && <TR><TD colSpan={3} className="py-6 text-center text-crm-muted">Nothing tracked.</TD></TR>}
            </TBody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
