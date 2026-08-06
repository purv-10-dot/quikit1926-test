"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy, GitPullRequest, Loader2, X } from "lucide-react";

/** A repo linked at the org level, as returned by /api/integrations/github/repos. */
export interface LinkedRepo {
  repoId: string;
  repoFullName: string;
  defaultBranch: string;
  isActive: boolean;
}

// Deep-link templates for "Open in coding tool".
const CODING_TOOLS: { label: string; href: (repo: string) => string }[] = [
  { label: "VS Code", href: (r) => `vscode://vscode.git/clone?url=https://github.com/${r}.git` },
  { label: "Cursor", href: (r) => `cursor://vscode.git/clone?url=https://github.com/${r}.git` },
  { label: "GitHub.dev", href: (r) => `https://github.dev/${r}` },
  { label: "Open on GitHub", href: (r) => `https://github.com/${r}` },
];

function slugTitle(key: string) {
  return `${key}-work`;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function BranchDialog({
  issueId,
  issueKey,
  repos,
  onClose,
  onCreated,
}: {
  issueId: string;
  issueKey: string;
  repos: LinkedRepo[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [repoId, setRepoId] = useState(repos[0]?.repoId ?? "");
  const [sourceBranch, setSourceBranch] = useState(repos[0]?.defaultBranch ?? "main");
  const [branchName, setBranchName] = useState(slugTitle(issueKey));
  const [err, setErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      setErr(null);
      const r = await fetch(`/api/issues/${issueId}/development/branch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId, sourceBranch, branchName }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Create failed");
    },
    onSuccess: onCreated,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <Dialog title="Create GitHub branch" onClose={onClose}>
      {repos.length === 0 ? (
        <p className="text-sm text-gray-500">No linked repositories. Link one in Settings → Integrations → GitHub.</p>
      ) : (
        <div className="space-y-3">
          <Labeled label="Repository">
            <select
              value={repoId}
              onChange={(e) => {
                setRepoId(e.target.value);
                const r = repos.find((x) => x.repoId === e.target.value);
                if (r) setSourceBranch(r.defaultBranch);
              }}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              {repos.map((r) => (
                <option key={r.repoId} value={r.repoId}>{r.repoFullName}</option>
              ))}
            </select>
          </Labeled>
          <Labeled label="Branch from">
            <input
              value={sourceBranch}
              onChange={(e) => setSourceBranch(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </Labeled>
          <Labeled label="Branch name">
            <input
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 font-mono text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </Labeled>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending || !repoId || !branchName}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-600 px-3 py-1.5 text-sm text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create branch
          </button>
        </div>
      )}
    </Dialog>
  );
}

export function CommitDialog({ issueKey, onClose }: { issueKey: string; onClose: () => void }) {
  const sample = `git commit -m "${issueKey} "`;
  return (
    <Dialog title="Create commit" onClose={onClose}>
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
        Include the work-item key in your commit message to link it here.
      </p>
      <CopyRow label="Work-item key" value={issueKey} />
      <CopyRow label="Sample git commit" value={sample} mono />
    </Dialog>
  );
}

export function PrDialog({
  issueKey,
  repos,
  onClose,
}: {
  issueKey: string;
  repos: LinkedRepo[];
  onClose: () => void;
}) {
  const [repo, setRepo] = useState<LinkedRepo | null>(repos[0] ?? null);
  const [branch, setBranch] = useState(slugTitle(issueKey));
  const href = repo
    ? `https://github.com/${repo.repoFullName}/pull/new/${encodeURIComponent(branch)}?title=${encodeURIComponent(`${issueKey} `)}`
    : "#";
  return (
    <Dialog title="Create pull request" onClose={onClose}>
      {!repo ? (
        <p className="text-sm text-gray-500">No linked repositories yet.</p>
      ) : (
        <div className="space-y-3">
          <Labeled label="Repository">
            <select
              value={repo.repoId}
              onChange={(e) => setRepo(repos.find((r) => r.repoId === e.target.value) ?? null)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              {repos.map((r) => (
                <option key={r.repoId} value={r.repoId}>{r.repoFullName}</option>
              ))}
            </select>
          </Labeled>
          <Labeled label="From branch">
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 font-mono text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </Labeled>
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-600 px-3 py-1.5 text-sm text-white hover:bg-accent-700"
          >
            <GitPullRequest className="h-3.5 w-3.5" /> Open PR on GitHub
          </a>
          <p className="text-[11px] text-gray-400">
            Include <span className="font-mono">{issueKey}</span> in the PR title
            to link it back here (prefilled for you).
          </p>
        </div>
      )}
    </Dialog>
  );
}

export function OpenToolDialog({ repos, onClose }: { repos: LinkedRepo[]; onClose: () => void }) {
  const [repoFullName, setRepoFullName] = useState(repos[0]?.repoFullName ?? "");
  return (
    <Dialog title="Open in coding tool" onClose={onClose}>
      {repos.length === 0 ? (
        <p className="text-sm text-gray-500">No linked repositories yet.</p>
      ) : (
        <div className="space-y-3">
          <Labeled label="Repository">
            <select
              value={repoFullName}
              onChange={(e) => setRepoFullName(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              {repos.map((r) => (
                <option key={r.repoId} value={r.repoFullName}>{r.repoFullName}</option>
              ))}
            </select>
          </Labeled>
          <div className="grid grid-cols-2 gap-2">
            {CODING_TOOLS.map((t) => (
              <a
                key={t.label}
                href={t.href(repoFullName)}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-md border border-gray-200 px-3 py-2 text-center text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                {t.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-gray-700 dark:text-gray-300">{label}</span>
      {children}
    </label>
  );
}

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-2">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <code className={`flex-1 truncate rounded bg-gray-100 px-2 py-1.5 text-[13px] dark:bg-gray-900 ${mono ? "font-mono" : ""}`}>
          {value}
        </code>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
