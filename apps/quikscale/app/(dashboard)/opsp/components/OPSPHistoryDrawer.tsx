"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RightPanel } from "@quikit/ui";
import { ChevronDown, ChevronRight, Clock, FileText, Pencil, Check, X, Eye } from "lucide-react";
import type { HistoryScope } from "@/lib/utils/opspEditHighlight";

interface EditLogEntry {
  id: string;
  field: string;
  label: string;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  actorName: string;
  createdAt: string;
}

function plain(s: string | null): string {
  if (!s) return "";
  return s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Read-only history of every field edit made after an OPSP was finalized.
 * Entries are grouped by field; each group is collapsible and shows the
 * change history (old → new, who, when, and the note).
 */
export function OPSPHistoryDrawer({
  open,
  onClose,
  year,
  quarter,
  canEdit = false,
  currentValue,
  onApplyValue,
  onEditNote,
  fields,
  actorScope,
  ackFooter,
}: {
  open: boolean;
  onClose: () => void;
  year: number;
  quarter: string;
  /** Optional allow-list of top-level field keys (e.g. ["targetRows","goalRows"])
   *  — when set, only those fields' changes are shown. Used by OPSP Review to
   *  scope the history to its own tables; omit to show every field (editor). */
  fields?: string[];
  /** Optional "cumulative up to a user" scope — when set, only edits (by anyone)
   *  made at or before `untilTs` are shown. Used by the per-user change stepper
   *  so a later editor's history also surfaces the earlier edits they built on. */
  actorScope?: HistoryScope | null;
  /** When true, EditFinalize users can edit values + notes from the drawer. */
  canEdit?: boolean;
  currentValue?: (field: string) => string;
  onApplyValue?: (
    field: string,
    label: string,
    oldValue: string,
    newValue: string,
    note: string,
  ) => Promise<unknown> | void;
  onEditNote?: (id: string, note: string) => Promise<unknown> | void;
  /** Optional sticky footer to acknowledge ("mark reviewed") the post-finalize
   *  highlights shown behind the drawer. When acknowledged the button disables
   *  and the host page clears its highlights. */
  ackFooter?: {
    acknowledged: boolean;
    onAcknowledge: () => void;
    actorName?: string;
  };
}) {
  const [entries, setEntries] = useState<EditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Inline editors
  const [editField, setEditField] = useState<string | null>(null);
  const [valueDraft, setValueDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [noteEdit, setNoteEdit] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/opsp/edit-log?year=${year}&quarter=${quarter}`);
      const json = await res.json();
      setEntries(json.success ? (json.data as EditLogEntry[]) : []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [year, quarter]);

  useEffect(() => {
    if (open) {
      setCollapsed(new Set()); // default: all expanded ("view all")
      void load();
    }
  }, [open, load]);

  // Optional scope, two independent filters:
  //  - `fields`: only changes to the given top-level fields (OPSP Review passes
  //    its own tables; the editor omits it to show everything).
  //  - `actorScope`: only edits made at or before a user's latest change — the
  //    "cumulative up to this user" view from the change stepper.
  const visible = useMemo(() => {
    let out = entries;
    if (fields) out = out.filter((e) => fields.includes(e.field.split(".")[0]));
    if (actorScope) out = out.filter((e) => Date.parse(e.createdAt) <= actorScope.untilTs);
    return out;
  }, [entries, fields, actorScope]);

  // Group entries by field, preserving newest-first order from the API.
  const groups = useMemo(() => {
    const m = new Map<string, { field: string; label: string; entries: EditLogEntry[] }>();
    for (const e of visible) {
      const g = m.get(e.field) ?? { field: e.field, label: e.label, entries: [] };
      g.entries.push(e);
      m.set(e.field, g);
    }
    return [...m.values()];
  }, [visible]);

  const allExpanded = collapsed.size === 0;
  const toggleAll = () =>
    setCollapsed(allExpanded ? new Set(groups.map((g) => g.field)) : new Set());
  const toggleGroup = (field: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });

  const startEditValue = (field: string) => {
    setEditField(field);
    setValueDraft(currentValue ? currentValue(field) : "");
    setNoteDraft("");
  };
  const saveValue = async (field: string, label: string) => {
    if (!onApplyValue) return;
    const oldValue = currentValue ? currentValue(field) : "";
    setBusy(true);
    await onApplyValue(field, label, oldValue, valueDraft, noteDraft);
    setBusy(false);
    setEditField(null);
    await load();
  };
  const saveNote = async (id: string) => {
    if (!onEditNote) return;
    setBusy(true);
    await onEditNote(id, noteEdit);
    setBusy(false);
    setEditNoteId(null);
    await load();
  };

  return (
    <RightPanel
      open={open}
      onClose={onClose}
      title="OPSP edit history"
      subtitle={
        actorScope
          ? `Up to ${actorScope.actorName}'s latest change · ${quarter} ${year}`
          : `Changes after finalize · ${quarter} ${year}`
      }
      size="md"
      footer={
        ackFooter ? (
          <div className="flex items-center justify-between w-full gap-2">
            <span className="text-[11px] text-gray-500 truncate">
              {ackFooter.actorName
                ? `Latest change by ${ackFooter.actorName}`
                : "Post-finalize changes"}
            </span>
            <button
              type="button"
              onClick={ackFooter.onAcknowledge}
              disabled={ackFooter.acknowledged}
              className={
                ackFooter.acknowledged
                  ? "inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-400 cursor-not-allowed"
                  : "inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-700"
              }
              title={
                ackFooter.acknowledged
                  ? "You've reviewed these changes"
                  : "Mark these changes as reviewed and hide the highlights"
              }
            >
              {ackFooter.acknowledged ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Reviewed
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" /> Mark changes as reviewed
                </>
              )}
            </button>
          </div>
        ) : undefined
      }
    >
      {groups.length > 0 && (
        <div className="flex items-center justify-between pb-2">
          <span className="text-xs text-gray-500">
            {visible.length} change{visible.length === 1 ? "" : "s"} · {groups.length} field
            {groups.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs font-medium text-accent-600 hover:text-accent-700"
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </button>
        </div>
      )}

      {loading && <p className="py-8 text-center text-sm text-gray-400">Loading…</p>}

      {!loading && groups.length === 0 && (
        <div className="py-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-400">No edits logged yet.</p>
        </div>
      )}

      <div className="space-y-2">
        {groups.map((g) => {
          const isOpen = !collapsed.has(g.field);
          return (
            <div key={g.field} className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.field)}
                  className="flex flex-1 items-center gap-2 min-w-0 text-left hover:opacity-80"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  )}
                  <span className="truncate text-sm font-semibold text-gray-800">{g.label}</span>
                </button>
                <span className="flex-shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                  {g.entries.length}
                </span>
                {canEdit && onApplyValue && (
                  <button
                    type="button"
                    onClick={() => startEditValue(g.field)}
                    className="flex-shrink-0 inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-accent-50 hover:text-accent-600"
                    title="Edit value"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                )}
              </div>

              {editField === g.field && (
                <div className="px-3 py-2.5 space-y-2 border-b border-gray-100 bg-accent-50/40">
                  <input
                    value={valueDraft}
                    onChange={(e) => setValueDraft(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent-400"
                    placeholder="New value"
                  />
                  <textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
                    placeholder="Add a note for this change (optional)…"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditField(null)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveValue(g.field, g.label)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg bg-accent-600 px-3 py-1 text-xs font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" /> {busy ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {isOpen && (
                <ul className="divide-y divide-gray-100">
                  {g.entries.map((e) => (
                    <li key={e.id} className="px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          title={plain(e.oldValue)}
                          className="inline-block max-w-[10rem] truncate rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-rose-700"
                        >
                          {plain(e.oldValue) || "—"}
                        </span>
                        <span className="text-gray-400">→</span>
                        <span
                          title={plain(e.newValue)}
                          className="inline-block max-w-[10rem] truncate rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-emerald-700"
                        >
                          {plain(e.newValue) || "—"}
                        </span>
                      </div>
                      {editNoteId === e.id ? (
                        <div className="space-y-1.5">
                          <textarea
                            value={noteEdit}
                            onChange={(ev) => setNoteEdit(ev.target.value)}
                            rows={2}
                            className="w-full resize-none rounded-md border border-gray-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-400"
                            placeholder="Note…"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditNoteId(null)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                            >
                              <X className="h-3 w-3" /> Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveNote(e.id)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded-md bg-accent-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
                            >
                              <Check className="h-3 w-3" /> Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-1.5">
                          {e.note ? (
                            <p className="flex-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                              {e.note}
                            </p>
                          ) : (
                            <span className="flex-1 text-xs italic text-gray-300">No note</span>
                          )}
                          {canEdit && onEditNote && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditNoteId(e.id);
                                setNoteEdit(e.note ?? "");
                              }}
                              className="flex-shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-accent-600"
                              title="Edit note"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                        <Clock className="h-3 w-3" />
                        <span>{fmtTime(e.createdAt)}</span>
                        <span>·</span>
                        <span className="truncate">{e.actorName}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </RightPanel>
  );
}
