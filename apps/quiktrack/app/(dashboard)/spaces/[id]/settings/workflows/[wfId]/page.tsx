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
      {/* Fill the settings <main> exactly so the editor's own header stays put
          and only its diagram/panel body scrolls (not the whole page). */}
      <div className="h-full">
        <WorkflowEditor projectId={resolved.id} wfId={resolved.wfId} />
      </div>
    </RequireProjectPerm>
  );
}
