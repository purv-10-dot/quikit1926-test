import Link from "next/link";
import { requireUser } from "@/lib/auth/require";
import { listAutomations } from "@/lib/services/automation/lifecycle";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { AutomationsTable, type AutomationRow } from "./automations-table";

export default async function WorkflowsListPage() {
  const user = await requireUser();
  // S1 read: tenant-scoped, soft-deleted rows excluded (the active list).
  const items = await listAutomations(user.orgId);
  const rows: AutomationRow[] = items.map((w) => ({
    id: w.id,
    name: w.name,
    status: w.status,
    triggerType: w.triggerType,
    triggerCount: w.triggerCount,
    updatedAt: w.updatedAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="Workflows"
        subtitle={`${rows.length} defined`}
        actions={
          <Link href="/automations/workflows/builder">
            <Button size="sm">New workflow</Button>
          </Link>
        }
      />
      <AutomationsTable rows={rows} />
    </div>
  );
}
