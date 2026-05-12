"use client";

import { useEffect, useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { parseDurationToHours, formatHours } from "@/lib/utils/timesheetPeriod";
import { WorkItemPicker } from "./work-item-picker";

interface ProjectOption {
  id: string;
  name: string;
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
  const [duration, setDuration] = useState("");
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
        setDuration(formatHours(e.hours));
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
          const list = (j.data ?? []).map((p: { id: string; name: string }) => ({
            id: p.id,
            name: p.name,
          }));
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
    const hours = parseDurationToHours(duration);
    if (hours === null || hours <= 0) {
      setError("Enter a valid duration (e.g. 2h 30m).");
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
          {!lockedProjectId && (
            <Field label="Project">
              <Select
                value={projectId}
                onChange={(v) => {
                  setProjectId(v);
                  setIssueId("");
                }}
              >
                <option value="">— Pick a project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Work item">
            {lockedIssueId ? (
              <div className="w-full h-9 px-3 inline-flex items-center text-sm text-gray-800 border border-gray-200 rounded bg-gray-50">
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
                placeholder="e.g. 2h 30m"
                className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </Field>
          </div>
          <p className="text-[11px] text-gray-500">
            Format: 2w 4d 6h 45m. w = weeks, d = days, h = hours, m = minutes.
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
            disabled={submitting || !duration.trim() || !issueId}
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

function Select({
  value,
  onChange,
  disabled,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full h-9 pl-3 pr-8 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white disabled:bg-gray-50 disabled:text-gray-400"
      >
        {children}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
    </div>
  );
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
