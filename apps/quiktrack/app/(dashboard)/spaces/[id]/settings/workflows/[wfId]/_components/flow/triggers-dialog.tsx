"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, GitPullRequest, GitBranch, GitCommit } from "lucide-react";
import { TRIGGER_CATALOG, type TriggerMeta } from "@/lib/services/workflow/triggers";

function TriggerIcon({ family }: { family: TriggerMeta["family"] }) {
  if (family === "branch") return <GitBranch className="h-4 w-4 text-gray-500" />;
  if (family === "commit") return <GitCommit className="h-4 w-4 text-gray-500" />;
  return <GitPullRequest className="h-4 w-4 text-gray-500" />;
}

/**
 * "Add triggers to <transition>" — the checkbox list of GitHub dev events that
 * auto-fire the transition. Only events QuikTrack actually receives are listed.
 */
export function TriggersDialog({
  transitionName,
  selected,
  onDone,
  onClose,
}: {
  transitionName: string;
  selected: string[];
  onDone: (events: string[]) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<Set<string>>(new Set(selected));
  const toggle = (event: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(event)) next.delete(event); else next.add(event);
      return next;
    });

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Add triggers to &quot;{transitionName}&quot; transition</h3>
            <p className="mt-1 text-xs text-gray-500">
              Triggers automatically transition work items when your team performs certain actions within their development tools.
            </p>
          </div>
          <button type="button" onClick={onClose} className="ml-3 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {TRIGGER_CATALOG.map((t) => (
            <label key={t.event} className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 px-4 py-3 hover:bg-gray-50">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gray-100">
                <TriggerIcon family={t.family} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900">{t.label}</span>
                <span className="block text-xs text-gray-500">{t.description}</span>
              </span>
              <input
                type="checkbox"
                checked={chosen.has(t.event)}
                onChange={() => toggle(t.event)}
                className="mt-1 text-accent-600 focus:ring-accent-500"
              />
            </label>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-3">
          <button type="button" onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
          <button
            type="button"
            onClick={() => onDone(Array.from(chosen))}
            className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
