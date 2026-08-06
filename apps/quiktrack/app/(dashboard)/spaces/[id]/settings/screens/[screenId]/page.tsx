"use client";

import { use } from "react";
import { RequireProjectPerm } from "@/components/shell/require-project-perm";
import { ConfigureScreen } from "../_components/configure-screen";

export default function ConfigureScreenPage({
  params,
}: {
  params: Promise<{ id: string; screenId: string }> | { id: string; screenId: string };
}) {
  const resolved =
    typeof (params as Promise<{ id: string; screenId: string }>).then === "function"
      ? use(params as Promise<{ id: string; screenId: string }>)
      : (params as { id: string; screenId: string });

  return (
    <RequireProjectPerm projectId={resolved.id} resource="Project" action="update">
      <ConfigureScreen projectId={resolved.id} screenId={resolved.screenId} />
    </RequireProjectPerm>
  );
}
