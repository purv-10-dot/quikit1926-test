"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, Info } from "lucide-react";
import type { EditorDraft, StatusMeta, TransitionType } from "./editor-types";

/** Category → Jira-style status pill colours. */
function pillClass(category?: string): string {
  if (category === "IN_PROGRESS") return "bg-blue-100 text-blue-800";
  if (category === "DONE") return "bg-green-100 text-green-800";
  return "bg-gray-100 text-gray-700";
}

function StatusPill({ name, category }: { name: string; category?: string }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${pillClass(category)}`}>
      {name}
    </span>
  );
}

/** Close a popover when clicking outside its ref. */
function useClickOutside(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);
  return ref;
}

function Shell({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-lg bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * "Save as new workflow": snapshot the current workflow into a reusable org
 * template (name required + description). POSTs to /api/workflows.
 */
export function SaveAsNewWorkflowDialog({
  sourceWorkflowId,
  defaultName,
  onSaved,
  onClose,
}: {
  sourceWorkflowId: string;
  defaultName: string;
  onSaved: (created: { id: string; name: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return setError("Workflow name is required.");
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceWorkflowId, name: name.trim(), description: description.trim() || undefined }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to save");
      onSaved(j.data as { id: string; name: string });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  };

  return (
    <Shell title="Save as new workflow" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          The current changes will be saved to a new inactive workflow. You can activate the workflow
          by adding it to a workflow scheme.
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Workflow name <span className="text-red-500">*</span>
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Workflow description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full resize-none rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !name.trim()}
            className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Shell>
  );
}

/** Add-status: choose from the project statuses not already in the workflow. */
export function AddStatusDialog({
  poolStatuses,
  draft,
  onAdd,
  onClose,
}: {
  poolStatuses: StatusMeta[];
  draft: EditorDraft;
  onAdd: (statusId: string) => void;
  onClose: () => void;
}) {
  const inWorkflow = new Set(draft.statuses.map((s) => s.statusId));
  const available = poolStatuses.filter((s) => !inWorkflow.has(s.id));
  return (
    <Shell title="Add a status" onClose={onClose}>
      {available.length === 0 ? (
        <p className="text-sm text-gray-500">Every project status is already in this workflow.</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {available.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  onAdd(s.id);
                  onClose();
                }}
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-gray-100"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="font-medium text-gray-800">{s.name}</span>
                <span className="ml-auto text-[11px] text-gray-400">{s.category}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

/** Add-transition: From (multi, incl. Any status) → To, with a name + type. */
export function AddTransitionDialog({
  draft,
  statusMeta,
  onAdd,
  onClose,
  prefillFrom,
  prefillTo,
}: {
  draft: EditorDraft;
  statusMeta: Map<string, StatusMeta>;
  onAdd: (t: {
    name: string;
    type: TransitionType;
    toStatusId: string;
    fromStatusIds: string[];
  }) => void;
  onClose: () => void;
  /** Pre-fill From/To when opened by drawing an edge on the diagram. */
  prefillFrom?: string;
  prefillTo?: string;
}) {
  const nodes = draft.statuses;
  const [name, setName] = useState("");
  const [toStatusId, setToStatusId] = useState(prefillTo ?? nodes[0]?.statusId ?? "");
  const [anyStatus, setAnyStatus] = useState(false);
  const [fromIds, setFromIds] = useState<string[]>(prefillFrom ? [prefillFrom] : []);
  const [error, setError] = useState<string | null>(null);

  const toggleFrom = (id: string) =>
    setFromIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const fromRef = useClickOutside(fromOpen, () => setFromOpen(false));
  const toRef = useClickOutside(toOpen, () => setToOpen(false));

  const meta = (id: string) => statusMeta.get(id);
  const toMeta = toStatusId ? meta(toStatusId) : undefined;
  // Valid when a target is chosen and there's at least one source (or Any).
  const canCreate = !!toStatusId && (anyStatus || fromIds.length > 0);

  const submit = () => {
    if (!name.trim()) return setError("Name is required.");
    if (!toStatusId) return setError("Pick a target status.");
    if (!anyStatus && fromIds.length === 0)
      return setError("Pick at least one From status, or choose Any status.");
    onAdd({
      name: name.trim(),
      type: anyStatus ? "GLOBAL" : "NORMAL",
      toStatusId,
      fromStatusIds: anyStatus ? [] : fromIds,
    });
    onClose();
  };

  return (
    <Shell title="Create transition" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Transitions connect statuses. They represent actions people take to move work items through
          your workflow. They also appear as drop zones when people move cards across your project&apos;s
          board.
        </p>

        <div className="flex items-start gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-gray-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <span>To reuse a transition, edit the transition and select additional from statuses.</span>
        </div>

        {/* From → To, side by side with an arrow between. */}
        <div className="flex items-end gap-3">
          {/* From statuses — chip multi-select with an "Any status" option. */}
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">From statuses</label>
            <div className="relative" ref={fromRef}>
              <button
                type="button"
                onClick={() => setFromOpen((v) => !v)}
                className="flex min-h-[38px] w-full items-center gap-1 rounded border border-gray-300 px-2 py-1.5 text-left text-sm focus:border-accent-500 focus:outline-none"
              >
                <div className="flex flex-1 flex-wrap items-center gap-1">
                  {anyStatus ? (
                    <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                      Any status
                      <X
                        className="h-3 w-3 cursor-pointer text-gray-500 hover:text-gray-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAnyStatus(false);
                        }}
                      />
                    </span>
                  ) : fromIds.length === 0 ? (
                    <span className="text-gray-400">Select statuses</span>
                  ) : (
                    fromIds.map((id) => (
                      <span key={id} className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${pillClass(meta(id)?.category)}`}>
                        {meta(id)?.name ?? id}
                        <X
                          className="h-3 w-3 cursor-pointer opacity-60 hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFrom(id);
                          }}
                        />
                      </span>
                    ))
                  )}
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
              </button>
              {fromOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={anyStatus}
                      onChange={(e) => {
                        setAnyStatus(e.target.checked);
                        if (e.target.checked) setFromIds([]);
                      }}
                    />
                    <span className="text-gray-700">Any status</span>
                  </label>
                  {nodes.map((s) => (
                    <label
                      key={s.statusId}
                      className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 ${anyStatus ? "opacity-40" : ""}`}
                    >
                      <input
                        type="checkbox"
                        disabled={anyStatus}
                        checked={fromIds.includes(s.statusId)}
                        onChange={() => toggleFrom(s.statusId)}
                      />
                      <StatusPill name={meta(s.statusId)?.name ?? s.statusId} category={meta(s.statusId)?.category} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pb-2 text-gray-400">→</div>

          {/* To status — single-select pill dropdown with a clear button. */}
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">To status</label>
            <div className="relative" ref={toRef}>
              <button
                type="button"
                onClick={() => setToOpen((v) => !v)}
                className="flex min-h-[38px] w-full items-center gap-1 rounded border border-gray-300 px-2 py-1.5 text-left text-sm focus:border-accent-500 focus:outline-none"
              >
                <div className="flex-1">
                  {toMeta ? (
                    <StatusPill name={toMeta.name} category={toMeta.category} />
                  ) : (
                    <span className="text-gray-400">Select a status</span>
                  )}
                </div>
                {toStatusId && (
                  <X
                    className="h-4 w-4 shrink-0 cursor-pointer text-gray-400 hover:text-gray-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setToStatusId("");
                    }}
                  />
                )}
                <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
              </button>
              {toOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  {nodes.map((s) => (
                    <button
                      key={s.statusId}
                      type="button"
                      onClick={() => {
                        setToStatusId(s.statusId);
                        setToOpen(false);
                      }}
                      className={`flex w-full items-center px-3 py-1.5 text-left hover:bg-gray-50 ${s.statusId === toStatusId ? "bg-blue-50/60" : ""}`}
                    >
                      <StatusPill name={meta(s.statusId)?.name ?? s.statusId} category={meta(s.statusId)?.category} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Name + tip. */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Give your transition a name"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-400">
            Tip: Name your transition as an action people take to move an issue, like &quot;start work&quot; or &quot;merge&quot;.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canCreate || !name.trim()}
            className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </Shell>
  );
}
