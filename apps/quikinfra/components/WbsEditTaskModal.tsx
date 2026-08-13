"use client";

import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { useEffect, useState } from "react";
import { Loader2, Pencil, Save, X } from "lucide-react";
import {
  Field,
  TextInput,
  NumberInput,
  SelectInput,
  RIGHT_DRAWER_BACKDROP,
  RIGHT_DRAWER_FRAME,
  RIGHT_DRAWER_PANEL,
} from "@/components/FormDrawer";
import { useUpdateWbsTask, type WbsTask } from "@/hooks/use-wbs";
import { validateDateRange } from "@/lib/validators";

type WbsStatus = WbsTask["status"];

const STATUS_OPTIONS: Array<{ value: WbsStatus; label: string }> = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
];

export function WbsEditTaskModal({
  open,
  projectId,
  task,
  allTasks,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  task: WbsTask | null;
  allTasks: WbsTask[];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const updateTask = useUpdateWbsTask(projectId);

  const [parentId, setParentId] = useState<string>("");
  const [wbsCode, setWbsCode] = useState("");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<WbsStatus>("not_started");
  const [progress, setProgress] = useState("0");
  const [predecessors, setPredecessors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) return;
    setParentId(task.parentId ?? "");
    setWbsCode(task.wbsCode);
    setName(task.name);
    setStartDate(task.startDate);
    setEndDate(task.endDate);
    setStatus(task.status);
    setProgress(String(task.progress));
    setPredecessors(task.predecessors ?? []);
    setError(null);
  }, [task]);

  if (!open || !task) return null;

  const parentOptions = [
    { value: "", label: "-- Root Level --" },
    ...allTasks
      .filter((t) => t.id !== task.id)
      .map((t) => ({ value: t.id, label: `${t.wbsCode} - ${t.name}` })),
  ];
  const predecessorOptions = allTasks
    .filter((t) => t.id !== task.id)
    .map((t) => ({ value: t.id, label: `${t.wbsCode} - ${t.name}` }));
  // Tasks still selectable as a predecessor — excludes ones already chosen.
  const availablePredecessors = predecessorOptions.filter(
    (o) => !predecessors.includes(o.value),
  );

  // Mirrors the server rule in updateWbsTask — end may equal start (a
  // zero-duration task) but never precede it. Surfacing it inline matters here:
  // the range was already part of `canSave`, so an invalid pair silently greyed
  // out Save with nothing to tell the user why.
  const dateRangeError = validateDateRange(startDate, endDate, "End date");
  const endDateError = dateRangeError.valid ? undefined : dateRangeError.error;

  const canSave =
    name.trim().length > 0 &&
    wbsCode.trim().length > 0 &&
    !!startDate &&
    !!endDate &&
    !endDateError;

  const handleSave = async () => {
    if (!canSave) return;
    setError(null);
    try {
      await updateTask.mutateAsync({
        id: task.id,
        parentId: parentId ? parentId : null,
        wbsCode: wbsCode.trim(),
        name: name.trim(),
        startDate,
        endDate,
        status,
        progress: Math.max(0, Math.min(100, Number(progress) || 0)),
        predecessors,
      });
      onSaved?.();
      onClose();
    } catch (e: unknown) {
      setError(toErrorMessage(e, "Failed to save task"));
    }
  };

  return (
    <>
      <div className={RIGHT_DRAWER_BACKDROP} onClick={onClose} />
      <div className={RIGHT_DRAWER_FRAME}>
        <div className={`${RIGHT_DRAWER_PANEL} max-w-xl`}>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-30 rounded-lg bg-white/90 p-2 text-slate-400 shadow-sm ring-1 ring-slate-200/60 backdrop-blur-sm transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <div
              aria-hidden
              className="h-1 w-full bg-gradient-to-r from-accent-400 via-accent-500 to-accent-600"
            />
            <div className="flex items-center gap-3 px-6 py-4 pr-14 border-b border-slate-200 bg-white">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-accent-50 text-accent-600 ring-1 ring-accent-200 shrink-0">
                <Pencil className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900 truncate">
                  Edit Task
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {task.wbsCode}
                </p>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Parent Level">
                  <SelectInput
                    value={parentId}
                    onChange={setParentId}
                    options={parentOptions}
                  />
                </Field>
                <Field label="WBS Code" required>
                  <TextInput
                    value={wbsCode}
                    onChange={setWbsCode}
                    placeholder="e.g. 1.1.2"
                  />
                </Field>

                <div className="col-span-2">
                  <Field label="Task Name" required>
                    <TextInput
                      value={name}
                      onChange={setName}
                      placeholder="Task description"
                    />
                  </Field>
                </div>

                <Field label="Start Date" required>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400"
                  />
                </Field>
                <Field label="End Date" required error={endDateError}>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    aria-invalid={!!endDateError}
                    className={`w-full h-9 px-2.5 text-sm border rounded-md bg-white focus:outline-none focus:ring-2 ${
                      endDateError
                        ? "border-rose-300 focus:ring-rose-200 focus:border-rose-400"
                        : "border-slate-300 focus:ring-accent-200 focus:border-accent-400"
                    }`}
                  />
                </Field>

                <Field label="Status">
                  <SelectInput
                    value={status}
                    onChange={(v) => setStatus(v as WbsStatus)}
                    options={STATUS_OPTIONS}
                  />
                </Field>
                <Field label="Progress (%)">
                  <NumberInput
                    value={progress}
                    onChange={setProgress}
                    min={0}
                    max={100}
                    placeholder="0"
                  />
                </Field>

                <div className="col-span-2">
                  <Field
                    label="Predecessors (Dependencies)"
                    hint="Tasks that must finish before this one can start."
                  >
                    {/* Selected predecessors only — a task with none (e.g. the
                        root) shows nothing. Pick from the Add control to attach
                        one; remove with the × on each chip. */}
                    {predecessors.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {predecessors.map((pid) => {
                          const opt = predecessorOptions.find(
                            (o) => o.value === pid,
                          );
                          return (
                            <span
                              key={pid}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent-50 text-accent-700 text-xs font-medium border border-accent-200"
                            >
                              {opt?.label ?? pid}
                              <button
                                type="button"
                                aria-label="Remove predecessor"
                                onClick={() =>
                                  setPredecessors(
                                    predecessors.filter((x) => x !== pid),
                                  )
                                }
                                className="text-accent-400 hover:text-accent-700 leading-none text-sm"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic mb-2">
                        No dependencies — this task has no predecessors.
                      </p>
                    )}
                    {availablePredecessors.length > 0 ? (
                      <select
                        value=""
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v && !predecessors.includes(v)) {
                            setPredecessors([...predecessors, v]);
                          }
                        }}
                        className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400"
                      >
                        <option value="">+ Add a predecessor…</option>
                        {availablePredecessors.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-slate-400">
                        {predecessorOptions.length === 0
                          ? "No other tasks available."
                          : "All available tasks have been added."}
                      </p>
                    )}
                  </Field>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3 shrink-0 bg-slate-50">
            <button
              type="button"
              onClick={onClose}
              disabled={updateTask.isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || updateTask.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-b from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors"
            >
              {updateTask.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
