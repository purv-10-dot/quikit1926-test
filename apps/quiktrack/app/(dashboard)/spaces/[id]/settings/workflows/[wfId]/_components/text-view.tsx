"use client";

import { Trash2, Flag } from "lucide-react";
import type { EditorDraft, StatusMeta } from "./editor-types";

/**
 * Text (list) view of the workflow: each status with its incoming transitions
 * shown as FROM → TO rows, mirroring Jira's "Status (ID) / Transitions (ID)"
 * table. Add/remove happen via the toolbar dialogs; this view offers per-row
 * delete + set-initial and lists the transitions.
 */
export function TextView({
  draft,
  statusMeta,
  onRemoveStatus,
  onSetInitial,
  onRemoveTransition,
}: {
  draft: EditorDraft;
  statusMeta: Map<string, StatusMeta>;
  onRemoveStatus: (statusId: string) => void;
  onSetInitial: (statusId: string) => void;
  onRemoveTransition: (id: string) => void;
}) {
  const nameOf = (id: string) => statusMeta.get(id)?.name ?? id;

  return (
    <div className="h-full overflow-auto p-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-600">
            <th className="w-1/3 py-2 font-medium">Status</th>
            <th className="py-2 font-medium">Transitions</th>
          </tr>
        </thead>
        <tbody>
          {draft.statuses.map((s) => {
            const incoming = draft.transitions.filter((t) => t.toStatusId === s.statusId);
            return (
              <tr key={s.statusId} className="border-b border-gray-100 align-top last:border-0">
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: statusMeta.get(s.statusId)?.color ?? "#94a3b8" }}
                    />
                    <span className="font-medium text-gray-900">{nameOf(s.statusId)}</span>
                    {s.isInitial && (
                      <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        START
                      </span>
                    )}
                    <span className="ml-1 text-[11px] text-gray-400">
                      {statusMeta.get(s.statusId)?.category}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      {!s.isInitial && (
                        <button
                          type="button"
                          title="Make initial status"
                          onClick={() => onSetInitial(s.statusId)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        >
                          <Flag className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        title="Remove status from workflow"
                        onClick={() => onRemoveStatus(s.statusId)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </td>
                <td className="py-3">
                  {incoming.length === 0 ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <ul className="space-y-1.5">
                      {incoming.map((t) => (
                        <li key={t.id} className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">{t.name}</span>
                          <span className="text-gray-400">
                            {t.type === "GLOBAL"
                              ? "Any status"
                              : t.type === "INITIAL"
                                ? "Create"
                                : t.fromStatusIds.map(nameOf).join(", ")}
                          </span>
                          <span className="text-gray-400">→ {nameOf(t.toStatusId)}</span>
                          <button
                            type="button"
                            onClick={() => onRemoveTransition(t.id)}
                            className="ml-1 rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-600"
                            title="Delete transition"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
          {draft.statuses.length === 0 && (
            <tr>
              <td colSpan={2} className="py-6 text-center text-gray-400">
                No statuses yet — add one from the toolbar.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
