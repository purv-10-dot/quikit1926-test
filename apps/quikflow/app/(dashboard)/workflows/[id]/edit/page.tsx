"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/client/fetcher";
import { LoadingState, ErrorState } from "@/components/ui/page-states";
import { WorkflowBuilder } from "@/components/builder/workflow-builder";
import { deserializeWorkflow } from "@/lib/builder/serialize";

interface WorkflowDetail {
  id: string;
  name: string;
  status: string;
  trigger: unknown;
  graphNodes: unknown;
}

/** Edit an existing workflow — reopens the saved graph into the builder. */
export default function EditWorkflowPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data, isLoading, error } = useQuery({
    queryKey: ["workflow", id],
    queryFn: () => apiGet<WorkflowDetail>(`/api/workflows/${id}`),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={(error as Error).message} />;
  if (!data) return <ErrorState message="Workflow not found" />;

  return <WorkflowBuilder mode="edit" workflowId={id} initial={deserializeWorkflow(data)} />;
}
