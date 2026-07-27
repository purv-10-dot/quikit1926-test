"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Github, Plus } from "lucide-react";

/** A single dev item rendered inside the popover (branch / commit / PR). */
export interface DevPopoverItem {
  /** Bold heading, e.g. "#46289ba" or a branch/PR name. */
  heading: string;
  /** Secondary line, e.g. "Last updated about 1 hour ago". */
  meta?: string;
  /** Repository full name. */
  repo?: string;
  /** External link to open the item on GitHub. */
  url: string | null;
}

/**
 * Jira-style Development count row: "1 commit · 56 minutes ago" as a blue link.
 * Hovering the row reveals ↗ / + affordances and a popover card listing the
 * item(s) with heading + meta + repo + "View all development information".
 */
export function DevSummaryRow({
  icon: Icon,
  label,
  meta,
  kind,
  items,
  issueKey,
  onCreateBranch,
}: {
  icon: React.ElementType;
  label: string;
  meta?: string | null;
  /** Upper-cased section title inside the popover: BRANCH / COMMIT / PULL REQUEST. */
  kind: string;
  items: DevPopoverItem[];
  /** Work-item key, used to prefill the git create-branch command. */
  issueKey: string;
  /** Open the in-app "Create GitHub branch" dialog (from the + affordance). */
  onCreateBranch?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const first = items[0];

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-gray-50 dark:hover:bg-gray-800/50">
        <Icon className="h-4 w-4 text-accent-600 dark:text-accent-400" />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[13px] font-medium text-accent-600 hover:underline dark:text-accent-400"
        >
          {label}
        </button>
        {meta && <span className="text-[11px] text-gray-400">{meta}</span>}
        {/* Hover affordances mirror Jira's ↗ / + on the right of the row. */}
        <span
          className={`ml-auto flex items-center gap-1 transition-opacity ${
            createOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {first?.url && (
            <a
              href={first.url}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="Open on GitHub"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setCreateOpen((v) => !v);
            }}
            className={`rounded border p-0.5 ${
              createOpen
                ? "border-accent-400 text-accent-600 dark:text-accent-400"
                : "border-transparent text-gray-400 hover:border-gray-300 hover:text-gray-600 dark:hover:text-gray-200"
            }`}
            aria-label={`Add ${kind.toLowerCase()}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      {/* + popover — content matches the row's kind (branch/commit/PR). */}
      {createOpen && (
        <div className="absolute right-0 z-30 mt-1 w-80 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {kind === "Commit" ? (
            <>
              <p className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">Link commits to work items</p>
              <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">
                Include the key in your commit messages to link them here.
              </p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Copy key</p>
              <CopyCommand command={issueKey} />
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Copy sample Git commit</p>
              <CopyCommand command={`git commit -m "${issueKey} "`} />
            </>
          ) : kind === "Pull request" ? (
            <>
              <p className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">Create a pull request</p>
              <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">
                Open a PR on GitHub — include <span className="font-mono">{issueKey}</span> in the title to link it here.
              </p>
              {first?.repo && (
                <a
                  href={`https://github.com/${first.repo}/pulls`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-flex items-center gap-2 text-[13px] font-medium text-accent-600 hover:underline dark:text-accent-400"
                >
                  <Github className="h-4 w-4" /> Create pull request in GitHub
                </a>
              )}
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">Source code integration</p>
              {onCreateBranch ? (
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen(false);
                    onCreateBranch();
                  }}
                  className="mt-2 inline-flex items-center gap-2 text-[13px] font-medium text-accent-600 hover:underline dark:text-accent-400"
                >
                  <Github className="h-4 w-4" /> Create branch in GitHub
                </button>
              ) : (
                <a
                  href="/settings/integrations/github"
                  className="mt-2 inline-flex items-center gap-2 text-[13px] font-medium text-accent-600 hover:underline dark:text-accent-400"
                >
                  <Github className="h-4 w-4" /> Create branch in GitHub
                </a>
              )}
              <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Git create &amp; checkout a new branch
                </p>
                <CopyCommand command={`git checkout -b ${issueKey}-work`} />
              </div>
            </>
          )}
        </div>
      )}

      {open && !createOpen && items.length > 0 && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {items.slice(0, 5).map((it, i) => (
            <div key={i} className={i > 0 ? "mt-3 border-t border-gray-100 pt-3 dark:border-gray-800" : ""}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{kind}</p>
              {it.url ? (
                <a
                  href={it.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-0.5 block truncate text-[13px] font-semibold text-accent-600 hover:underline dark:text-accent-400"
                >
                  {it.heading}
                </a>
              ) : (
                <p className="mt-0.5 truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">{it.heading}</p>
              )}
              {it.meta && <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">{it.meta}</p>}
              {it.repo && (
                <p className="text-[12px] text-gray-500 dark:text-gray-400">
                  Repository: {it.repo}
                </p>
              )}
            </div>
          ))}
          <div className="mt-3 border-t border-gray-100 pt-2 dark:border-gray-800">
            <span className="text-[12px] text-accent-600 dark:text-accent-400">
              View all development information
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** A read-only command box with a copy button (Jira's git-command widget). */
function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1 flex items-center gap-2">
      <code className="flex-1 truncate rounded bg-gray-100 px-2 py-1.5 font-mono text-[12px] text-gray-800 dark:bg-gray-900 dark:text-gray-200">
        {command}
      </code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(command);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
        aria-label="Copy command"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
