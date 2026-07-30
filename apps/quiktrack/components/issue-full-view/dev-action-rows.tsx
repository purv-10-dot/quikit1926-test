"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check, ChevronDown, ChevronRight, Copy, GitBranch, GitPullRequest, Github, Terminal,
} from "lucide-react";
import { BranchDialog, OpenToolDialog, PrDialog, type LinkedRepo } from "./development-dialogs";

async function fetchLinkedRepos(): Promise<LinkedRepo[]> {
  const r = await fetch("/api/integrations/github/repos");
  const j = await r.json();
  if (!r.ok || !j.success) return [];
  return (j.data.linked as LinkedRepo[]).filter((x) => x.isActive);
}

const rowCls =
  "inline-flex items-center gap-2 rounded px-1 py-1 text-[13px] font-medium text-accent-600 hover:text-accent-700 hover:underline dark:text-accent-400";

/** A plain blue link action row (e.g. Connect development tools). */
export function DevActionLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <a href={href} className={rowCls}>
      <Icon className="h-4 w-4" /> {label}
    </a>
  );
}

/** "Open in coding tool" row — opens the tool-picker dialog. */
export function OpenInToolRow() {
  const [open, setOpen] = useState(false);
  const { data: repos = [] } = useQuery({
    queryKey: ["quiktrack", "linked-repos-for-actions"],
    queryFn: fetchLinkedRepos,
    staleTime: 60_000,
  });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={rowCls}>
        <Terminal className="h-4 w-4" /> Open in coding tool
      </button>
      {open && <OpenToolDialog repos={repos} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Inline-expandable "Create branch" row (Jira: git checkout + Create in GitHub). */
export function CreateBranchRow({
  issueId, issueKey, onCreated,
}: {
  issueId: string; issueKey: string; onCreated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dialog, setDialog] = useState(false);
  const { data: repos = [] } = useQuery({
    queryKey: ["quiktrack", "linked-repos-for-actions"],
    queryFn: fetchLinkedRepos,
    staleTime: 60_000,
  });
  return (
    <div>
      <ExpandRow icon={GitBranch} label="Create branch" open={expanded} onToggle={() => setExpanded((v) => !v)} />
      {expanded && (
        <div className="ml-6 mt-1 rounded-md border border-gray-200 p-3 dark:border-gray-700">
          <p className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">Source code integration</p>
          <button type="button" onClick={() => setDialog(true)} className="mt-2 inline-flex items-center gap-2 text-[13px] font-medium text-accent-600 hover:underline dark:text-accent-400">
            <Github className="h-4 w-4" /> Create branch in GitHub
          </button>
          <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Git create &amp; checkout a new branch</p>
            <CopyBox value={`git checkout -b ${issueKey}-work`} />
          </div>
        </div>
      )}
      {dialog && (
        <BranchDialog
          issueId={issueId}
          issueKey={issueKey}
          repos={repos}
          onClose={() => setDialog(false)}
          onCreated={() => { setDialog(false); setExpanded(false); onCreated(); }}
        />
      )}
    </div>
  );
}

/** Inline-expandable "Create commit" row — Link-commits popover (Jira-exact). */
export function CreateCommitRow({ issueKey }: { issueKey: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <ExpandRow icon={Copy} label="Create commit" open={expanded} onToggle={() => setExpanded((v) => !v)} />
      {expanded && (
        <div className="ml-6 mt-1 rounded-md border border-gray-200 p-3 dark:border-gray-700">
          <p className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">Link commits to work items</p>
          <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">
            Include the key in your commit messages to link them to this work item.
          </p>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Copy key</p>
          <CopyBox value={issueKey} />
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Copy sample Git commit</p>
          <CopyBox value={`git commit -m "${issueKey} "`} />
        </div>
      )}
    </div>
  );
}

/** Inline-expandable "Create pull request" row — deep-links to GitHub's new-PR. */
export function CreatePrRow({ issueKey }: { issueKey: string }) {
  const [dialog, setDialog] = useState(false);
  const { data: repos = [] } = useQuery({
    queryKey: ["quiktrack", "linked-repos-for-actions"],
    queryFn: fetchLinkedRepos,
    staleTime: 60_000,
  });
  return (
    <>
      <button type="button" onClick={() => setDialog(true)} className={rowCls}>
        <GitPullRequest className="h-4 w-4" /> Create pull request
      </button>
      {dialog && <PrDialog issueKey={issueKey} repos={repos} onClose={() => setDialog(false)} />}
    </>
  );
}

function ExpandRow({
  icon: Icon, label, open, onToggle,
}: {
  icon: React.ElementType; label: string; open: boolean; onToggle: () => void;
}) {
  return (
    <button type="button" onClick={onToggle} className={`${rowCls} w-full justify-start`}>
      <Icon className="h-4 w-4" /> {label}
      <span className="ml-auto text-gray-400">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}

function CopyBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1 flex items-center gap-2">
      <code className="flex-1 truncate rounded bg-gray-100 px-2 py-1.5 font-mono text-[12px] text-gray-800 dark:bg-gray-900 dark:text-gray-200">{value}</code>
      <button
        type="button"
        onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
        aria-label="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
