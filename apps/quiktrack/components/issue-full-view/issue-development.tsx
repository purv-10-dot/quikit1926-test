"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitCommit,
  GitPullRequest,
} from "lucide-react";
import { DevelopmentActions } from "./development-actions";

interface Branch { id: string; name: string; url: string | null; repoFullName: string }
interface Commit {
  id: string; sha: string; message: string; authorName: string | null;
  url: string | null; repoFullName: string; committedAt: string | null;
}
interface PullRequest {
  id: string; number: number; title: string; state: string; url: string | null;
  authorName: string | null; repoFullName: string;
}
interface DevData { branches: Branch[]; commits: Commit[]; pullRequests: PullRequest[] }

const PR_STATE_CLS: Record<string, string> = {
  OPEN: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  MERGED: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  CLOSED: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

async function fetchDev(issueId: string): Promise<DevData> {
  const r = await fetch(`/api/issues/${issueId}/development`);
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to load");
  return j.data as DevData;
}

/**
 * Development section on the work-item view — branches, commits, and pull
 * requests linked to this issue via its key (QT-123). Mirrors Jira's
 * Development panel. Actions (create branch / commit hint / open in tool) live
 * in the sibling DevelopmentActions component.
 */
export function IssueDevelopment({
  issueId,
  issueKey,
}: {
  issueId: string;
  issueKey: string;
}) {
  const [open, setOpen] = useState(true);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["quiktrack", "issue-development", issueId],
    queryFn: () => fetchDev(issueId),
    staleTime: 30_000,
  });

  const branches = data?.branches ?? [];
  const commits = data?.commits ?? [];
  const prs = data?.pullRequests ?? [];
  const total = branches.length + commits.length + prs.length;

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Development
          {total > 0 && (
            <span className="ml-1 rounded-full bg-gray-100 px-1.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {total}
            </span>
          )}
        </button>
        {open && (
          <DevelopmentActions
            issueId={issueId}
            issueKey={issueKey}
            onBranchCreated={() => refetch()}
          />
        )}
      </div>

      {open && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700">
          {isLoading && (
            <p className="px-4 py-3 text-sm text-gray-500">Loading development data…</p>
          )}

          {!isLoading && total === 0 && (
            <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
              No linked development activity yet. Include{" "}
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[12px] dark:bg-gray-800">
                {issueKey}
              </code>{" "}
              in a branch name, commit message, or PR title to link it here.
            </p>
          )}

          {branches.length > 0 && (
            <Group icon={GitBranch} label="Branches" count={branches.length}>
              {branches.map((b) => (
                <Row key={b.id} url={b.url}>
                  <GitBranch className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-mono text-[13px] text-gray-800 dark:text-gray-200">{b.name}</span>
                  <span className="ml-auto truncate text-[11px] text-gray-400">{b.repoFullName}</span>
                </Row>
              ))}
            </Group>
          )}

          {commits.length > 0 && (
            <Group icon={GitCommit} label="Commits" count={commits.length}>
              {commits.map((c) => (
                <Row key={c.id} url={c.url}>
                  <GitCommit className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-mono text-[11px] text-gray-500">{c.sha.slice(0, 7)}</span>
                  <span className="truncate text-[13px] text-gray-800 dark:text-gray-200">
                    {c.message.split("\n")[0]}
                  </span>
                </Row>
              ))}
            </Group>
          )}

          {prs.length > 0 && (
            <Group icon={GitPullRequest} label="Pull requests" count={prs.length}>
              {prs.map((p) => (
                <Row key={p.id} url={p.url}>
                  <GitPullRequest className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-[11px] text-gray-500">#{p.number}</span>
                  <span className="truncate text-[13px] text-gray-800 dark:text-gray-200">{p.title}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${PR_STATE_CLS[p.state] ?? PR_STATE_CLS.OPEN}`}>
                    {p.state}
                  </span>
                </Row>
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  icon: Icon,
  label,
  count,
  children,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
      <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        <Icon className="h-3 w-3" /> {label} ({count})
      </div>
      {children}
    </div>
  );
}

function Row({ url, children }: { url: string | null; children: React.ReactNode }) {
  const cls = "flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50";
  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer noopener" className={cls}>
        {children}
      </a>
    );
  }
  return <div className={cls}>{children}</div>;
}
