"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2 } from "lucide-react";
import { confirmDialog } from "@/lib/ui/confirm";
import { showToast } from "@/lib/ui/toast";
import { CreatePatModal } from "./create-pat-modal";

interface Pat {
  id: string;
  name: string;
  createdById: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
}

async function fetchPats(projectId: string): Promise<Pat[]> {
  const r = await fetch(`/api/projects/${projectId}/pats`);
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to load tokens");
  return j.data as Pat[];
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "Never";
}

/**
 * Space settings → Personal Access Tokens. Lets a Space admin mint and revoke
 * PATs that scope an MCP client (e.g. Claude Code) to this project, at
 * exactly the admin's own QuikTrack permissions — no more, no less.
 */
export function SpacePatsView({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["quiktrack", "space-pats", projectId],
    queryFn: () => fetchPats(projectId),
  });

  const revoke = useMutation({
    mutationFn: async (patId: string) => {
      const r = await fetch(`/api/projects/${projectId}/pats/${patId}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to revoke token");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiktrack", "space-pats", projectId] });
      showToast("Token revoked", "success");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  async function handleRevoke(patId: string) {
    const ok = await confirmDialog({
      title: "Revoke token",
      message: "This token will stop working immediately. This can't be undone.",
      confirmText: "Revoke",
      danger: true,
    });
    if (ok) revoke.mutate(patId);
  }

  const pats = data ?? [];

  return (
    <div className="px-8 py-8">
      <div className="mb-6 flex max-w-2xl items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Personal Access Tokens
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Lets a coding agent (e.g. Claude Code, via the QuikTrack MCP server) act on this project as
            you, within your own QuikTrack permissions. Each token is scoped to this project only and
            expires within a year.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-9 shrink-0 items-center rounded px-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          Create token
        </button>
      </div>

      <div className="mx-auto max-w-2xl">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tokens…
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-200">
            {(error as Error).message}
          </div>
        )}

        {data && pats.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800">
            No active tokens yet. Create one to connect an MCP client.
          </div>
        )}

        {pats.length > 0 && (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
            {pats.map((pat) => (
              <li key={pat.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <KeyRound className="h-4 w-4 shrink-0 text-gray-500" />
                  <div className="min-w-0 text-sm">
                    <p className="truncate text-[13px] font-medium text-gray-900 dark:text-gray-100">
                      {pat.name}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Created {formatDate(pat.createdAt)} · Expires {formatDate(pat.expiresAt)} · Last used{" "}
                      {formatDate(pat.lastUsedAt)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(pat.id)}
                  disabled={revoke.isPending}
                  className="shrink-0 text-sm font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && <CreatePatModal projectId={projectId} onClose={() => setCreating(false)} />}
    </div>
  );
}
