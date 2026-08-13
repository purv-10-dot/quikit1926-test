import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/shared/page-header";
import type { WorkflowEdge, WorkflowNode } from "@/types/workflow";
import { BuilderClient } from "./builder-client";

export default async function WorkflowBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const user = await requireUser();
  const { id } = await searchParams;

  // Tenant-scoped load-back of an existing definition (Constraint 1.4). A new
  // build (no id) starts empty.
  const def = id
    ? await prisma.qceWorkflowDefinition.findFirst({
        where: { id, orgId: user.orgId, deletedAt: null },
      })
    : null;

  return (
    <div>
      <PageHeader
        title="Workflow Builder"
        subtitle="Build a rule, then save it as a draft."
      />
      <BuilderClient
        definitionId={def?.id ?? null}
        initialName={def?.name ?? ""}
        initialTriggerType={def?.triggerType ?? null}
        initialStatus={def?.status ?? null}
        initialNodes={(def?.graphNodes as unknown as WorkflowNode[]) ?? []}
        initialEdges={(def?.graphEdges as unknown as WorkflowEdge[]) ?? []}
      />
    </div>
  );
}
