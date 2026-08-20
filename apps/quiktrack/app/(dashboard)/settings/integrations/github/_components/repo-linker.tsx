"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, Link2, Link2Off, ListChecks } from "lucide-react";
import { Button } from "@quikit/ui";
import { BackfillChecklist, type RepoBackfillStatus } from "./backfill-checklist";
import { confirmDialog } from "@/lib/ui/confirm";

interface AvailableRepo {
  repoId: string;
  repoFullName: string;
  defaultBranch: string;
}
interface LinkedRepo {
  id: string;
  repoId: string;
  repoFullName: string;
  isActive: boolean;
  backfillStatus: RepoBackfillStatus | null;
}
interface ReposResponse {
  available: AvailableRepo[];
  linked: LinkedRepo[];
}

async function fetchRepos(installationRowId: string): Promise<ReposResponse> {
  const r = await fetch(`/api/integrations/github/repos?installationId=${installationRowId}`);
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to load repos");
  return j.data as ReposResponse;
}

/** Repo linking + per-repo backfill for the active installation. */
export function RepoLinker({ installationRowId }: { installationRowId: string }) {
  const qc = useQueryClient();
  const [checklistRepo, setChecklistRepo] = useState<LinkedRepo | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["github-repos", installationRowId],
    queryFn: () => fetchRepos(installationRowId),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["github-repos", installationRowId] });

  const link = useMutation({
    mutationFn: async (repo: AvailableRepo) => {
      const r = await fetch("/api/integrations/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId: installationRowId,
          repoId: repo.repoId,
          repoFullName: repo.repoFullName,
          defaultBranch: repo.defaultBranch,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Link failed");
    },
    onSuccess: invalidate,
  });

  const unlink = useMutation({
    mutationFn: async (repoId: string) => {
      const r = await fetch(`/api/integrations/github/repos?repoId=${repoId}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Unlink failed");
    },
    onSuccess: invalidate,
  });

  const backfill = useMutation({
    mutationFn: async (repoId: string) => {
      const r = await fetch("/api/integrations/github/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Backfill failed");
    },
    onSuccess: invalidate,
  });

  const activeLinked = (data?.linked ?? []).filter((l) => l.isActive);
  const linkedIds = new Set(activeLinked.map((l) => l.repoId));
  const linkedById = new Map(activeLinked.map((l) => [l.repoId, l]));

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Repositories</h2>
        <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">
          Link the repositories whose branches, commits, and PRs should appear on work items.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 px-6 py-4 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading repositories…
        </div>
      )}
      {error && (
        <div className="px-6 py-4 text-sm text-red-600 dark:text-red-400">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {data.available.length === 0 && (
            <li className="px-6 py-4 text-sm text-gray-500">
              No repositories available from this installation.
            </li>
          )}
          {data.available.map((repo) => {
            const isLinked = linkedIds.has(repo.repoId);
            return (
              <li key={repo.repoId} className="flex items-center justify-between px-6 py-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[13px] text-gray-900 dark:text-gray-100">
                    {repo.repoFullName}
                  </p>
                  <span className="text-[11px] text-gray-400">default: {repo.defaultBranch}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isLinked ? (
                    <>
                      <Button
                        onClick={() => backfill.mutate(repo.repoId)}
                        disabled={backfill.isPending}
                        className="bg-accent-50 text-accent-700 hover:bg-accent-100 inline-flex items-center gap-1.5 text-xs dark:bg-accent-900/20 dark:text-accent-300"
                      >
                        {backfill.isPending && backfill.variables === repo.repoId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        Backfill
                      </Button>
                      <Button
                        onClick={() => setChecklistRepo(linkedById.get(repo.repoId) ?? null)}
                        className="border border-gray-200 bg-transparent text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5 text-xs dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <ListChecks className="h-3.5 w-3.5" /> Status
                      </Button>
                      <Button
                        onClick={async () => {
                          const ok = await confirmDialog({
                            title: "Unlink repository?",
                            message: `"${repo.repoFullName}" will no longer surface its branches, commits, or pull requests on work items. You can re-link it any time.`,
                            confirmText: "Unlink",
                            danger: true,
                          });
                          if (ok) unlink.mutate(repo.repoId);
                        }}
                        disabled={unlink.isPending}
                        className="border border-gray-200 bg-transparent text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5 text-xs dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <Link2Off className="h-3.5 w-3.5" /> Unlink
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={() => link.mutate(repo)}
                      disabled={link.isPending}
                      className="bg-accent-600 hover:bg-accent-700 text-white inline-flex items-center gap-1.5 text-xs"
                    >
                      <Link2 className="h-3.5 w-3.5" /> Link
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {checklistRepo && (
        <BackfillChecklist
          repoFullName={checklistRepo.repoFullName}
          status={checklistRepo.backfillStatus}
          running={backfill.isPending && backfill.variables === checklistRepo.repoId}
          onClose={() => setChecklistRepo(null)}
        />
      )}
    </section>
  );
}
