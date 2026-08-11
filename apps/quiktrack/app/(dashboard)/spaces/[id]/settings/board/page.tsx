"use client";

import { use } from "react";
import { RequireProjectPerm } from "@/components/shell/require-project-perm";
import { BoardColumnsSettings } from "./_components/board-columns-settings";

export default function SpaceBoardSettingsPage({
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
      <BoardColumnsSettings projectId={projectId} />
    </RequireProjectPerm>
  );
}
