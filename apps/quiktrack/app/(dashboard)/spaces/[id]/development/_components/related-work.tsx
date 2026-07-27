"use client";

import { useState } from "react";
import { GitBranch, GitCommit, GitPullRequest, Github, Rocket, ShieldAlert, Sparkles } from "lucide-react";
import { PrTable, type PrRow } from "./pr-table";

interface Repo { repoId: string; repoFullName: string; defaultBranch: string }
interface Branch { id: string; name: string; url: string | null; repoFullName: string }
interface Commit { id: string; sha: string; message: string; url: string | null; repoFullName: string }
type PR = PrRow;

export interface RelatedWorkData {
  repos: Repo[];
  branches: Branch[];
  commits: Commit[];
  pullRequests: PR[];
}

type Tab = "pull-requests" | "repositories" | "vulnerabilities" | "deployments" | "work-suggestions";
const TABS: { key: Tab; label: string }[] = [
  { key: "pull-requests", label: "Pull requests" },
  { key: "repositories", label: "Repositories" },
  { key: "vulnerabilities", label: "Vulnerabilities" },
  { key: "deployments", label: "Deployments" },
  { key: "work-suggestions", label: "Work suggestions" },
];

/** "Related work" panel with the Jira-style filter tabs + per-tab empty states. */
export function RelatedWork({ data }: { data: RelatedWorkData }) {
  const [tab, setTab] = useState<Tab>("pull-requests");
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Related work</h2>
        <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
                tab === t.key
                  ? "bg-white text-accent-700 shadow-sm dark:bg-gray-900 dark:text-accent-300"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {tab === "pull-requests" && (
          data.pullRequests.length ? (
            <div className="p-4">
              <PrTable prs={data.pullRequests} />
            </div>
          ) : (
            <Empty icon={GitPullRequest} title="No pull requests yet"
              body="Add a work-item key (e.g. QUIKTR-123) to a pull request title in your connected repository to see it here." />
          )
        )}

        {tab === "repositories" && (
          data.repos.length ? (
            <List>{data.repos.map((r) => (
              <Row key={r.repoId} url={`https://github.com/${r.repoFullName}`}>
                <Github className="h-4 w-4 text-gray-500" />
                <span className="font-mono text-[13px] text-gray-900 dark:text-gray-100">{r.repoFullName}</span>
                <span className="ml-auto text-[11px] text-gray-400">{r.defaultBranch}</span>
              </Row>
            ))}</List>
          ) : (
            <Empty icon={Github} title="No repositories linked"
              body="Link a repository to this space in Settings → Repositories." />
          )
        )}

        {tab === "vulnerabilities" && (
          <Empty icon={ShieldAlert} title="No vulnerabilities"
            body="Security scanning isn't connected for this space yet." />
        )}

        {tab === "deployments" && (
          <Empty icon={Rocket} title="Nothing deployed"
            body="Connect a deployment pipeline (via webhooks) so deployments against your linked branches show here." />
        )}

        {tab === "work-suggestions" && (
          (data.branches.length + data.commits.length) ? (
            <List>
              {data.branches.slice(0, 10).map((b) => (
                <Row key={b.id} url={b.url}>
                  <GitBranch className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-mono text-[13px] text-gray-800 dark:text-gray-200">{b.name}</span>
                  <span className="ml-auto truncate text-[11px] text-gray-400">{b.repoFullName}</span>
                </Row>
              ))}
              {data.commits.slice(0, 10).map((c) => (
                <Row key={c.id} url={c.url}>
                  <GitCommit className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-mono text-[11px] text-gray-500">{c.sha.slice(0, 7)}</span>
                  <span className="truncate text-[13px] text-gray-800 dark:text-gray-200">{c.message.split("\n")[0]}</span>
                </Row>
              ))}
            </List>
          ) : (
            <Empty icon={Sparkles} title="No suggestions yet"
              body="As branches, commits, and PRs reference work items, suggestions appear here." />
          )
        )}
      </div>
    </section>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-gray-100 dark:divide-gray-800">{children}</div>;
}

function Row({ url, children }: { url: string | null; children: React.ReactNode }) {
  const cls = "flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50";
  return url ? (
    <a href={url} target="_blank" rel="noreferrer noopener" className={cls}>{children}</a>
  ) : (
    <div className={cls}>{children}</div>
  );
}

function Empty({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-900">
        <Icon className="h-6 w-6 text-gray-400" />
      </div>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-gray-500 dark:text-gray-400">{body}</p>
    </div>
  );
}
