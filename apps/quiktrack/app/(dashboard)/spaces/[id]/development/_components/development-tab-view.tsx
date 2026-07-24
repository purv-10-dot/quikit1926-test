"use client";

import { useQuery } from "@tanstack/react-query";
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  Github,
  Loader2,
} from "lucide-react";
import { ConnectCodingTools } from "./connect-coding-tools";

interface Repo { repoId: string; repoFullName: string; defaultBranch: string }
interface Branch { id: string; name: string; url: string | null; repoFullName: string }
interface Commit { id: string; sha: string; message: string; url: string | null; repoFullName: string }
interface PR { id: string; number: number; title: string; state: string; url: string | null; repoFullName: string }
interface DevSummary {
  repos: Repo[];
  branches: Branch[];
  commits: Commit[];
  pullRequests: PR[];
  counts: { repos: number; branches: number; commits: number; pullRequests: number };
}

async function fetchSummary(projectId: string): Promise<DevSummary> {
  const r = await fetch(`/api/projects/${projectId}/development`);
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to load");
  return j.data as DevSummary;
}

/**
 * Space-level Development tab — connection/repo overview + recent branches,
 * commits, and pull requests across this space's work items. Mirrors the
 * "Related work / Repositories" surface of Jira's Development tab. DORA metrics
 * (cycle time, lead time, deployment frequency) are intentionally deferred
 * until we compute them from real data rather than showing zeros.
 */
export function DevelopmentTabView({ projectId }: { projectId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["quiktrack", "space-development", projectId],
    queryFn: () => fetchSummary(projectId),
  });

  return (
    <div className="px-8 py-6">
      {/* Key metrics — matches Jira's Development tab. Real counts where we
          have them; DORA metrics show "—" until computed (never fake zeros). */}
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Key metrics</h2>
        <span className="rounded border border-accent-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-600 dark:border-accent-500/50 dark:text-accent-400">
          Beta
        </span>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={GitPullRequest} label="Pull requests" value={data?.counts.pullRequests ?? 0} sub="Linked to this space" />
        <Metric icon={GitCommit} label="Commits" value={data?.counts.commits ?? 0} sub="Linked to this space" />
        <Metric icon={GitBranch} label="Branches" value={data?.counts.branches ?? 0} sub="Linked to this space" />
        <Metric icon={Github} label="Repositories" value={data?.counts.repos ?? 0} sub="Connected to this space" />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-gray-700 dark:text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Related work</h2>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading development activity…
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-200">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <>
          {data.counts.repos === 0 && <ConnectCodingTools />}

          {data.repos.length > 0 && (
            <Section title="Repositories">
              {data.repos.map((r) => (
                <a
                  key={r.repoId}
                  href={`https://github.com/${r.repoFullName}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <Github className="h-4 w-4 text-gray-500" />
                  <span className="font-mono text-[13px] text-gray-900 dark:text-gray-100">{r.repoFullName}</span>
                  <span className="ml-auto text-[11px] text-gray-400">{r.defaultBranch}</span>
                </a>
              ))}
            </Section>
          )}

          {data.pullRequests.length > 0 && (
            <Section title="Recent pull requests">
              {data.pullRequests.map((p) => (
                <Row key={p.id} url={p.url}>
                  <GitPullRequest className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-[11px] text-gray-500">#{p.number}</span>
                  <span className="truncate text-[13px] text-gray-800 dark:text-gray-200">{p.title}</span>
                  <span className="ml-auto text-[11px] text-gray-400">{p.state}</span>
                </Row>
              ))}
            </Section>
          )}

          {data.branches.length > 0 && (
            <Section title="Recent branches">
              {data.branches.map((b) => (
                <Row key={b.id} url={b.url}>
                  <GitBranch className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-mono text-[13px] text-gray-800 dark:text-gray-200">{b.name}</span>
                  <span className="ml-auto truncate text-[11px] text-gray-400">{b.repoFullName}</span>
                </Row>
              ))}
            </Section>
          )}

          {data.commits.length > 0 && (
            <Section title="Recent commits">
              {data.commits.map((c) => (
                <Row key={c.id} url={c.url}>
                  <GitCommit className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-mono text-[11px] text-gray-500">{c.sha.slice(0, 7)}</span>
                  <span className="truncate text-[13px] text-gray-800 dark:text-gray-200">
                    {c.message.split("\n")[0]}
                  </span>
                </Row>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-1.5 text-2xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
        {title}
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">{children}</div>
    </section>
  );
}

function Row({ url, children }: { url: string | null; children: React.ReactNode }) {
  const cls = "flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50";
  return url ? (
    <a href={url} target="_blank" rel="noreferrer noopener" className={cls}>{children}</a>
  ) : (
    <div className={cls}>{children}</div>
  );
}
