"use client";

import { useState } from "react";
import { Pencil, Trash2, Zap, Plus, ChevronDown, ChevronRight, Replace } from "lucide-react";
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

/** Jira-style status pill coloured by category. */
function pillClass(category?: string): string {
  if (category === "IN_PROGRESS") return "bg-blue-100 text-blue-800";
  if (category === "DONE") return "bg-green-100 text-green-800";
  return "bg-gray-100 text-gray-700";
}
function Pill({ name, category }: { name: string; category?: string }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${pillClass(category)}`}>
      {name}
    </span>
  );
}

/** A collapsible Incoming/Outgoing section with a + to add a transition. */
function TxnSection({
  title,
  count,
  onAdd,
  children,
}: {
  title: string;
  count: number;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-md border border-gray-200">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-gray-500 hover:text-gray-700">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className="text-sm font-medium text-gray-800">{title}</span>
        <span className="rounded bg-blue-50 px-1.5 text-[11px] font-medium text-blue-700">{count}</span>
        <button
          type="button"
          onClick={onAdd}
          className="ml-auto text-gray-400 hover:text-gray-700"
          aria-label={`Add ${title.toLowerCase()} transition`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {open && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </div>
  );
}

/**
 * Right-hand Status editor (matches Jira's "Status" panel): name + category
 * (both persisted to the project status via PATCH), Incoming / Outgoing
 * transition CARDS (⚡ name + From pills → To pill), + to add, Properties
 * (inert), Remove + Replace (Replace inert for now).
 */
export function StatusPanel({
  statusId,
  meta,
  draft,
  statusMeta,
  onEdit,
  onReplace,
  onSelectTransition,
  onAddIncoming,
  onAddOutgoing,
  onRemove,
}: {
  statusId: string;
  meta: StatusMeta | undefined;
  draft: EditorDraft;
  statusMeta: Map<string, StatusMeta>;
  /** Open the "Edit status" modal (from the Name/Category pencils). */
  onEdit: () => void;
  /** Open the "Replace status" modal. */
  onReplace: () => void;
  onSelectTransition: (transitionId: string) => void;
  /** Open the Create-transition dialog prefilled To = this status. */
  onAddIncoming: () => void;
  /** Open the Create-transition dialog prefilled From = this status. */
  onAddOutgoing: () => void;
  onRemove: () => void;
}) {
  // The initial status (the "Create" transition's target — shown as START) can't
  // be removed; a workflow must always have exactly one starting status.
  const isInitial = draft.statuses.some((s) => s.statusId === statusId && s.isInitial);
  const incoming = draft.transitions.filter(
    (t) => t.toStatusId === statusId && t.type !== "GLOBAL",
  );
  const outgoing = draft.transitions.filter((t) => t.fromStatusIds.includes(statusId));
  const category = meta?.category ?? "BACKLOG";
  const nameOf = (id: string) => statusMeta.get(id)?.name ?? id;
  const catOf = (id: string) => statusMeta.get(id)?.category;

  const TxnCard = ({ t }: { t: EditorTransition }) => (
    <button
      type="button"
      onClick={() => onSelectTransition(t.id)}
      className="block w-full rounded-md border border-gray-200 px-2.5 py-2 text-left hover:border-gray-300 hover:bg-gray-50"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-700">
        <Zap className="h-3 w-3 text-gray-500" fill="currentColor" /> {t.name}
      </span>
      <div className="mt-1.5 flex items-center gap-1.5">
        {t.type === "GLOBAL" || t.fromStatusIds.length === 0 ? (
          <span className="text-xs text-gray-500">{t.type === "INITIAL" ? "Start" : "Any"}</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {t.fromStatusIds.map((id) => (
              <Pill key={id} name={nameOf(id)} category={catOf(id)} />
            ))}
          </span>
        )}
        <span className="text-gray-400">→</span>
        <Pill name={nameOf(t.toStatusId)} category={catOf(t.toStatusId)} />
      </div>
    </button>
  );

  return (
    <aside className="flex min-h-0 w-[340px] shrink-0 flex-col self-stretch overflow-y-auto border-l border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-base font-semibold text-gray-900">Status</h2>
        <p className="mt-0.5 text-xs text-gray-500">Statuses capture the stages of your working process.</p>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-gray-700">Name</label>
            <button type="button" onClick={onEdit} className="text-gray-400 hover:text-gray-700" aria-label="Edit status">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="text-sm text-gray-900">{meta?.name ?? statusId}</div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-gray-700">Category</label>
            <button type="button" onClick={onEdit} className="text-gray-400 hover:text-gray-700" aria-label="Edit category">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-900">
            <span className={`h-2.5 w-2.5 rounded-full ${CATEGORY_DOT[category]}`} />
            {CATEGORY_LABEL[category] ?? category}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-gray-700">Transitions</div>
          <p className="mb-2 text-xs text-gray-500">
            Transitions connect statuses. They represent actions people take to move work items through your workflow.
          </p>
          <div className="space-y-3">
            <TxnSection title="Incoming" count={incoming.length} onAdd={onAddIncoming}>
              {incoming.length ? (
                incoming.map((t) => <TxnCard key={t.id} t={t} />)
              ) : (
                <p className="text-xs text-gray-400">No incoming transitions.</p>
              )}
            </TxnSection>
            <TxnSection title="Outgoing" count={outgoing.length} onAdd={onAddOutgoing}>
              {outgoing.length ? (
                outgoing.map((t) => <TxnCard key={t.id} t={t} />)
              ) : (
                <p className="text-xs text-gray-400">No outgoing transitions.</p>
              )}
            </TxnSection>
          </div>
        </div>

        {/* Properties — inert for now (parity with Jira's section header). */}
        <div className="rounded-md border border-gray-200">
          <div className="flex items-center gap-1.5 px-3 py-2">
            <span className="text-sm font-medium text-gray-800">Properties</span>
            <span className="ml-auto rounded bg-gray-100 px-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
              Soon
            </span>
          </div>
        </div>
      </div>

      <div className="mt-auto flex gap-2 border-t border-gray-200 px-4 py-3">
        <button
          type="button"
          onClick={onRemove}
          disabled={isInitial}
          title={isInitial ? "The initial status can't be removed" : undefined}
          className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-700"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </button>
        <button
          type="button"
          onClick={onReplace}
          className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
        >
          <Replace className="h-3.5 w-3.5" /> Replace
        </button>
      </div>
    </aside>
  );
}
