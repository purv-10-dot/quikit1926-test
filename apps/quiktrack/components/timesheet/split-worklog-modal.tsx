"use client";
import { useEffect, useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { parseDurationToHours, formatHours } from "@/lib/utils/timesheetPeriod";
import { WorkItemPicker } from "./work-item-picker";
import type { EntryDetail } from "./worklog-popover";

interface ProjectOption { id: string; name: string }
interface IssueOption { id: string; key: string; title: string; type: string }

interface Props {
  entry: EntryDetail;
  lockedProjectId?: string;
  onClose: () => void;
  onSplit: () => void;
}

export function SplitWorklogModal({ entry, lockedProjectId, onClose, onSplit }: Props) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState(lockedProjectId ?? "");
  const [issues, setIssues] = useState<IssueOption[]>([]);
  const [issueId, setIssueId] = useState("");
  const [duration, setDuration] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (lockedProjectId) return;
    void fetch("/api/projects?pageSize=100&sort=name&order=asc")
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          setProjects(
            (j.data ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
          );
        }
      })
      .catch(() => undefined);
  }, [lockedProjectId]);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    void fetch(
      `/api/issues?projectId=${encodeURIComponent(projectId)}&excludeType=EPIC&limit=200`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j?.success) return;
        setIssues(
          (j.data ?? []).map((i: IssueOption) => ({
            id: i.id,
            key: i.key,
            title: i.title,
            type: i.type,
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [projectId]);

  async function handleSplit() {
    setError(null);
    if (!issueId) {
      setError("Pick a target work item.");
      return;
    }
    if (issueId === entry.issue?.id) {
      setError("Target work item must differ from the source.");
      return;
    }
    const moved = parseDurationToHours(duration);
    if (moved === null || moved <= 0) {
      setError("Enter a valid duration to move.");
      return;
    }
    if (moved >= entry.hours) {
      setError("Amount to move must be less than the original.");
      return;
    }
    setSubmitting(true);
    try {
      // 1) Reduce source.
      const reduceRes = await fetch(`/api/timesheets/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: entry.hours - moved }),
      }).then((r) => r.json());
      if (!reduceRes?.success) {
        setError(reduceRes?.error ?? "Failed to update source");
        return;
      }
      // 2) Create new entry on target.
      const createRes = await fetch("/api/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          issueId,
          entryDate: entry.entryDate,
          hours: moved,
          description: entry.description ?? undefined,
        }),
      }).then((r) => r.json());
      if (!createRes?.success) {
        // Roll back step 1.
        await fetch(`/api/timesheets/${entry.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hours: entry.hours }),
        }).catch(() => undefined);
        setError(createRes?.error ?? "Failed to create new entry");
        return;
      }
      onSplit();
    } finally {
      setSubmitting(false);
    }
  }

  const sourceLabel = entry.issue
    ? `${entry.issue.key} — ${entry.issue.title}`
    : "—";

  return (
    <div className="fixed inset-0 bg-black/50 z-[90] flex items-start justify-center pt-24 px-4">
      <div className="bg-white border border-gray-200 rounded-md shadow-xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Split time record</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="text-xs text-gray-500">
            <span className="font-semibold text-gray-700">Source:</span> {sourceLabel} ·{" "}
            <span className="font-semibold text-gray-700">{formatHours(entry.hours)}</span> on{" "}
            {new Date(entry.entryDate).toLocaleDateString(undefined, {
              day: "2-digit",
              month: "short",
            })}
          </div>

          {!lockedProjectId && (
            <Field label="Target project">
              <div className="relative">
                <select
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setIssueId("");
                  }}
                  className="w-full h-9 pl-3 pr-8 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
                >
                  <option value="">— Pick a project —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
              </div>
            </Field>
          )}

          <Field label="Target work item">
            <WorkItemPicker
              issues={issues}
              value={issueId}
              onChange={setIssueId}
              disabled={!projectId}
              projectId={projectId || undefined}
              onCreated={(issue) => setIssues((prev) => [issue, ...prev])}
            />
          </Field>

          <Field label="Time to move">
            <input
              autoFocus
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 1h 30m"
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </Field>
          <p className="text-[11px] text-gray-500">
            Must be less than the source total ({formatHours(entry.hours)}). The remainder stays on
            the source.
          </p>

          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-sm text-gray-700 rounded hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSplit()}
            disabled={submitting || !duration.trim() || !issueId}
            className="h-8 px-3 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
          >
            Split
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-700 block mb-1">{label}</span>
      {children}
    </label>
  );
}
