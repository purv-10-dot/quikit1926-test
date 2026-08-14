"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Settings,
} from "lucide-react";
import { DevSummaryRow } from "./dev-summary-row";
import {
  DevActionLink,
  OpenInToolRow,
  CreateBranchRow,
  CreateCommitRow,
  CreatePrRow,
} from "./dev-action-rows";

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
  onDevChanged,
}: {
  issueId: string;
  issueKey: string;
  /** Called after a dev action that may have auto-transitioned the item, so the
   *  parent can refresh the item's status. */
  onDevChanged?: () => void;
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
  // Most recent commit timestamp (commits come back newest-first).
  const latestCommitAt = commits.find((c) => c.committedAt)?.committedAt ?? null;

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
        </button>
      </div>

      {open && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700">
          {isLoading && (
            <p className="px-4 py-3 text-sm text-gray-500">Loading development data…</p>
          )}

          {/* Jira layout: Connect + Open always; then per type show the COUNT
              row when there's data, otherwise the CREATE row (which expands
              inline). Never both — no duplication. */}
          {!isLoading && (
            <div className="flex flex-col gap-1 px-3 py-2">
              <DevActionLink href="/settings/integrations/github" icon={Settings} label="Connect development tools" />
              <OpenInToolRow />

              {branches.length > 0 ? (
                <DevSummaryRow
                  icon={GitBranch}
                  kind="Branch"
                  issueKey={issueKey}
                  issueId={issueId}
                  label={`${branches.length} branch${branches.length === 1 ? "" : "es"}`}
                  items={branches.map((b) => ({ heading: b.name, repo: b.repoFullName, url: b.url }))}
                />
              ) : (
                <CreateBranchRow issueId={issueId} issueKey={issueKey} onCreated={() => { refetch(); onDevChanged?.(); }} />
              )}

              {commits.length > 0 ? (
                <DevSummaryRow
                  icon={GitCommit}
                  kind="Commit"
                  issueKey={issueKey}
                  issueId={issueId}
                  label={`${commits.length} commit${commits.length === 1 ? "" : "s"}`}
                  meta={relativeTime(latestCommitAt)}
                  items={commits.map((c) => ({
                    heading: `#${c.sha.slice(0, 7)}`,
                    meta: c.committedAt ? `Last updated ${relativeTime(c.committedAt)}` : undefined,
                    repo: c.repoFullName,
                    url: c.url,
                  }))}
                />
              ) : (
                <CreateCommitRow issueKey={issueKey} />
              )}

              {prs.length > 0 ? (
                <DevSummaryRow
                  icon={GitPullRequest}
                  kind="Pull request"
                  issueKey={issueKey}
                  issueId={issueId}
                  label={`${prs.length} pull request${prs.length === 1 ? "" : "s"}`}
                  items={prs.map((p) => ({
                    heading: `#${p.number} ${p.title}`,
                    meta: p.state,
                    repo: p.repoFullName,
                    url: p.url,
                  }))}
                />
              ) : (
                // "Create pull request" needs a branch to base it on — only
                // offer it once at least one branch is linked.
                branches.length > 0 && <CreatePrRow issueKey={issueKey} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact relative time ("3 minutes ago", "2 days ago"). */
function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
