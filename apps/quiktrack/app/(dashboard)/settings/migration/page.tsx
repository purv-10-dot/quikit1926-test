"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Database, Loader2 } from "lucide-react";
import { Button, Input } from "@quikit/ui";
import { RequirePerm } from "@/components/shell/require-perm";

interface MigrationReport {
  ok: boolean;
  error?: string;
  jiraAccount?: { email: string | null; accountId: string };
  counts: {
    users: { matched: number; created: number };
    projects: number;
    statuses: number;
    issueTypes: number;
    sprints: number;
    issues: number;
    comments: number;
    worklog: number;
    attachmentsSkipped: number;
  };
  projectsImported: Array<{ key: string; name: string; issueCount: number; sprintCount: number }>;
  unresolvedUsers: string[];
  dryRun: boolean;
}

export default function MigrationPage() {
  return (
    <RequirePerm adminOnly>
      <MigrationView />
    </RequirePerm>
  );
}

function MigrationView() {
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [projectKeysRaw, setProjectKeysRaw] = useState("");
  const [includeComments, setIncludeComments] = useState(true);
  const [includeWorklog, setIncludeWorklog] = useState(true);
  const [dryRun, setDryRun] = useState(true);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      setErr(null);
      setReport(null);
      const projectKeys = projectKeysRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const r = await fetch("/api/migration/jira", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Normalise: strip protocol, path, and trailing slash so the user
          // can paste "https://acme.atlassian.net/jira" and we still hit
          // the right REST base.
          domain: domain
            .trim()
            .replace(/^https?:\/\//i, "")
            .split("/")[0]
            .replace(/\/+$/, ""),
          email: email.trim(),
          apiToken: apiToken.trim(),
          projectKeys: projectKeys.length > 0 ? projectKeys : undefined,
          includeComments,
          includeWorklog,
          dryRun,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        // Server still sends the partial report on 502.
        if (j.data) setReport(j.data as MigrationReport);
        throw new Error(j.error ?? "Migration failed");
      }
      setReport(j.data as MigrationReport);
    },
    onError: (e: Error) => setErr(e.message),
  });

  const canSubmit =
    domain.trim().length > 0 &&
    email.trim().length > 0 &&
    apiToken.trim().length > 0 &&
    !run.isPending;

  return (
    <div className="px-8 py-6 max-w-3xl space-y-6">
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
          <Database className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Migrate from Jira</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            One-shot import from Atlassian Jira Cloud. Bring over every project,
            status, sprint, issue, comment, and worklog into this QuikTrack
            organisation. Run a dry-run first to size the workload.
          </p>
        </div>
      </header>

      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Jira credentials</h2>
        <div className="grid grid-cols-1 gap-3">
          <Input
            label="Jira site domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="acme.atlassian.net"
          />
          <Input
            label="Atlassian account email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
          <div>
            <label className="block text-sm">
              <span className="text-gray-700 mb-1 block">API token</span>
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Paste your Atlassian API token"
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </label>
            <p className="mt-1 text-[11px] text-gray-500">
              Create one at{" "}
              <a
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noreferrer noopener"
                className="text-blue-600 hover:underline"
              >
                id.atlassian.com → API tokens
              </a>
              . Tokens are sent server-side only; we don&apos;t persist them.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Scope</h2>
        <div>
          <label className="block text-sm">
            <span className="text-gray-700 mb-1 block">Project keys (optional)</span>
            <input
              type="text"
              value={projectKeysRaw}
              onChange={(e) => setProjectKeysRaw(e.target.value)}
              placeholder="PROJ, MOBILE, INFRA  — leave blank to import every project"
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </label>
          <p className="mt-1 text-[11px] text-gray-500">
            Comma-separated Jira project keys. Empty = import everything the
            API token can see.
          </p>
        </div>

        <div className="space-y-2 pt-1">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={includeComments}
              onChange={(e) => setIncludeComments(e.target.checked)}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            Include issue comments
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={includeWorklog}
              onChange={(e) => setIncludeWorklog(e.target.checked)}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            Include worklog → Timesheet entries
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <span>
              Dry run — fetch everything but don&apos;t write to the database
            </span>
          </label>
        </div>

        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800">
          <strong className="font-semibold">Attachments are not yet supported.</strong>{" "}
          The importer counts them but skips the upload. Adding attachment
          support requires a new <code>QtIssueAttachment</code> table + S3
          wiring; tracked as a follow-up.
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => run.mutate()}
          disabled={!canSubmit}
          className="bg-blue-600 hover:bg-blue-700 inline-flex items-center gap-2"
        >
          {run.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {run.isPending
            ? dryRun
              ? "Dry-running…"
              : "Importing… (don't close the tab)"
            : dryRun
              ? "Run dry-run"
              : "Start import"}
        </Button>
        {err && (
          <p className="inline-flex items-center gap-1.5 text-sm text-red-600">
            <AlertCircle className="h-3.5 w-3.5" />
            {err}
          </p>
        )}
      </div>

      {report && <ReportPanel report={report} />}
    </div>
  );
}

function ReportPanel({ report }: { report: MigrationReport }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        <h2 className="text-sm font-semibold text-gray-900">
          {report.dryRun ? "Dry-run results" : "Import complete"}
        </h2>
        {report.jiraAccount && (
          <span className="text-xs text-gray-500">
            authenticated as {report.jiraAccount.email ?? report.jiraAccount.accountId}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Projects" value={report.counts.projects} />
        <Stat label="Issues" value={report.counts.issues} />
        <Stat label="Sprints" value={report.counts.sprints} />
        <Stat label="Statuses" value={report.counts.statuses} />
        <Stat label="Issue types" value={report.counts.issueTypes} />
        <Stat label="Comments" value={report.counts.comments} />
        <Stat label="Worklog entries" value={report.counts.worklog} />
        <Stat
          label="Users (matched / created)"
          value={`${report.counts.users.matched} / ${report.counts.users.created}`}
        />
      </div>

      {report.counts.attachmentsSkipped > 0 && (
        <p className="text-[12px] text-amber-700">
          ⚠ {report.counts.attachmentsSkipped} attachment{report.counts.attachmentsSkipped === 1 ? "" : "s"} skipped (attachment support not built yet).
        </p>
      )}

      {report.unresolvedUsers.length > 0 && (
        <details className="text-[12px] text-gray-600">
          <summary className="cursor-pointer text-gray-700 font-medium">
            {report.unresolvedUsers.length} unresolved Jira user{report.unresolvedUsers.length === 1 ? "" : "s"} (privacy mode)
          </summary>
          <pre className="mt-2 p-2 bg-gray-50 rounded text-[11px] overflow-x-auto">
            {report.unresolvedUsers.join("\n")}
          </pre>
        </details>
      )}

      {report.projectsImported.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">Per-project breakdown</p>
          <table className="w-full text-xs">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="font-medium pb-1">Key</th>
                <th className="font-medium pb-1">Name</th>
                <th className="font-medium pb-1 text-right">Issues</th>
                <th className="font-medium pb-1 text-right">Sprints</th>
              </tr>
            </thead>
            <tbody>
              {report.projectsImported.map((p) => (
                <tr key={p.key} className="border-t border-gray-100">
                  <td className="py-1 font-mono text-[11px]">{p.key}</td>
                  <td className="py-1 text-gray-700">{p.name}</td>
                  <td className="py-1 text-right">{p.issueCount}</td>
                  <td className="py-1 text-right">{p.sprintCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-gray-50 border border-gray-100 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}
