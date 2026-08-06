"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { parseClockToHours, formatHoursAsClock } from "@/lib/utils/timesheetPeriod";
import { WorkItemPicker } from "./work-item-picker";
import { ProjectPicker } from "./project-picker";

interface ProjectOption {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}
interface IssueOption {
  id: string;
  key: string;
  title: string;
  type: string;
}

export function LogTimeModal({
  lockedProjectId,
  lockedDate,
  lockedIssueId,
  lockedIssueLabel,
  editEntryId,
  onClose,
  onLogged,
}: {
  lockedProjectId?: string;
  lockedDate?: Date;
  lockedIssueId?: string;
  lockedIssueLabel?: string;
  editEntryId?: string;
  onClose: () => void;
  onLogged: () => void;
}) {
  const isEdit = Boolean(editEntryId);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState(lockedProjectId ?? "");
  const [issues, setIssues] = useState<IssueOption[]>([]);
  const [issueId, setIssueId] = useState(lockedIssueId ?? "");
  const [date, setDate] = useState(() => toDateInput(lockedDate ?? new Date()));
  // Clock-style time-spent field. Defaults to a real "00:00" value (not just a
  // placeholder) and always normalizes back to HH:MM on blur.
  const [duration, setDuration] = useState("00:00");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Prefill from existing entry when editing.
  useEffect(() => {
    if (!editEntryId) return;
    let alive = true;
    void fetch(`/api/timesheets/${editEntryId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j?.success) return;
        const e = j.data as {
          projectId: string; issueId: string; entryDate: string;
          hours: number; description: string | null;
        };
        setProjectId(e.projectId);
        setIssueId(e.issueId);
        setDate(toDateInput(new Date(e.entryDate)));
        setDuration(formatHoursAsClock(e.hours));
        setDescription(e.description ?? "");
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [editEntryId]);

  // Load projects when no project is locked.
  useEffect(() => {
    if (lockedProjectId) return;
    void fetch("/api/projects?pageSize=100&sort=name&order=asc")
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          const list = (j.data ?? []).map(
            (p: { id: string; name: string; icon?: string | null; color?: string | null }) => ({
              id: p.id,
              name: p.name,
              icon: p.icon ?? null,
              color: p.color ?? null,
            }),
          );
          setProjects(list);
        }
      })
      .catch(() => undefined);
  }, [lockedProjectId]);

  // Load issues for the active project (skip when issue is locked).
  useEffect(() => {
    if (!projectId) return;
    if (lockedIssueId) return;
    let alive = true;
    void fetch(
      `/api/issues?projectId=${encodeURIComponent(projectId)}&excludeType=EPIC&limit=200`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j?.success) return;
        const list = (j.data ?? []).map((i: IssueOption) => ({
          id: i.id,
          key: i.key,
          title: i.title,
          type: i.type,
        }));
        setIssues(list);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [projectId, lockedIssueId]);

  async function save() {
    setError(null);
    if (!issueId) {
      setError("Pick a work item to log time against.");
      return;
    }
    const hours = parseClockToHours(duration);
    if (hours === null || hours <= 0) {
      setError("Enter a valid time (e.g. 01:30, or 1.5 for 1h 30m).");
      return;
    }
    setSubmitting(true);
    try {
      const url = isEdit ? `/api/timesheets/${editEntryId}` : "/api/timesheets";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId, issueId,
          entryDate: new Date(date).toISOString(),
          hours,
          description: description.trim() || (isEdit ? null : undefined),
        }),
      }).then((r) => r.json());
      if (!res?.success) {
        setError(res?.error ?? "Failed to log time");
        return;
      }
      onLogged();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-start justify-center pt-24 px-4">
      <div className="bg-white border border-gray-200 rounded-md shadow-xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">
            {isEdit ? "Edit time record" : "Log time"}
          </h3>
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
          {/* The project is only chosen when picking a work item from scratch.
              When a work item is preset (inline add from a timesheet row), it
              already determines the project — the API derives projectId from the
              issue on save — so the picker would be redundant and is hidden. */}
          {!lockedProjectId && !lockedIssueId && (
            <Field label="Project">
              <ProjectPicker
                projects={projects}
                value={projectId}
                onChange={(v) => {
                  setProjectId(v);
                  setIssueId("");
                }}
              />
            </Field>
          )}

          <Field label="Work item">
            {lockedIssueId ? (
              <div className="w-full min-h-9 px-3 py-2 flex items-start text-sm leading-snug text-gray-800 border border-gray-200 rounded bg-gray-50 break-words">
                {lockedIssueLabel ?? lockedIssueId}
              </div>
            ) : (
              <WorkItemPicker
                issues={issues}
                value={issueId}
                onChange={setIssueId}
                disabled={!projectId}
                projectId={projectId || undefined}
                onCreated={(issue) => setIssues((prev) => [issue, ...prev])}
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            {!lockedDate && (
              <Field label="Date">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </Field>
            )}
            <Field label="Time spent">
              <input
                autoFocus
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={() => {
                  // Snap to HH:MM on blur: "1" → "01:00", "1.5" → "01:30",
                  // "1:30" → "01:30". Anything unparseable falls back to
                  // "00:00" so the field always shows a valid clock value.
                  const h = parseClockToHours(duration);
                  setDuration(h !== null && h > 0 ? formatHoursAsClock(h) : "00:00");
                }}
                inputMode="decimal"
                className={`w-full h-9 px-3 text-sm tabular-nums tracking-wide border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  duration === "00:00" ? "text-gray-400" : "text-gray-900"
                }`}
              />
            </Field>
          </div>
          <p className="text-[11px] text-gray-500">
            Format HH:MM. Type 1 for 01:00, 1.5 for 01:30, or enter 01:30 directly.
          </p>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on? (optional)"
              rows={3}
              maxLength={2000}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
            />
          </Field>

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
            onClick={() => void save()}
            disabled={submitting || (parseClockToHours(duration) ?? 0) <= 0 || !issueId}
            className="h-8 px-3 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
          >
            {isEdit ? "Update" : "Save"}
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

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
