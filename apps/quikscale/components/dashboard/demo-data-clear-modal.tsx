"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";

export interface DemoDataClearModalProps {
  open: boolean;
  onClose: () => void;
  onCleared: () => void;
}

const AFFECTED_MODULES = [
  "Org Setup (Teams, Unit Master)",
  "Individual & Team KPI",
  "Priority",
  "WWW",
  "Client Master, Client Members, Daily Huddle & Weekly Meeting",
  "OPSP (Create, History, Review, Category Master)",
  "Habits",
  "SWT",
  "Goals & Pillars",
  "FACe & PACe",
];

/**
 * Confirmation dialog for permanently deleting org demo/sample data.
 * Mirrors SyncConfirmationModal's structure (fixed-overlay dialog, amber
 * caution accent) but is self-contained since it owns its own fetch/loading
 * state rather than being driven by a parent hook.
 */
export function DemoDataClearModal({ open, onClose, onCleared }: DemoDataClearModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demo-data/clear", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Failed to clear demo data");
      }
      onCleared();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to clear demo data");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Clear demo data"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh] overflow-hidden">
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-start gap-3 min-w-0">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-900">Clear all demo data?</h2>
              <p className="mt-0.5 text-xs text-gray-500 leading-snug">
                This is sample/professional data shown only to help you explore QuikScale. It will be permanently
                deleted from every module below — your own real data is never affected. This cannot be undone.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-2 flex-shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          <ul className="grid grid-cols-1 gap-1.5 text-xs text-gray-600">
            {AFFECTED_MODULES.map((m) => (
              <li key={m} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-gray-400 flex-shrink-0" />
                {m}
              </li>
            ))}
          </ul>
          {error && <p className="mt-3 text-xs font-medium text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? "Clearing…" : "Clear All Demo Data"}
          </button>
        </div>
      </div>
    </div>
  );
}
