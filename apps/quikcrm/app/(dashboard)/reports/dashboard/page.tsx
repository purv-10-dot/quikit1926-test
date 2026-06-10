import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { PipelineChart } from "@/components/reports/pipeline-chart";

export default async function ReportsDashboardPage() {
  const user = await requireUser();
  const stages = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Closed"] as const;
  const data = await Promise.all(
    stages.map(async (stage) => ({
      stage,
      count: await prisma.crmLead.count({ where: { orgId: user.orgId, stage } }),
    })),
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" subtitle="Pipeline & key metrics" />
      <Card>
        <CardHeader>
          <CardTitle>Lead pipeline by stage</CardTitle>
        </CardHeader>
        <CardBody>
          <PipelineChart data={data} />
        </CardBody>
      </Card>
    </div>
  );
}
