"use client";

import { use } from "react";
import { RequireProjectPerm } from "@/components/shell/require-project-perm";
import { ScreensOverview } from "./_components/screens-overview";

export default function SpaceScreensPage({
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
      <ScreensOverview projectId={projectId} />
    </RequireProjectPerm>
  );
}
