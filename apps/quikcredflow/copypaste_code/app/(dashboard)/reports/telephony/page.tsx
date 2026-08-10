import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";

export default async function TelephonyReportsPage() {
  const user = await requireUser();
  const [total, byStatus] = await Promise.all([
    prisma.crmCallLog.count({ where: { tenantId: user.tenantId } }),
    prisma.crmCallLog.groupBy({ by: ["status"], where: { tenantId: user.tenantId }, _count: true }),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Telephony Reports" subtitle="Call volume & outcomes" />
      <Card>
        <CardHeader><CardTitle>Total calls</CardTitle></CardHeader>
        <CardBody>
          <div className="text-3xl font-semibold">{total}</div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>By status</CardTitle></CardHeader>
        <CardBody>
          <ul className="divide-y divide-crm-border text-sm">
            {byStatus.map((r) => (
              <li key={r.status || "—"} className="flex justify-between py-1.5">
                <span>{r.status || "—"}</span>
                <span className="font-mono">{r._count}</span>
              </li>
            ))}
            {byStatus.length === 0 && <li className="py-2 text-crm-muted">No calls yet.</li>}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
