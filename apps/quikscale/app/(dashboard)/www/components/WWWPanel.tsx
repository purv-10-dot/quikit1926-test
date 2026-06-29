"use client";

import { useState, useEffect } from "react";
import { useCreateWWW, useUpdateWWW } from "@/lib/hooks/useWWW";
import { useUsers } from "@/lib/hooks/useUsers";
import { useCanEditWWW, useCanEditWWWAssignment } from "@/lib/hooks/useCanEditWWW";
import { useWWWNotesRequired } from "@/lib/hooks/useFeatureFlags";
import { validateWWWForm } from "@/lib/utils/wwwFormValidation";
import { WWWNotesThread } from "./WWWNotesThread";
import type { WWWItem } from "@/lib/types/www";
import { toDateInputValue } from "@/lib/utils/dateUtils";
import { notify } from "@/lib/utils/notify";
import { humanizeApiError } from "@/lib/utils/humanizeError";

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
  UserSelect,
} from "@quikit/ui";
import { FormErrorBanner } from "@/components/forms/FormErrorBanner";


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
  /** RBAC v2 — false makes the drawer fully read-only (every input disabled,
   *  Save Changes hidden). Defaults to true. */
  canUpdate?: boolean;
}

// ── Log Tab ──────────────────────────────────────────────────────────────────

function LogTab({ item, users }: { item: WWWItem; users: Array<{ id: string; firstName: string; lastName: string; email: string }> }) {
  const whoIdList = (item.whoIds && item.whoIds.length > 0)
    ? item.whoIds
    : item.who ? [item.who] : [];
  const whoUsersResolved = whoIdList
    .map(id => users.find(u => u.id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));
  const whoName = whoUsersResolved.length > 0
    ? whoUsersResolved.map(u => `${u.firstName} ${u.lastName}`).join(", ")
    : item.who;
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
  setMulti,
  errors,
  users,
  mode,
  readOnly,
  whoWhenReadOnly,
  itemId,
  notesRequired,
}: {
  form: { whoIds: string[]; what: string; when: string; status: string; revisedDate: string; notes: string; category: string; originalDueDate: string };
  set: (key: string, val: string) => void;
  setMulti: (key: "whoIds", val: string[]) => void;
  errors: Record<string, string>;
  users: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  mode: "create" | "edit";
  readOnly: boolean;
  /** Stricter gate for the Who + When fields — creator/admin only (see WWWPanel). */
  whoWhenReadOnly: boolean;
  itemId?: string;
  /** Org `www_notes_required` flag — when true, Notes is mandatory. */
  notesRequired: boolean;
}) {
  return (
    <div className="space-y-4">
      {readOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
          Read-only — only the creator, assignee, or an admin can edit this item.
        </div>
      )}

      {/* Editor (e.g. assignee) who isn't the creator: the item is editable but
          the assignment fields are locked. */}
      {!readOnly && whoWhenReadOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
          Only the creator or an admin can change <strong>Who</strong> and <strong>When</strong>.
        </div>
      )}

      {/* Row 1: Who? | When? */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Who? <span className="text-red-500">*</span>
          </label>
          <UserSelect
            mode="multi"
            values={form.whoIds}
            onChange={(ids: string[]) => setMulti("whoIds", ids)}
            users={users}
            placeholder="Select person…"
            error={!!errors.whoIds}
            disabled={whoWhenReadOnly}
          />
          {errors.whoIds && <p className="text-[10px] text-red-500 mt-0.5">{errors.whoIds}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            When? <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={form.when}
            onChange={e => set("when", e.target.value)}
            disabled={whoWhenReadOnly}
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

      {/* Row 5: Notes.
          - CREATE: a single textarea (seeds the first thread note on submit).
            Required when the org's www_notes_required flag is on.
          - EDIT: the full note thread (add via send + editable history cards). */}
      {mode === "create" ? (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Notes {notesRequired && <span className="text-red-500">*</span>}
          </label>
          <textarea
            value={form.notes}
            onChange={e => set("notes", e.target.value)}
            rows={2}
            placeholder="Share your thoughts, updates, or observations…"
            disabled={readOnly}
            className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none disabled:bg-gray-50 disabled:text-gray-500 ${errors.notes ? "border-red-400" : "border-gray-200"}`}
          />
          {errors.notes && <p className="text-[10px] text-red-500 mt-0.5">{errors.notes}</p>}
        </div>
      ) : (
        itemId && <WWWNotesThread itemId={itemId} canAddNotes={!readOnly} />
      )}
    </div>
  );
}

// ── WWWPanel ─────────────────────────────────────────────────────────────────

export function WWWPanel({ mode, item, initialTab, onClose, onSuccess, logsOnly = false, canUpdate = true }: Props) {
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
  // RBAC v2 layer: if the role doesn't grant `update`, the drawer is read-only
  // in edit mode regardless of instance-level rules. Create mode is gated at
  // the page level (Add button hidden when !canCreate).
  const readOnly = mode === "edit" && (!canEditItem || !canUpdate);
  // Assignment fields ("Who" + "When") are creator-gated: only the creator (or
  // an admin/super-admin) may reassign or move the due date. Assignees — who
  // can otherwise edit the item — see these two fields disabled. Create mode is
  // never gated (the author is the current user). Layered on top of `readOnly`
  // so a fully read-only drawer keeps Who/When locked too.
  const canEditWhoWhen = useCanEditWWWAssignment(item);
  const whoWhenReadOnly = readOnly || (mode === "edit" && !canEditWhoWhen);

  const initialWhoIds = (item?.whoIds && item.whoIds.length > 0)
    ? item.whoIds
    : item?.who ? [item.who] : [];
  const [form, setForm] = useState({
    whoIds: initialWhoIds,
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
  // Org flag: when on, Notes is mandatory on both add + edit.
  const notesRequired = useWWWNotesRequired();

  // Re-populate when item changes (edit mode)
  useEffect(() => {
    if (item) {
      const ids = (item.whoIds && item.whoIds.length > 0)
        ? item.whoIds
        : item.who ? [item.who] : [];
      setForm({
        whoIds: ids,
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

  function setMulti(key: "whoIds", val: string[]) {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => { const n = { ...e }; delete n[key]; return n; });
  }

  function validate() {
    return validateWWWForm(
      { whoIds: form.whoIds, what: form.what, when: form.when, revisedDate: form.revisedDate, notes: form.notes },
      // Notes-required is a form-field rule only on CREATE (the single textarea).
      // In edit mode notes live in the thread; the server PUT enforces the flag
      // against the latest-note mirror, so don't block the main form on it.
      { mode, notesRequired: mode === "create" ? notesRequired : false },
    );
  }

  async function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); setTab("edit"); return; }
    setSaving(true);
    try {
      const payload: Partial<WWWItem> = {
        who: form.whoIds[0] ?? "",
        whoIds: form.whoIds,
        what: form.what.trim(),
        when: form.when,
        status: form.status,
        category: form.category || null,
        originalDueDate: form.originalDueDate || null,
      };
      // Notes are only set from this form on CREATE (it seeds the first thread
      // note server-side). In edit mode the thread owns notes — sending the
      // stale form value here would clobber the latest-note mirror.
      if (mode === "create") payload.notes = form.notes || null;

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
      notify.saved("Action item", mode === "create" ? "created" : "updated");
      onSuccess();
    } catch (err: unknown) {
      setErrors({ _: humanizeApiError(err, { context: "action item" }) });
      notify.error(err, { context: "action item", fallback: "Couldn't save the action item. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const TABS: { key: Tab; label: string }[] = logsOnly
    ? [{ key: "log", label: "Log" }]
    : mode === "create"
      ? [{ key: "edit", label: "Edit" }]
      : [{ key: "log", label: "Log" }, { key: "edit", label: "Edit" }];

  const subtitleIds = (item?.whoIds && item.whoIds.length > 0)
    ? item.whoIds
    : item?.who ? [item.who] : form.whoIds;
  const subtitleUsers = subtitleIds
    .map(id => users.find(u => u.id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));
  const whoName = subtitleUsers.length === 0
    ? ""
    : subtitleUsers.length === 1
      ? `${subtitleUsers[0].firstName} ${subtitleUsers[0].lastName}`
      : `${subtitleUsers[0].firstName} ${subtitleUsers[0].lastName} +${subtitleUsers.length - 1}`;

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
          // Column wrapper keeps the server-error banner pinned just above
          // the Cancel/Submit row regardless of how far the user scrolled.
          <div className="flex flex-col gap-2 w-full">
            <FormErrorBanner message={errors._} />
            <RightPanelFooter>
              <RightPanelCancelButton onClick={onClose} />
              {/* RBAC v2: hide Save entirely when the role doesn't grant update. */}
              {(mode === "create" || canUpdate) && (
                <RightPanelSubmitButton
                  onClick={handleSubmit}
                  saving={saving}
                  disabled={readOnly}
                  icon={mode === "create" ? "plus" : "check"}
                  label={mode === "create" ? "Create Item" : "Save Changes"}
                  title={readOnly ? "Only the creator, assignee, or an admin can edit this item" : undefined}
                />
              )}
            </RightPanelFooter>
          </div>
        ) : null
      }
    >
      {tab === "edit" && (
        <EditTab form={form} set={set} setMulti={setMulti} errors={errors} users={users} mode={mode} readOnly={readOnly} whoWhenReadOnly={whoWhenReadOnly} itemId={item?.id} notesRequired={notesRequired} />
      )}
      {tab === "log" && item && (
        <LogTab item={item} users={users} />
      )}
    </RightPanel>
  );
}
