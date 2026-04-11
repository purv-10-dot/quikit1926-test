"use client";

import { useState, useEffect } from "react";
import { useCreateWWW, useUpdateWWW } from "@/lib/hooks/useWWW";
import { useUsers } from "@/lib/hooks/useUsers";
import type { WWWItem } from "@/lib/types/www";

const STATUS_OPTIONS = [
  { value: "not-applicable", label: "Not Applicable" },
  { value: "not-yet-started", label: "Not Yet Started" },
  { value: "behind-schedule", label: "Behind Schedule" },
  { value: "on-track", label: "On Track" },
  { value: "completed", label: "Completed" },
];

function toDateInput(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

interface Props {
  mode: "create" | "edit";
  item?: WWWItem;
  onClose: () => void;
  onSuccess: () => void;
}

export function WWWPanel({ mode, item, onClose, onSuccess }: Props) {
  const { data: users = [] } = useUsers();
  const createWWW = useCreateWWW();
  const updateWWW = useUpdateWWW(item?.id ?? "");

  const [form, setForm] = useState({
    who: item?.who ?? "",
    what: item?.what ?? "",
    when: toDateInput(item?.when),
    status: item?.status ?? "not-yet-started",
    revisedDate: item?.revisedDates?.[item.revisedDates.length - 1]
      ? toDateInput(item.revisedDates[item.revisedDates.length - 1])
      : "",
    notes: item?.notes ?? "",
    originalDueDate: toDateInput(item?.originalDueDate),
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Re-populate when item changes (edit mode)
  useEffect(() => {
    if (item) {
      setForm({
        who: item.who,
        what: item.what,
        when: toDateInput(item.when),
        status: item.status,
        revisedDate: item.revisedDates?.length
          ? toDateInput(item.revisedDates[item.revisedDates.length - 1])
          : "",
        notes: item.notes ?? "",
        originalDueDate: toDateInput(item.originalDueDate),
      });
    }
  }, [item]);

  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => { const n = { ...e }; delete n[key]; return n; });
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.who) errs.who = "Who is required";
    if (!form.what.trim()) errs.what = "What is required";
    if (!form.when) errs.when = "When is required";
    return errs;
  }

  async function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const payload: Partial<WWWItem> = {
        who: form.who,
        what: form.what.trim(),
        when: form.when,
        status: form.status,
        notes: form.notes || null,
        originalDueDate: form.originalDueDate || null,
      };

      // If revised date set, append to revisedDates
      if (form.revisedDate) {
        const existing = item?.revisedDates ?? [];
        const lastEntry = existing[existing.length - 1];
        if (lastEntry !== form.revisedDate) {
          (payload as any).revisedDates = [...existing, form.revisedDate];
        } else {
          (payload as any).revisedDates = existing;
        }
      } else if (mode === "edit" && item) {
        (payload as any).revisedDates = item.revisedDates ?? [];
      }

      if (mode === "create") {
        await createWWW.mutateAsync(payload);
      } else {
        await updateWWW.mutateAsync(payload);
      }
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setErrors({ _: msg });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto h-full w-[520px] bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">
              {mode === "create" ? "Add New WWW Item" : "Edit WWW Item"}
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Who, What, When</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {errors._ && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
              {errors._}
            </div>
          )}

          {/* Row 1: Who? | When? */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Who? <span className="text-red-500">*</span>
              </label>
              <select
                value={form.who}
                onChange={e => set("who", e.target.value)}
                className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white ${errors.who ? "border-red-400" : "border-gray-200"}`}
              >
                <option value="">Select person…</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
              {errors.who && <p className="text-[10px] text-red-500 mt-0.5">{errors.who}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                When? <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.when}
                onChange={e => set("when", e.target.value)}
                className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 ${errors.when ? "border-red-400" : "border-gray-200"}`}
              />
              {errors.when && <p className="text-[10px] text-red-500 mt-0.5">{errors.when}</p>}
            </div>
          </div>

          {/* Row 2: What? (full width) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              What? <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.what}
              onChange={e => set("what", e.target.value)}
              rows={4}
              placeholder="Describe what needs to be done…"
              className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none ${errors.what ? "border-red-400" : "border-gray-200"}`}
            />
            {errors.what && <p className="text-[10px] text-red-500 mt-0.5">{errors.what}</p>}
          </div>

          {/* Row 3: Status | Revised Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Status <span className="text-red-500">*</span>
              </label>
              <select
                value={form.status}
                onChange={e => set("status", e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white"
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Revised Date</label>
              <input
                type="date"
                value={form.revisedDate}
                onChange={e => set("revisedDate", e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400"
              />
            </div>
          </div>

          {/* Row 4: Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              rows={2}
              placeholder="Additional notes…"
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving && (
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {mode === "create" ? "Create Item" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
