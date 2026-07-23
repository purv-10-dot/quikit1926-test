"use client";

/**
 * SyncConfirmationModal — one reusable, content-driven dialog for BOTH category
 * synchronization flows:
 *
 *   type="replace"  → "Replace Existing Categories?"  (Cancel / Replace)
 *                     shows an old → new comparison for each affected category.
 *   type="append"   → "Add Updated Categories?"       (No / Yes)
 *                     shows a preview list of the new names to drop into empty
 *                     downstream rows.
 *
 * Only the copy + the change list differ; the component stays identical, so the
 * two flows never diverge. Fully controlled — the parent (`useCategorySync`)
 * owns open/close and the confirm/cancel handlers.
 */

import { ArrowRight, X, RefreshCw, Plus, AlertTriangle } from "lucide-react";

export type SyncModalType = "replace" | "append" | "warning";

export interface SyncChange {
  /** Present for `replace` (the outgoing name); omitted for `append`. */
  oldName?: string;
  /** The incoming / updated category name. */
  newName: string;
}

export interface SyncConfirmationModalProps {
  open: boolean;
  type: SyncModalType;
  title: string;
  message: string;
  changes: SyncChange[];
  /** Confirm button label. Defaults: "Replace" / "Yes". */
  confirmLabel?: string;
  /** Cancel button label. Defaults: "Cancel" / "No". */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SyncConfirmationModal({
  open,
  type,
  title,
  message,
  changes,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: SyncConfirmationModalProps) {
  if (!open) return null;

  const isReplace = type === "replace";
  const isWarning = type === "warning";
  const confirmText = confirmLabel ?? (isReplace ? "Replace" : isWarning ? "OK" : "Yes");
  const cancelText = cancelLabel ?? (isReplace ? "Cancel" : "No");
  const Icon = isReplace ? RefreshCw : isWarning ? AlertTriangle : Plus;
  // Replace + warning use the amber (caution) accent; append uses the brand accent.
  const amber = isReplace || isWarning;

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                amber ? "bg-amber-100 text-amber-600" : "bg-accent-100 text-accent-600"
              }`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
              <p className="mt-0.5 text-xs text-gray-500 leading-snug">{message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="ml-2 flex-shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Change list — a warning with no names shows message only. */}
        {changes.length > 0 && (
        <div className="px-5 py-4 overflow-y-auto">
          <ul className="space-y-2">
            {changes.map((c, i) => (
              <li
                key={`${c.oldName ?? ""}-${c.newName}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
              >
                {isReplace && c.oldName ? (
                  <>
                    <span className="min-w-0 flex-1 truncate rounded-md bg-rose-50 px-2 py-0.5 text-rose-700 border border-rose-200">
                      {c.oldName}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                    <span className="min-w-0 flex-1 truncate rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700 border border-emerald-200">
                      {c.newName}
                    </span>
                  </>
                ) : (
                  <span className="min-w-0 flex-1 truncate rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700 border border-emerald-200">
                    {c.newName}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        )}

        {/* Footer — warning is acknowledge-only (single OK); the other flows
            offer a cancel + a primary action. */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
          {!isWarning && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white ${
              amber ? "bg-amber-600 hover:bg-amber-700" : "bg-accent-600 hover:bg-accent-700"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
