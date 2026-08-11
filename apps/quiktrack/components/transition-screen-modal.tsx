"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface TransitionScreenField {
  key: string;
  label: string;
  kind: string; // "text" | "number" | "date" | "custom"
  required: boolean;
}
export interface TransitionScreenData {
  screenId: string;
  screenName: string;
  fields: TransitionScreenField[];
}

/**
 * The "Show a screen" modal shown before a gated transition completes. Renders
 * the screen's fields; the move is disabled until every required field has a
 * value. On submit it hands the collected values back as `inputs` for the move.
 */
export function TransitionScreenModal({
  screen,
  transitionName,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  screen: TransitionScreenData;
  transitionName: string;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (inputs: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const set = (key: string, v: string) => setValues((s) => ({ ...s, [key]: v }));

  const missingRequired = useMemo(
    () => screen.fields.some((f) => f.required && !((values[f.key] ?? "").trim())),
    [screen.fields, values],
  );

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
          <h3 className="text-base font-semibold text-gray-900">{transitionName || screen.screenName}</h3>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
          {screen.fields.length === 0 && (
            <p className="text-sm text-gray-500">This screen has no fields.</p>
          )}
          {screen.fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {f.label}{f.required && <span className="text-red-500"> *</span>}
              </label>
              {f.kind === "number" ? (
                <input type="number" value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none" />
              ) : f.kind === "date" ? (
                <input type="date" value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none" />
              ) : f.key === "description" ? (
                <textarea rows={4} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none" />
              ) : (
                <input value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none" />
              )}
            </div>
          ))}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onCancel} className="text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
          <button
            type="button"
            disabled={missingRequired || submitting}
            onClick={() => {
              // Map screen field keys to the move API's input keys.
              const inputs: Record<string, unknown> = {};
              for (const f of screen.fields) {
                const raw = (values[f.key] ?? "").trim();
                if (raw === "") continue;
                inputs[f.key] = f.kind === "number" ? Number(raw) : raw;
              }
              onSubmit(inputs);
            }}
            className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {transitionName || "Move"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
