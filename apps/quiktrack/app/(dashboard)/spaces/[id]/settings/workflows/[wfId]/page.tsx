"use client";

import { use } from "react";
import { RequireProjectPerm } from "@/components/shell/require-project-perm";
import { WorkflowEditor } from "./_components/workflow-editor";

export default function WorkflowEditorPage({
  params,
}: {
  params: Promise<{ id: string; wfId: string }> | { id: string; wfId: string };
}) {
  const resolved =
    typeof (params as Promise<{ id: string; wfId: string }>).then === "function"
      ? use(params as Promise<{ id: string; wfId: string }>)
      : (params as { id: string; wfId: string });

  return (
    <RequireProjectPerm projectId={resolved.id} resource="Project" action="update">
      <div className="h-[calc(100vh-0px)]">
        <WorkflowEditor projectId={resolved.id} wfId={resolved.wfId} />
      </div>
    </RequireProjectPerm>
  );
}
