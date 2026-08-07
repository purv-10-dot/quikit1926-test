"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Zap, ArrowRight } from "lucide-react";
import type { EditorDraft, EditorTransition, StatusMeta } from "./editor-types";

/**
 * Text (list) view of the workflow — Jira's "Status (ID) / Transitions (ID)"
 * table. Each status row lists the transitions that MOVE OUT of it (its
 * outgoing edges, plus INITIAL/GLOBAL that target it), each shown as
 * `[from pills] → [to pill]` with the transition's ⚡ name + index. Clicking a
 * transition selects it (opens the right panel); clicking a status selects it.
 */
function pillClass(category?: string): string {
  if (category === "IN_PROGRESS") return "bg-blue-100 text-blue-800";
  if (category === "DONE") return "bg-green-100 text-green-800";
  return "bg-gray-100 text-gray-700";
}

export function TextView({
  draft,
  statusMeta,
  selectedTransitionId,
  onSelectStatus,
  onSelectTransition,
}: {
  draft: EditorDraft;
  statusMeta: Map<string, StatusMeta>;
  selectedTransitionId?: string | null;
  onSelectStatus: (statusId: string) => void;
  onSelectTransition: (transitionId: string) => void;
}) {
  const nameOf = (id: string) => statusMeta.get(id)?.name ?? id;
  const catOf = (id: string) => statusMeta.get(id)?.category;
  // Stable per-transition index (Jira's "(1)", "(4)"…) — order in the draft.
  const indexOf = new Map(draft.transitions.map((t, i) => [t.id, i + 1] as const));

  const Pill = ({ id }: { id: string }) => (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${pillClass(catOf(id))}`}>
      {nameOf(id)}
    </span>
  );

  /** Transitions that move OUT of `statusId`: NORMAL edges whose from includes
   *  it, GLOBAL edges (available from any status), and the INITIAL edge if it
   *  targets this status. */
  const outgoingFor = (statusId: string): EditorTransition[] =>
    draft.transitions.filter(
      (t) =>
        (t.type === "NORMAL" && t.fromStatusIds.includes(statusId)) ||
        t.type === "GLOBAL" ||
        (t.type === "INITIAL" && t.toStatusId === statusId),
    );

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <th className="w-1/3 px-4 py-3">Status (ID)</th>
            <th className="px-4 py-3">Transitions (ID)</th>
          </tr>
        </thead>
        <tbody>
          {draft.statuses.map((s) => (
            <StatusRow
              key={s.statusId}
              statusId={s.statusId}
              isInitial={s.isInitial}
              transitions={outgoingFor(s.statusId)}
              nameOf={nameOf}
              Pill={Pill}
              indexOf={indexOf}
              selectedTransitionId={selectedTransitionId}
              onSelectStatus={onSelectStatus}
              onSelectTransition={onSelectTransition}
            />
          ))}
          {draft.statuses.length === 0 && (
            <tr>
              <td colSpan={2} className="px-4 py-8 text-center text-gray-400">
                No statuses yet — add one from the toolbar.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusRow({
  statusId,
  isInitial,
  transitions,
  nameOf,
  Pill,
  indexOf,
  selectedTransitionId,
  onSelectStatus,
  onSelectTransition,
}: {
  statusId: string;
  isInitial: boolean;
  transitions: EditorTransition[];
  nameOf: (id: string) => string;
  Pill: (p: { id: string }) => React.ReactElement;
  indexOf: Map<string, number>;
  selectedTransitionId?: string | null;
  onSelectStatus: (statusId: string) => void;
  onSelectTransition: (transitionId: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <tr className="border-b border-gray-100 align-top last:border-0">
      {/* Status cell */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-gray-400 hover:text-gray-700">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => onSelectStatus(statusId)}
            className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-gray-50"
          >
            <Pill id={statusId} />
            {isInitial && (
              <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-semibold text-white">START</span>
            )}
          </button>
        </div>
      </td>

      {/* Transitions cell */}
      <td className="px-4 py-3">
        {!open ? null : transitions.length === 0 ? (
          <span className="text-gray-400">—</span>
        ) : (
          <div className="space-y-3">
            {transitions.map((t) => {
              const selected = t.id === selectedTransitionId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTransition(t.id)}
                  className={`block w-full rounded-md px-2 py-1.5 text-left ${selected ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-gray-50"}`}
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-gray-500" fill="currentColor" />
                    <span className="text-sm font-semibold text-gray-800">{t.name}</span>
                    <span className="text-[11px] text-gray-400">({indexOf.get(t.id)})</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 pl-5">
                    {t.type === "INITIAL" ? (
                      <span className="text-xs text-gray-500">Start</span>
                    ) : t.type === "GLOBAL" ? (
                      <span className="text-xs text-gray-500">Any status</span>
                    ) : (
                      t.fromStatusIds.map((id) => <Pill key={id} id={id} />)
                    )}
                    <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                    <Pill id={t.toStatusId} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </td>
    </tr>
  );
}
