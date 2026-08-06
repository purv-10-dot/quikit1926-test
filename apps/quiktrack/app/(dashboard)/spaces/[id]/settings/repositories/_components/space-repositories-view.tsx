"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Github, Loader2 } from "lucide-react";

interface SpaceRepo {
  repoId: string;
  repoFullName: string;
  defaultBranch: string;
  linkedToThisSpace: boolean;
  linkedToOtherSpace: boolean;
}

async function fetchSpaceRepos(projectId: string): Promise<SpaceRepo[]> {
  const r = await fetch(`/api/projects/${projectId}/github-repos`);
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to load");
  return j.data as SpaceRepo[];
}

/**
 * Space settings → Repositories. Lets a Space admin link org-connected GitHub
 * repos to THIS space, so development activity is scoped per Space. The org
 * connection itself is managed in Settings → Integrations → GitHub.
 */
export function SpaceRepositoriesView({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["quiktrack", "space-github-repos", projectId],
    queryFn: () => fetchSpaceRepos(projectId),
  });

  const toggle = useMutation({
    mutationFn: async ({ repoId, linked }: { repoId: string; linked: boolean }) => {
      const r = await fetch(`/api/projects/${projectId}/github-repos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId, linked }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Update failed");
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["quiktrack", "space-github-repos", projectId] }),
  });

  const repos = data ?? [];

  return (
    <div className="px-8 py-8">
      <div className="mb-6 max-w-2xl">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Repositories</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Link GitHub repositories to this space so their branches, commits, and
          pull requests appear on this space&apos;s work items. Connect a GitHub
          organization first in{" "}
          <a href="/settings/integrations/github" className="text-accent-600 hover:underline dark:text-accent-400">
            Settings → Integrations → GitHub
          </a>
          .
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading repositories…
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-200">
          {(error as Error).message}
        </div>
      )}

      {data && repos.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800">
          No repositories are linked at the organization level yet.
        </div>
      )}

      {repos.length > 0 && (
        <ul className="max-w-2xl divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
          {repos.map((repo) => (
            <li key={repo.repoId} className="flex items-center justify-between px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <Github className="h-4 w-4 shrink-0 text-gray-500" />
                <div className="min-w-0">
                  <p className="truncate font-mono text-[13px] text-gray-900 dark:text-gray-100">
                    {repo.repoFullName}
                  </p>
                  {repo.linkedToOtherSpace && !repo.linkedToThisSpace && (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400">
                      Currently linked to another space — linking here moves it.
                    </span>
                  )}
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={repo.linkedToThisSpace}
                  disabled={toggle.isPending}
                  onChange={(e) =>
                    toggle.mutate({ repoId: repo.repoId, linked: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-400 dark:border-gray-600 dark:bg-gray-900"
                />
                <span className="text-gray-600 dark:text-gray-300">
                  {repo.linkedToThisSpace ? "Linked" : "Link"}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
