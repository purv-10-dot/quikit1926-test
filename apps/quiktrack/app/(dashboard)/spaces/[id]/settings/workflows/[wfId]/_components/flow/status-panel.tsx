"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { PanelSection } from "./panel-section";
import type { EditorDraft, EditorTransition, StatusMeta } from "../editor-types";

const CATEGORY_LABEL: Record<string, string> = {
  BACKLOG: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};
const CATEGORY_DOT: Record<string, string> = {
  BACKLOG: "bg-gray-400",
  IN_PROGRESS: "bg-blue-500",
  DONE: "bg-green-500",
};

/**
 * Right-hand Status editor (matches Jira's "Status" panel): name + category
 * (both persisted to the project status via PATCH), Incoming / Outgoing
 * transition lists, Properties (inert), and Remove. "Replace" is inert.
 */
export function StatusPanel({
  statusId,
  meta,
  draft,
  onRenamed,
  onRecategorised,
  onSelectTransition,
  onRemove,
}: {
  statusId: string;
  meta: StatusMeta | undefined;
  draft: EditorDraft;
  onRenamed: (name: string) => void;
  onRecategorised: (category: string) => void;
  onSelectTransition: (transitionId: string) => void;
  onRemove: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [editingCat, setEditingCat] = useState(false);
  const [name, setName] = useState(meta?.name ?? statusId);

  const incoming = draft.transitions.filter(
    (t) => t.toStatusId === statusId && t.type !== "GLOBAL",
  );
  const outgoing = draft.transitions.filter((t) => t.fromStatusIds.includes(statusId));
  const category = meta?.category ?? "BACKLOG";

  const TxnRow = ({ t }: { t: EditorTransition }) => (
    <button
      type="button"
      onClick={() => onSelectTransition(t.id)}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
    >
      <span className="truncate">{t.name}</span>
    </button>
  );

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-base font-semibold text-gray-900">Status</h2>
        <p className="mt-0.5 text-xs text-gray-500">Statuses capture the stages of your working process.</p>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-gray-700">Name</label>
            <button type="button" onClick={() => setEditingName((v) => !v)} className="text-gray-400 hover:text-gray-700">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
          {editingName ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => { setEditingName(false); if (name.trim() && name !== meta?.name) onRenamed(name.trim()); }}
              className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm"
            />
          ) : (
            <div className="text-sm text-gray-900">{meta?.name ?? statusId}</div>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-gray-700">Category</label>
            <button type="button" onClick={() => setEditingCat((v) => !v)} className="text-gray-400 hover:text-gray-700">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
          {editingCat ? (
            <select
              autoFocus
              value={category}
              onChange={(e) => { onRecategorised(e.target.value); setEditingCat(false); }}
              className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm"
            >
              <option value="BACKLOG">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="DONE">Done</option>
            </select>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-900">
              <span className={`h-2.5 w-2.5 rounded-sm ${CATEGORY_DOT[category]}`} />
              {CATEGORY_LABEL[category] ?? category}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-gray-700">Transitions</div>
          <p className="mb-2 text-xs text-gray-500">
            Transitions connect statuses. They represent actions people take to move work through your workflow.
          </p>
          <div className="space-y-2">
            <PanelSection title="Incoming" count={incoming.length}>
              {incoming.length ? incoming.map((t) => <TxnRow key={t.id} t={t} />) : <p className="text-xs text-gray-400">None.</p>}
            </PanelSection>
            <PanelSection title="Outgoing" count={outgoing.length}>
              {outgoing.length ? outgoing.map((t) => <TxnRow key={t.id} t={t} />) : <p className="text-xs text-gray-400">None.</p>}
            </PanelSection>
          </div>
        </div>

        <PanelSection title="Properties" badge="soon" disabled />
      </div>

      <div className="mt-auto flex gap-2 border-t border-gray-200 px-4 py-3">
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </button>
      </div>
    </aside>
  );
}
