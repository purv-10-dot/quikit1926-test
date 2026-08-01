"use client";

import { use } from "react";
import { RequireProjectPerm } from "@/components/shell/require-project-perm";
import { SpaceRepositoriesView } from "./_components/space-repositories-view";

export default function SpaceRepositoriesPage({
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
    <RequireProjectPerm projectId={projectId} resource="ProjectMember" action="update">
      <SpaceRepositoriesView projectId={projectId} />
    </RequireProjectPerm>
  );
}
