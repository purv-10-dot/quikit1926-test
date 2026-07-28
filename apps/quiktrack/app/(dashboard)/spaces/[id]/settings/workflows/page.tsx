"use client";

import { use } from "react";
import { RequireProjectPerm } from "@/components/shell/require-project-perm";
import { WorkflowsOverview } from "./_components/workflows-overview";

export default function SpaceWorkflowsPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const resolved =
    typeof (params as Promise<{ id: string }>).then === "function"
      ? use(params as Promise<{ id: string }>)
      : (params as { id: string });
  const projectId = resolved.id;

  return (
    <RequireProjectPerm projectId={projectId} resource="Project" action="update">
      <WorkflowsOverview projectId={projectId} />
    </RequireProjectPerm>
  );
}
