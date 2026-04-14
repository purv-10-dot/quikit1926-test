"use client";

import { useState, useEffect } from "react";
import { useCreateWWW, useUpdateWWW } from "@/lib/hooks/useWWW";
import { useUsers } from "@/lib/hooks/useUsers";
import type { WWWItem } from "@/lib/types/www";
import { toDateInputValue } from "@/lib/utils/dateUtils";

import {
  STATUS_SELECT_OPTIONS,
  statusDotColor,
  statusLabel,
} from "@/lib/constants/status";


function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

type Tab = "edit" | "log";

interface Props {
  mode: "create" | "edit";
  item?: WWWItem;
  initialTab?: Tab;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Log Tab ──────────────────────────────────────────────────────────────────

function LogTab({ item, users }: { item: WWWItem; users: Array<{ id: string; firstName: string; lastName: string; email: string }> }) {
  const whoUser = users.find(u => u.id === item.who);
  const whoName = whoUser ? `${whoUser.firstName} ${whoUser.lastName}` : item.who;
  const sLabel = statusLabel(item.status);
  const statusColor = statusDotColor(item.status);

  return (
    <div className="space-y-5">
      {/* Summary card */}
      <div className="bg-gray-50 rounded-lg border border-gray-100 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Who</span>
            <p className="text-xs text-gray-800 font-medium mt-0.5">{whoName}</p>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${statusColor}`} />
              <span className="text-xs text-gray-800 font-medium">{sLabel}</span>
            </div>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Due Date</span>
            <p className="text-xs text-gray-800 mt-0.5">{formatDate(item.when)}</p>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Original Due Date</span>
            <p className="text-xs text-gray-800 mt-0.5">{formatDate(item.originalDueDate)}</p>
          </div>
        </div>

        <div>
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">What</span>
          <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap">{item.what}</p>
        </div>

        {item.notes && (
          <div>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Notes</span>
            <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap">{item.notes}</p>
          </div>
        )}
      </div>

      {/* Revised dates timeline */}
      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-2">Date History</h3>
        {(!item.revisedDates || item.revisedDates.length === 0) ? (
          <p className="text-xs text-gray-400 italic">No date revisions.</p>
        ) : (
          <div className="relative pl-5">
            {/* Timeline line */}
            <div className="absolute left-[7px] top-1 bottom-1 w-px bg-gray-200" />

            {/* Original date */}
            {item.originalDueDate && (
              <div className="relative flex items-start gap-3 pb-3">
                <div className="absolute left-[-13px] top-1 w-2 h-2 rounded-full bg-gray-300 ring-2 ring-white" />
                <div>
                  <p className="text-xs text-gray-700 font-medium">{formatDate(item.originalDueDate)}</p>
                  <p className="text-[10px] text-gray-400">Original due date</p>
                </div>
              </div>
            )}

            {/* Revised dates */}
            {item.revisedDates.map((rd, i) => (
              <div key={i} className="relative flex items-start gap-3 pb-3">
                <div className={`absolute left-[-13px] top-1 w-2 h-2 rounded-full ring-2 ring-white ${
                  i === item.revisedDates.length - 1 ? "bg-amber-400" : "bg-gray-300"
                }`} />
                <div>
                  <p className="text-xs text-gray-700 font-medium">{formatDate(rd)}</p>
                  <p className="text-[10px] text-gray-400">
                    Revised date {i + 1}{i === item.revisedDates.length - 1 ? " (latest)" : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="border-t border-gray-100 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[10px] text-gray-400">Created</span>
            <p className="text-[11px] text-gray-500">{formatDate(item.createdAt)}</p>
          </div>
          <div>
            <span className="text-[10px] text-gray-400">Last Updated</span>
            <p className="text-[11px] text-gray-500">{formatDate(item.updatedAt)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edit Tab ─────────────────────────────────────────────────────────────────

function EditTab({
  form,
  set,
  errors,
  users,
}: {
  form: { who: string; what: string; when: string; status: string; revisedDate: string; notes: string; originalDueDate: string };
  set: (key: string, val: string) => void;
  errors: Record<string, string>;
  users: Array<{ id: string; firstName: string; lastName: string; email: string }>;
}) {
  return (
    <div className="space-y-4">
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
            {STATUS_SELECT_OPTIONS.map(o => (
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
  );
}

// ── WWWPanel ─────────────────────────────────────────────────────────────────

export function WWWPanel({ mode, item, initialTab, onClose, onSuccess }: Props) {
  const [tab, setTab] = useState<Tab>(mode === "create" ? "edit" : (initialTab ?? "edit"));
  const { data: users = [] } = useUsers();
  const createWWW = useCreateWWW();
  const updateWWW = useUpdateWWW(item?.id ?? "");

  const [form, setForm] = useState({
    who: item?.who ?? "",
    what: item?.what ?? "",
    when: toDateInputValue(item?.when),
    status: item?.status ?? "not-yet-started",
    revisedDate: item?.revisedDates?.[item.revisedDates.length - 1]
      ? toDateInputValue(item.revisedDates[item.revisedDates.length - 1])
      : "",
    notes: item?.notes ?? "",
    originalDueDate: toDateInputValue(item?.originalDueDate),
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Re-populate when item changes (edit mode)
  useEffect(() => {
    if (item) {
      setForm({
        who: item.who,
        what: item.what,
        when: toDateInputValue(item.when),
        status: item.status,
        revisedDate: item.revisedDates?.length
          ? toDateInputValue(item.revisedDates[item.revisedDates.length - 1])
          : "",
        notes: item.notes ?? "",
        originalDueDate: toDateInputValue(item.originalDueDate),
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
    if (Object.keys(errs).length) { setErrors(errs); setTab("edit"); return; }
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

  const TABS: { key: Tab; label: string }[] =
    mode === "create"
      ? [{ key: "edit", label: "Edit" }]
      : [{ key: "log", label: "Log" }, { key: "edit", label: "Edit" }];

  const whoUser = users.find(u => u.id === (item?.who ?? form.who));
  const whoName = whoUser ? `${whoUser.firstName} ${whoUser.lastName}` : "";

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto h-full w-[520px] bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-sm font-semibold text-gray-800 truncate">
              {mode === "create" ? "Add New WWW Item" : (item?.what ?? "WWW Item")}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {whoName && <span className="text-[11px] text-gray-500">{whoName}</span>}
              {item && (
                <>
                  {whoName && <span className="text-gray-300">·</span>}
                  <span className="text-[11px] text-gray-400">Due {formatDate(item.when)}</span>
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex-shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs (only in edit mode — create only has the edit form) */}
        {TABS.length > 1 && (
          <div className="flex gap-0 px-6 border-b border-gray-200 flex-shrink-0">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-xs font-medium transition-colors relative ${
                  tab === t.key
                    ? "text-gray-900"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {t.label}
                {tab === t.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-t" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === "edit" && (
            <EditTab form={form} set={set} errors={errors} users={users} />
          )}
          {tab === "log" && item && (
            <LogTab item={item} users={users} />
          )}
        </div>

        {/* Footer — only show save buttons on edit tab (or create mode) */}
        {tab === "edit" && (
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
        )}
      </div>
    </div>
  );
}
