"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  ListTree,
  Loader2,
  PlayCircle,
  Sparkles,
} from "lucide-react";
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

const STEPS = [
  {
    id: 1 as const,
    label: "Connect to Jira",
    description: "Site domain, email, API token.",
    icon: KeyRound,
  },
  {
    id: 2 as const,
    label: "Choose what to import",
    description: "Projects, comments, worklog.",
    icon: ListTree,
  },
  {
    id: 3 as const,
    label: "Review & run",
    description: "Confirm and start.",
    icon: PlayCircle,
  },
];
type StepId = (typeof STEPS)[number]["id"];

function MigrationView() {
  const [step, setStep] = useState<StepId>(1);
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

  const step1Valid =
    domain.trim().length > 0 &&
    email.trim().length > 0 &&
    apiToken.trim().length > 0;
  const canSubmit = step1Valid && !run.isPending;
  const projectKeysList = projectKeysRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  function goNext() {
    if (step === 1 && step1Valid) setStep(2);
    else if (step === 2) setStep(3);
  }
  function goBack() {
    if (run.isPending) return;
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  }

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <div className="px-8 py-8 space-y-8">
        {/* Hero */}
        <header className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-accent-500/10 blur-3xl dark:bg-accent-400/10"
          />
          <div className="relative flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-md">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-600 dark:text-accent-400">
                One-time importer
              </p>
              <h1 className="mt-0.5 text-xl font-semibold text-gray-900 dark:text-gray-100">
                Migrate from Jira
              </h1>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                Bring every project, status, sprint, issue, comment, and worklog
                from Atlassian Jira Cloud into this QuikTrack organisation. Run
                a dry-run first to size the workload before you commit.
              </p>
            </div>
          </div>
        </header>

        {/* Stepper */}
        <StepperBar current={step} />

        {/* Step content */}
        {step === 1 && (
          <StepCard
            title="Connect to Jira"
            subtitle="We use these credentials to read from Jira Cloud. Nothing is persisted."
            icon={KeyRound}
          >
            <div className="grid grid-cols-1 gap-4">
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
                  <span className="text-gray-700 dark:text-gray-300 mb-1 block">
                    API token
                  </span>
                  <input
                    type="password"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder="Paste your Atlassian API token"
                    className="w-full h-9 px-3 text-sm rounded-md border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-accent-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                  />
                </label>
                <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                  Create one at{" "}
                  <a
                    href="https://id.atlassian.com/manage-profile/security/api-tokens"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-accent-600 hover:underline dark:text-accent-400"
                  >
                    id.atlassian.com → API tokens
                  </a>
                  . Tokens are sent server-side only; we don&apos;t persist them.
                </p>
              </div>
            </div>
          </StepCard>
        )}

        {step === 2 && (
          <StepCard
            title="Choose what to import"
            subtitle="Pick the projects and entities to bring across. You can always re-run later."
            icon={ListTree}
          >
            <div>
              <label className="block text-sm">
                <span className="text-gray-700 dark:text-gray-300 mb-1 block">
                  Project keys{" "}
                  <span className="text-gray-400 dark:text-gray-500 font-normal">
                    (optional)
                  </span>
                </span>
                <input
                  type="text"
                  value={projectKeysRaw}
                  onChange={(e) => setProjectKeysRaw(e.target.value)}
                  placeholder="PROJ, MOBILE, INFRA  — leave blank to import every project"
                  className="w-full h-9 px-3 text-sm rounded-md border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-accent-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
              </label>
              <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                Comma-separated Jira project keys. Empty = import everything the
                API token can see.
              </p>
            </div>

            <div className="mt-5 space-y-2.5">
              <ToggleRow
                label="Include issue comments"
                checked={includeComments}
                onChange={setIncludeComments}
              />
              <ToggleRow
                label="Include worklog → Timesheet entries"
                checked={includeWorklog}
                onChange={setIncludeWorklog}
              />
              <ToggleRow
                label="Dry run — fetch everything but don't write to the database"
                checked={dryRun}
                onChange={setDryRun}
              />
            </div>

            <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">
              <strong className="font-semibold">
                Attachments are not yet supported.
              </strong>{" "}
              The importer counts them but skips the upload. Adding attachment
              support requires a new{" "}
              <code className="font-mono">QtIssueAttachment</code> table + S3
              wiring; tracked as a follow-up.
            </div>
          </StepCard>
        )}

        {step === 3 && (
          <StepCard
            title="Review & run"
            subtitle="Double-check the plan below, then start the migration."
            icon={PlayCircle}
          >
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label="Jira site" value={domain || "—"} mono />
              <Field label="Account" value={email || "—"} />
              <Field
                label="Projects"
                value={
                  projectKeysList.length === 0
                    ? "All projects the token can see"
                    : projectKeysList.join(", ")
                }
                mono={projectKeysList.length > 0}
              />
              <Field
                label="Mode"
                value={dryRun ? "Dry-run (no writes)" : "Live import"}
                tone={dryRun ? "info" : "danger"}
              />
              <Field
                label="Issue comments"
                value={includeComments ? "Included" : "Skipped"}
              />
              <Field
                label="Worklog → Timesheet"
                value={includeWorklog ? "Included" : "Skipped"}
              />
            </dl>

            {!dryRun && (
              <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-800 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-200">
                <strong className="font-semibold">Live import.</strong> This
                will write to the database. We recommend running a dry-run
                first.
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                onClick={() => run.mutate()}
                disabled={!canSubmit}
                className="bg-accent-600 hover:bg-accent-700 text-white inline-flex items-center gap-2"
              >
                {run.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                {run.isPending
                  ? dryRun
                    ? "Dry-running…"
                    : "Importing… (don't close the tab)"
                  : dryRun
                    ? "Run dry-run"
                    : "Start import"}
              </Button>
              {err && (
                <p className="inline-flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {err}
                </p>
              )}
            </div>
          </StepCard>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            onClick={goBack}
            disabled={step === 1 || run.isPending}
            className="bg-transparent hover:bg-gray-100 text-gray-700 border border-gray-200 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>
          {step < 3 ? (
            <Button
              onClick={goNext}
              disabled={step === 1 && !step1Valid}
              className="bg-accent-600 hover:bg-accent-700 text-white inline-flex items-center gap-1.5"
            >
              Next
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              Step 3 of 3
            </span>
          )}
        </div>

        {report && <ReportPanel report={report} />}
      </div>
    </div>
  );
}

function StepperBar({ current }: { current: StepId }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const isDone = current > s.id;
        const isActive = current === s.id;
        return (
          <li key={s.id} className="flex flex-1 items-center gap-3 min-w-0">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                isActive
                  ? "bg-accent-600 text-white shadow-md shadow-accent-600/30"
                  : isDone
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 hidden sm:block">
              <p
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  isActive
                    ? "text-accent-600 dark:text-accent-400"
                    : "text-gray-400 dark:text-gray-500"
                }`}
              >
                Step {s.id}
              </p>
              <p
                className={`text-sm truncate ${
                  isActive
                    ? "text-gray-900 dark:text-gray-100 font-semibold"
                    : isDone
                      ? "text-gray-700 dark:text-gray-300"
                      : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {s.label}
              </p>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-px ${
                  isDone
                    ? "bg-emerald-500/60"
                    : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StepCard({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h2>
          <p className="text-[12px] text-gray-500 dark:text-gray-400">
            {subtitle}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
        checked
          ? "border-accent-300 bg-accent-50 text-gray-900 dark:border-accent-700/60 dark:bg-accent-900/20 dark:text-gray-100"
          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:bg-gray-900/70"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-400 dark:border-gray-600 dark:bg-gray-900"
      />
      <span className="flex-1">{label}</span>
    </label>
  );
}

function Field({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "info" | "danger";
}) {
  const toneClass =
    tone === "info"
      ? "text-accent-700 dark:text-accent-300"
      : tone === "danger"
        ? "text-red-700 dark:text-red-300"
        : "text-gray-900 dark:text-gray-100";
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm ${toneClass} ${mono ? "font-mono text-[13px]" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function ReportPanel({ report }: { report: MigrationReport }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {report.dryRun ? "Dry-run results" : "Import complete"}
        </h2>
        {report.jiraAccount && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
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
        <p className="text-[12px] text-amber-700 dark:text-amber-300">
          ⚠ {report.counts.attachmentsSkipped} attachment{report.counts.attachmentsSkipped === 1 ? "" : "s"} skipped (attachment support not built yet).
        </p>
      )}

      {report.unresolvedUsers.length > 0 && (
        <details className="text-[12px] text-gray-600 dark:text-gray-300">
          <summary className="cursor-pointer text-gray-700 dark:text-gray-200 font-medium">
            {report.unresolvedUsers.length} unresolved Jira user{report.unresolvedUsers.length === 1 ? "" : "s"} (privacy mode)
          </summary>
          <pre className="mt-2 p-2 rounded bg-gray-50 text-[11px] overflow-x-auto dark:bg-gray-900 dark:text-gray-200">
            {report.unresolvedUsers.join("\n")}
          </pre>
        </details>
      )}

      {report.projectsImported.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">Per-project breakdown</p>
          <table className="w-full text-xs">
            <thead className="text-left text-gray-500 dark:text-gray-400">
              <tr>
                <th className="font-medium pb-1">Key</th>
                <th className="font-medium pb-1">Name</th>
                <th className="font-medium pb-1 text-right">Issues</th>
                <th className="font-medium pb-1 text-right">Sprints</th>
              </tr>
            </thead>
            <tbody>
              {report.projectsImported.map((p) => (
                <tr key={p.key} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="py-1 font-mono text-[11px] text-gray-900 dark:text-gray-100">{p.key}</td>
                  <td className="py-1 text-gray-700 dark:text-gray-300">{p.name}</td>
                  <td className="py-1 text-right text-gray-900 dark:text-gray-100">{p.issueCount}</td>
                  <td className="py-1 text-right text-gray-900 dark:text-gray-100">{p.sprintCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
    </div>
  );
}
