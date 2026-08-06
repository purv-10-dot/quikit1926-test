"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, GitCommit, Github, Loader2, X } from "lucide-react";

interface Branch { id: string; name: string; url: string | null; repoFullName: string }
interface Commit {
  id: string; sha: string; message: string; authorName: string | null;
  url: string | null; repoFullName: string; committedAt: string | null;
}
interface PR {
  id: string; number: number; title: string; state: string; url: string | null;
  authorName: string | null; repoFullName: string;
}
interface DevData { branches: Branch[]; commits: Commit[]; pullRequests: PR[] }

type Tab = "branches" | "commits" | "pull-requests" | "builds" | "deployments" | "feature-flags" | "other";
const TABS: { key: Tab; label: string }[] = [
  { key: "branches", label: "Branches" },
  { key: "commits", label: "Commits" },
  { key: "pull-requests", label: "Pull requests" },
  { key: "builds", label: "Builds" },
  { key: "deployments", label: "Deployments" },
  { key: "feature-flags", label: "Feature flags" },
  { key: "other", label: "Other links" },
];

async function fetchDev(issueId: string): Promise<DevData> {
  const r = await fetch(`/api/issues/${issueId}/development`);
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to load");
  return j.data as DevData;
}

function rel(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
  if (s < 86400) return `about ${Math.floor(s / 3600)} hour${Math.floor(s / 3600) === 1 ? "" : "s"} ago`;
  return `${Math.floor(s / 86400)} day${Math.floor(s / 86400) === 1 ? "" : "s"} ago`;
}

/** Group items by repoFullName. */
function groupByRepo<T extends { repoFullName: string }>(items: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const g = m.get(it.repoFullName) ?? [];
    g.push(it);
    m.set(it.repoFullName, g);
  }
  return m;
}

/**
 * Full-screen "Development" modal opened from "View all development
 * information" — Jira-parity: tabbed (Branches/Commits/Pull requests/Builds/
 * Deployments/Feature flags/Other links), repo-grouped tables. Builds/
 * Deployments/Feature flags aren't synced yet → informational empty states.
 */
export function DevelopmentModal({
  issueId,
  onClose,
}: {
  issueId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("pull-requests");
  const { data, isLoading } = useQuery({
    queryKey: ["quiktrack", "issue-development", issueId],
    queryFn: () => fetchDev(issueId),
    staleTime: 30_000,
  });

  // Render into document.body via a portal so the fixed backdrop covers the
  // entire viewport (incl. the app header) rather than being clipped inside
  // the drawer's stacking context. z-index sits above the top nav.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 p-6 overflow-y-auto" onClick={onClose}>
      <div
        className="mt-8 w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Development</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap gap-4 border-b border-gray-100 px-6 dark:border-gray-800">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 py-2 text-[13px] font-medium ${
                tab === t.key
                  ? "border-accent-600 text-accent-700 dark:border-accent-400 dark:text-accent-300"
                  : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-[240px] px-6 py-5">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <TabBody tab={tab} data={data ?? { branches: [], commits: [], pullRequests: [] }} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TabBody({ tab, data }: { tab: Tab; data: DevData }) {
  if (tab === "branches") {
    return <RepoGroups groups={groupByRepo(data.branches)} render={(b: Branch) => (
      <Line key={b.id} icon={GitBranch} url={b.url}>
        <span className="font-mono text-[13px] text-gray-800 dark:text-gray-200">{b.name}</span>
      </Line>
    )} empty="No branches linked yet." />;
  }
  if (tab === "commits") {
    return <RepoGroups groups={groupByRepo(data.commits)} render={(c: Commit) => (
      <Line key={c.id} icon={GitCommit} url={c.url}>
        <span className="font-mono text-[11px] text-gray-500">{c.sha.slice(0, 7)}</span>
        <span className="truncate text-[13px] text-gray-800 dark:text-gray-200">{c.message.split("\n")[0]}</span>
        <span className="ml-auto shrink-0 text-[11px] text-gray-400">{rel(c.committedAt)}</span>
      </Line>
    )} empty="No commits linked yet." />;
  }
  if (tab === "pull-requests") {
    return <PrGroups prs={data.pullRequests} />;
  }
  const msg: Record<string, string> = {
    builds: "No builds seen for this work item yet.",
    deployments: "We haven't seen any deployments in this space for a while.",
    "feature-flags": "No feature flags are linked.",
    other: "No other development links.",
  };
  return <p className="text-sm text-gray-500 dark:text-gray-400">{msg[tab]}</p>;
}

function PrGroups({ prs }: { prs: PR[] }) {
  const groups = groupByRepo(prs);
  if (groups.size === 0) return <p className="text-sm text-gray-500 dark:text-gray-400">No pull requests linked yet.</p>;
  return (
    <>
      {[...groups.entries()].map(([repo, items]) => (
        <div key={repo} className="mb-5">
          <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
            <Github className="h-4 w-4 text-gray-500" />
            {repo} <span className="font-normal text-gray-400">(GitHub)</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="py-1 pr-2 font-medium">ID</th>
                <th className="py-1 pr-2 font-medium">Summary</th>
                <th className="py-1 pr-2 font-medium">Status</th>
                <th className="py-1 pr-2 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-2 text-[12px] text-gray-500">#{p.number}</td>
                  <td className="py-2 pr-2">
                    <a href={p.url ?? "#"} target="_blank" rel="noreferrer noopener" className="text-[13px] text-accent-600 hover:underline dark:text-accent-400">
                      {p.title}
                    </a>
                  </td>
                  <td className="py-2 pr-2">
                    <span className="inline-block rounded border border-purple-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-purple-700 dark:border-purple-500/50 dark:text-purple-300">
                      {p.state}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-right text-[12px] text-gray-500 dark:text-gray-400">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

function RepoGroups<T extends { repoFullName: string }>({
  groups, render, empty,
}: {
  groups: Map<string, T[]>;
  render: (item: T) => React.ReactNode;
  empty: string;
}) {
  if (groups.size === 0) return <p className="text-sm text-gray-500 dark:text-gray-400">{empty}</p>;
  return (
    <>
      {[...groups.entries()].map(([repo, items]) => (
        <div key={repo} className="mb-5">
          <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
            <Github className="h-4 w-4 text-gray-500" />
            {repo} <span className="font-normal text-gray-400">(GitHub)</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">{items.map(render)}</div>
        </div>
      ))}
    </>
  );
}

function Line({ icon: Icon, url, children }: { icon: React.ElementType; url: string | null; children: React.ReactNode }) {
  const cls = "flex items-center gap-2 py-2 text-sm";
  const inner = (
    <>
      <Icon className="h-3.5 w-3.5 text-gray-400" />
      {children}
    </>
  );
  return url ? (
    <a href={url} target="_blank" rel="noreferrer noopener" className={`${cls} hover:underline`}>{inner}</a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
