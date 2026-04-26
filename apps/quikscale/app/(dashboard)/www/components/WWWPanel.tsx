"use client";

import { useState, useEffect } from "react";
import { useCreateWWW, useUpdateWWW } from "@/lib/hooks/useWWW";
import { useUsers } from "@/lib/hooks/useUsers";
import { useCanEditWWW } from "@/lib/hooks/useCanEditWWW";
import type { WWWItem } from "@/lib/types/www";
import { toDateInputValue } from "@/lib/utils/dateUtils";

import {
  STATUS_SELECT_OPTIONS,
  statusDotColor,
  statusLabel,
} from "@/lib/constants/status";
import { WWW_CATEGORIES } from "@/lib/schemas/wwwSchema";
import {
  RightPanel,
  RightPanelFooter,
  RightPanelCancelButton,
  RightPanelSubmitButton,
} from "@quikit/ui";


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
  /**
   * When true, shows ONLY the Log tab (summary + revised-date timeline).
   * Hides the Edit tab, tab bar, and Save/Cancel footer. Triggered by the
   * log-icon click in WWWTable.
   */
  logsOnly?: boolean;
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
  mode,
  readOnly,
  itemId,
}: {
  form: { who: string; what: string; when: string; status: string; revisedDate: string; notes: string; category: string; originalDueDate: string };
  set: (key: string, val: string) => void;
  errors: Record<string, string>;
  users: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  mode: "create" | "edit";
  readOnly: boolean;
  itemId?: string;
}) {
  return (
    <div className="space-y-4">
      {errors._ && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
          {errors._}
        </div>
      )}

      {readOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
          Read-only — only the creator, assignee, or an admin can edit this item.
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
            disabled={readOnly}
            className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white disabled:bg-gray-50 disabled:text-gray-500 ${errors.who ? "border-red-400" : "border-gray-200"}`}
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
            disabled={readOnly}
            className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:bg-gray-50 disabled:text-gray-500 ${errors.when ? "border-red-400" : "border-gray-200"}`}
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
          disabled={readOnly}
          className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none disabled:bg-gray-50 disabled:text-gray-500 ${errors.what ? "border-red-400" : "border-gray-200"}`}
        />
        {errors.what && <p className="text-[10px] text-red-500 mt-0.5">{errors.what}</p>}
      </div>

      {/* Row 3: Status | Revised Date (edit mode only — revised date hidden on create) */}
      <div className={mode === "edit" ? "grid grid-cols-2 gap-4" : ""}>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Status <span className="text-red-500">*</span>
          </label>
          <select
            value={form.status}
            onChange={e => set("status", e.target.value)}
            disabled={readOnly}
            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white disabled:bg-gray-50 disabled:text-gray-500"
          >
            {STATUS_SELECT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {mode === "edit" && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Revised Date</label>
            <input
              type="date"
              value={form.revisedDate}
              min={form.when || undefined}
              onChange={e => set("revisedDate", e.target.value)}
              disabled={readOnly}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:bg-gray-50 disabled:text-gray-500"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">
              Must be on or after the When date ({form.when || "—"}).
            </p>
          </div>
        )}
      </div>

      {/* Row 4: Category (single-select: eNPS / cNPS / Others) */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
        <select
          value={form.category}
          onChange={e => set("category", e.target.value)}
          disabled={readOnly}
          className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white disabled:bg-gray-50 disabled:text-gray-500"
        >
          <option value="">Select category…</option>
          {WWW_CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Row 5: Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <textarea
          value={form.notes}
          onChange={e => set("notes", e.target.value)}
          rows={2}
          placeholder="Additional notes…"
          disabled={readOnly}
          className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none disabled:bg-gray-50 disabled:text-gray-500"
        />
      </div>

      {/* Notes history — shows previous note values with timestamps.
          Only available in edit mode where itemId exists. */}
      {mode === "edit" && itemId && <NotesHistory itemId={itemId} users={users} />}
    </div>
  );
}

// ── Notes History ────────────────────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  action: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  changedBy: string;
  changedByName: string;
  reason: string | null;
  createdAt: string;
}

/**
 * NotesHistory — reads `/api/www/[id]/logs` (audit log) and surfaces only
 * entries where the `notes` field changed. Each entry shows the previous note
 * value, who changed it, and when.
 *
 * Source of truth: AuditLog rows for entityType=WWWItem. We filter in the
 * client so the existing logs endpoint stays generic.
 */
function NotesHistory({ itemId, users }: { itemId: string; users: Array<{ id: string; firstName: string; lastName: string; email: string }> }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/www/${itemId}/logs`)
      .then(r => r.json())
      .then(d => { if (alive && d?.success) setLogs(d.data ?? []); })
      .catch(() => { if (alive) setLogs([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [itemId]);

  // Filter to entries where "notes" changed, with a concrete previous value
  const noteEntries = logs.filter(l => {
    const oldNotes = (l.oldValue as { notes?: string | null } | null)?.notes;
    const newNotes = (l.newValue as { notes?: string | null } | null)?.notes;
    if (oldNotes === undefined && newNotes === undefined) return false;
    return (oldNotes ?? null) !== (newNotes ?? null);
  });

  if (loading) {
    return (
      <div className="pt-3 border-t border-gray-100">
        <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes History</h4>
        <p className="text-xs text-gray-400 italic">Loading history…</p>
      </div>
    );
  }

  return (
    <div className="pt-3 border-t border-gray-100">
      <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes History</h4>
      {noteEntries.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No previous notes.</p>
      ) : (
        <ul className="space-y-2">
          {noteEntries.map(entry => {
            const oldNotes = (entry.oldValue as { notes?: string | null } | null)?.notes ?? "";
            const newNotes = (entry.newValue as { notes?: string | null } | null)?.notes ?? "";
            const ts = new Date(entry.createdAt);
            const tsLabel = ts.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
            return (
              <li key={entry.id} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-medium text-gray-600">{entry.changedByName}</span>
                  <span className="text-[10px] text-gray-400">{tsLabel}</span>
                </div>
                {oldNotes && (
                  <p className="text-[11px] text-gray-500 line-through whitespace-pre-wrap mb-0.5">{oldNotes}</p>
                )}
                {newNotes && (
                  <p className="text-[11px] text-gray-700 whitespace-pre-wrap">{newNotes}</p>
                )}
                {!oldNotes && !newNotes && (
                  <p className="text-[11px] text-gray-400 italic">(empty)</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── WWWPanel ─────────────────────────────────────────────────────────────────

export function WWWPanel({ mode, item, initialTab, onClose, onSuccess, logsOnly = false }: Props) {
  // logsOnly forces the Log tab, hides tab bar, hides footer. Read-only.
  const [tab, setTab] = useState<Tab>(
    logsOnly ? "log" : (mode === "create" ? "edit" : (initialTab ?? "edit")),
  );
  const { data: users = [] } = useUsers();
  const createWWW = useCreateWWW();
  const updateWWW = useUpdateWWW(item?.id ?? "");
  // Edit mode: only the creator, assignee, or admin/super-admin may change the
  // item. Create mode is always allowed (anyone in the tenant can author a WWW).
  const canEditItem = useCanEditWWW(item);
  const readOnly = mode === "edit" && !canEditItem;

  const [form, setForm] = useState({
    who: item?.who ?? "",
    what: item?.what ?? "",
    when: toDateInputValue(item?.when),
    status: item?.status ?? "not-yet-started",
    revisedDate: item?.revisedDates?.[item.revisedDates.length - 1]
      ? toDateInputValue(item.revisedDates[item.revisedDates.length - 1])
      : "",
    notes: item?.notes ?? "",
    category: item?.category ?? "",
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
        category: item.category ?? "",
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
    // Edit mode only: revised date must not be earlier than When
    if (mode === "edit" && form.revisedDate && form.when && form.revisedDate < form.when) {
      errs.revisedDate = "Revised date cannot be earlier than When";
    }
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
        category: form.category || null,
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

  const TABS: { key: Tab; label: string }[] = logsOnly
    ? [{ key: "log", label: "Log" }]
    : mode === "create"
      ? [{ key: "edit", label: "Edit" }]
      : [{ key: "log", label: "Log" }, { key: "edit", label: "Edit" }];

  const whoUser = users.find(u => u.id === (item?.who ?? form.who));
  const whoName = whoUser ? `${whoUser.firstName} ${whoUser.lastName}` : "";

  const subtitle = mode === "create"
    ? "Create new record"
    : [whoName, item ? `Due ${formatDate(item.when)}` : ""].filter(Boolean).join(" · ");

  return (
    <RightPanel
      open
      onClose={onClose}
      size="sm"
      title={mode === "create" ? "Add New WWW Item" : (item?.what ?? "WWW Item")}
      subtitle={subtitle || undefined}
      tabs={TABS}
      activeTab={tab}
      onTabChange={(k) => setTab(k as Tab)}
      footer={
        tab === "edit" ? (
          <RightPanelFooter>
            <RightPanelCancelButton onClick={onClose} />
            <RightPanelSubmitButton
              onClick={handleSubmit}
              saving={saving}
              disabled={readOnly}
              icon={mode === "create" ? "plus" : "check"}
              label={mode === "create" ? "Create Item" : "Save Changes"}
              title={readOnly ? "Only the creator, assignee, or an admin can edit this item" : undefined}
            />
          </RightPanelFooter>
        ) : null
      }
    >
      {tab === "edit" && (
        <EditTab form={form} set={set} errors={errors} users={users} mode={mode} readOnly={readOnly} itemId={item?.id} />
      )}
      {tab === "log" && item && (
        <LogTab item={item} users={users} />
      )}
    </RightPanel>
  );
}
