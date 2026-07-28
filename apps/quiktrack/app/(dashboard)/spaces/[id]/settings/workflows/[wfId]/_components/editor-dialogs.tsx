"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { EditorDraft, StatusMeta, TransitionType } from "./editor-types";

function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
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
}) {
  const nodes = draft.statuses;
  const [name, setName] = useState("");
  const [toStatusId, setToStatusId] = useState(nodes[0]?.statusId ?? "");
  const [anyStatus, setAnyStatus] = useState(false);
  const [fromIds, setFromIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const toggleFrom = (id: string) =>
    setFromIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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
    <Shell title="Create transition" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='e.g. "Start progress"'
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">From statuses</label>
          <label className="mb-1.5 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={anyStatus} onChange={(e) => setAnyStatus(e.target.checked)} />
            Any status (global transition)
          </label>
          {!anyStatus && (
            <div className="max-h-36 space-y-1 overflow-y-auto rounded border border-gray-200 p-2">
              {nodes.map((s) => (
                <label key={s.statusId} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={fromIds.includes(s.statusId)}
                    onChange={() => toggleFrom(s.statusId)}
                  />
                  {statusMeta.get(s.statusId)?.name ?? s.statusId}
                </label>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">To status</label>
          <select
            value={toStatusId}
            onChange={(e) => setToStatusId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {nodes.map((s) => (
              <option key={s.statusId} value={s.statusId}>
                {statusMeta.get(s.statusId)?.name ?? s.statusId}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
            Cancel
          </button>
          <button type="button" onClick={submit} className="rounded bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700">
            Create
          </button>
        </div>
      </div>
    </Shell>
  );
}
