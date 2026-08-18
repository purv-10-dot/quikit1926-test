"use client";

import { useState } from "react";
import { Terminal, ChevronRight, X } from "lucide-react";
import { nodeMeta } from "@/lib/builder/node-meta";
import { cn } from "@/lib/utils";

export type ConsoleStatus = "idle" | "running" | "ok" | "error";

export interface ConsoleEntry {
  id: string;
  kind: string;
  label: string;
  status: ConsoleStatus;
  /** Short one-line detail shown next to the label (e.g. an action name). */
  detail?: string;
  /** Longer payload rendered in an expandable monospace block. */
  output?: unknown;
  error?: string;
}

const DOT: Record<ConsoleStatus, string> = {
  idle: "bg-gray-400",
  running: "bg-blue-500 animate-pulse",
  ok: "bg-green-500",
  error: "bg-red-500",
};

/**
 * Vertical run console — a right-hand column that stacks one entry per node
 * top-to-bottom with a status dot, kind icon, and an expandable output block.
 * Shared by the builder ("Test run") and the run-detail step timeline.
 */
export function RunConsole({
  entries,
  title = "Console",
  emptyHint = "Run a test to see the execution path here.",
  onClear,
  onClose,
  className,
}: {
  entries: ConsoleEntry[];
  title?: string;
  emptyHint?: string;
  onClear?: () => void;
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-2.5">
        <Terminal className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-semibold">{title}</span>
        <span className="ml-1 text-xs text-gray-400">{entries.length}</span>
        <div className="ml-auto flex items-center gap-1">
          {onClear && entries.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-[var(--color-bg-secondary)]"
            >
              Clear
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close console"
              className="rounded p-1 text-gray-400 hover:bg-[var(--color-bg-secondary)] hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">{emptyHint}</p>
      ) : (
        <ol className="flex flex-col gap-2 overflow-y-auto p-3">
          {entries.map((e, i) => (
            <ConsoleRow key={e.id} entry={e} index={i} />
          ))}
        </ol>
      )}
    </div>
  );
}

function ConsoleRow({ entry, index }: { entry: ConsoleEntry; index: number }) {
  const [open, setOpen] = useState(false);
  const meta = nodeMeta(entry.kind);
  const Icon = meta.icon;
  const hasBody =
    entry.error != null ||
    (entry.output != null && (typeof entry.output !== "object" || Object.keys(entry.output).length > 0));

  return (
    <li className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
      <button
        type="button"
        onClick={() => hasBody && setOpen((v) => !v)}
        className={cn("flex w-full items-center gap-2.5 px-3 py-2.5 text-left", hasBody ? "cursor-pointer" : "cursor-default")}
      >
        <span className="text-xs font-medium text-gray-400">{index + 1}</span>
        <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[entry.status])} />
        <Icon className="h-4 w-4 shrink-0 text-gray-500" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{entry.label}</span>
          {entry.detail ? <span className="block truncate text-xs text-gray-500">{entry.detail}</span> : null}
        </span>
        {hasBody ? (
          <ChevronRight className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform", open && "rotate-90")} />
        ) : null}
      </button>
      {open && hasBody ? (
        <div className="border-t border-[var(--color-border)] px-3 py-2">
          {entry.error ? <p className="mb-1 text-xs font-medium text-red-600">{entry.error}</p> : null}
          {entry.output != null ? (
            <pre className="overflow-x-auto rounded bg-[var(--color-bg-secondary)] p-2 font-mono text-xs text-gray-600">
              {typeof entry.output === "string" ? entry.output : JSON.stringify(entry.output, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
