"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pencil, ChevronDown } from "lucide-react";
import { ComboSelect, type ComboOption } from "./combo-select";

export interface BulkEditStatus {
  id: string;
  name: string;
  color?: string | null;
}
export interface BulkEditMember {
  userId: string;
  user: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
}
export interface BulkEditEpic {
  id: string;
  key: string;
  title: string;
}

const PRIORITIES = [
  { value: "HIGHEST", label: "Highest" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
  { value: "LOWEST", label: "Lowest" },
];

const UNCHANGED: ComboOption = { value: "", label: "— unchanged —" };
const NONE = "__none"; // sentinel: Unassigned / No epic (sets the field to null)

function memberName(m: BulkEditMember): string {
  const u = m.user;
  if (!u) return "Unknown";
  return [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;
}

/**
 * "Edit ▾" control for the backlog bulk-selection bar. Opens a small form where
 * each field defaults to "— unchanged —"; Apply emits a PATCH body containing
 * ONLY the fields the user set, which the parent applies to every selected issue.
 */
export function BulkEditPopover({
  statuses,
  members,
  epics,
  disabled,
  onApply,
}: {
  statuses: BulkEditStatus[];
  members: BulkEditMember[];
  epics: BulkEditEpic[];
  disabled?: boolean;
  onApply: (patch: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const [statusId, setStatusId] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("");
  const [epic, setEpic] = useState("");
  const [startDate, setStartDate] = useState("");
  const [clearStart, setClearStart] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [clearDue, setClearDue] = useState(false);
  const [eta, setEta] = useState("");

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const statusOptions = useMemo<ComboOption[]>(
    () => [UNCHANGED, ...statuses.map((s) => ({ value: s.id, label: s.name, color: s.color ?? null }))],
    [statuses],
  );
  const assigneeOptions = useMemo<ComboOption[]>(
    () => [
      UNCHANGED,
      { value: NONE, label: "Unassigned" },
      ...members.filter((m) => m.user).map((m) => ({ value: m.user!.id, label: memberName(m) })),
    ],
    [members],
  );
  const priorityOptions = useMemo<ComboOption[]>(
    () => [UNCHANGED, ...PRIORITIES],
    [],
  );
  const epicOptions = useMemo<ComboOption[]>(
    () => [
      UNCHANGED,
      { value: NONE, label: "None" },
      ...epics.map((e) => ({ value: e.id, label: `${e.key} · ${e.title}` })),
    ],
    [epics],
  );

  function reset() {
    setStatusId("");
    setAssignee("");
    setPriority("");
    setEpic("");
    setStartDate("");
    setClearStart(false);
    setDueDate("");
    setClearDue(false);
    setEta("");
  }

  function buildPatch(): Record<string, unknown> {
    const p: Record<string, unknown> = {};
    if (statusId) p.statusId = statusId;
    if (assignee) p.assigneeId = assignee === NONE ? null : assignee;
    if (priority) p.priority = priority;
    if (epic) p.epicId = epic === NONE ? null : epic;
    if (clearStart) p.startDate = null;
    else if (startDate) p.startDate = new Date(`${startDate}T00:00:00`).toISOString();
    if (clearDue) p.dueDate = null;
    else if (dueDate) p.dueDate = new Date(`${dueDate}T00:00:00`).toISOString();
    if (eta.trim() !== "") {
      const n = Number(eta);
      if (!Number.isNaN(n) && n >= 0) p.eta = n;
    }
    return p;
  }

  const patch = buildPatch();
  const hasChanges = Object.keys(patch).length > 0;

  function apply() {
    if (!hasChanges) return;
    onApply(patch);
    reset();
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-[300px] rounded-md border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <div className="space-y-2.5">
            <Field label="Status">
              <ComboSelect value={statusId} onChange={setStatusId} options={statusOptions} ariaLabel="Status" />
            </Field>
            <Field label="Assignee">
              <ComboSelect value={assignee} onChange={setAssignee} options={assigneeOptions} searchable ariaLabel="Assignee" />
            </Field>
            <Field label="Priority">
              <ComboSelect value={priority} onChange={setPriority} options={priorityOptions} ariaLabel="Priority" />
            </Field>
            <Field label="Epic">
              <ComboSelect value={epic} onChange={setEpic} options={epicOptions} searchable ariaLabel="Epic" />
            </Field>

            <DateField label="Start date" value={startDate} onChange={setStartDate} cleared={clearStart} onClear={setClearStart} />
            <DateField label="Due date" value={dueDate} onChange={setDueDate} cleared={clearDue} onClear={setClearDue} />

            <Field label="ETA (hrs)">
              <input
                type="number"
                min={0}
                step={0.5}
                value={eta}
                onChange={(e) => setEta(e.target.value)}
                placeholder="— unchanged —"
                className="h-8 w-full rounded border border-gray-300 px-2 text-xs text-gray-700 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
            </Field>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2 border-t border-gray-100 pt-2.5 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="rounded border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!hasChanges}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-gray-700 dark:disabled:text-gray-500"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-0.5 block text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</label>
      {children}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  cleared,
  onClear,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  cleared: boolean;
  onClear: (v: boolean) => void;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={value}
          disabled={cleared}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 flex-1 rounded border border-gray-300 px-2 text-xs text-gray-700 focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:disabled:bg-gray-900"
        />
        <label
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400"
          title="Remove this date from the selected issues"
        >
          <input
            type="checkbox"
            checked={cleared}
            onChange={(e) => onClear(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
          />
          Clear
        </label>
      </div>
    </div>
  );
}
