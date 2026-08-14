"use client";

/**
 * MOCK-DATA PREVIEW — embedded in the real Critical Numbers page
 * (critical-numbers/page.tsx), pending real API wiring.
 *
 * Mirrors the real `components/AddUpdateModal.tsx` field-for-field (same
 * Date/Value/Comment layout, same copy, same button states) but can't BE
 * that component — it hard-calls `useAddCriticalNumberUpdate`, a real POST.
 * This one calls a local `onSubmit` instead, so the popup can append the
 * reading to its own mock history with no network call, per "mock data
 * only, don't wire the real API yet."
 */

import { useState } from "react";
import { X } from "lucide-react";

const INPUT =
  "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent";
const LABEL = "block text-sm font-medium text-gray-700 mb-1.5";

function todayInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface MockUpdateEntry {
  date: string;
  value: number;
  comment: string | null;
}

interface Props {
  title: string;
  onSubmit: (entry: MockUpdateEntry) => void;
  onClose: () => void;
}

export function MockAddUpdateModal({ title, onSubmit, onClose }: Props) {
  const [date, setDate] = useState(todayInputValue());
  const [value, setValue] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const num = Number(value);
    if (value.trim() === "" || !Number.isFinite(num)) {
      setError("Enter a number");
      return;
    }
    if (!date) {
      setError("Pick a date");
      return;
    }
    onSubmit({ date, value: num, comment: comment.trim() || null });
  }

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-start justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">Add update</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={LABEL}>
              Date <span className="text-red-500">*</span>
            </label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
            <p className="text-[11px] text-gray-400 mt-1">
              Backdating is fine — it won&apos;t overwrite a newer reading.
            </p>
          </div>
          <div>
            <label className={LABEL}>
              Value <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              className={INPUT}
              autoFocus
            />
          </div>
          <div>
            <label className={LABEL}>Comment</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Optional context for this reading…"
              className={`${INPUT} resize-none`}
            />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
            >
              Record update
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
