"use client";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Plus, Edit2, Scissors, Trash2, CheckSquare } from "lucide-react";
import { useSession } from "next-auth/react";
import { formatHours } from "@/lib/utils/timesheetPeriod";
import { WorkItemPicker } from "./work-item-picker";

export interface EntryDetail {
  id: string;
  hours: number;
  description: string | null;
  entryDate: string;
  projectId?: string;
  issue: { id: string; key: string; title: string; projectId?: string } | null;
}

interface IssueOption { id: string; key: string; title: string; type: string }

interface Props {
  entryIds: string[];
  date: Date;
  issueLabel: string;
  anchor?: { top: number; left: number; width: number; height: number };
  onClose: () => void;
  onLog: () => void;
  onEdit: (entryId: string) => void;
  onDelete: (entry: EntryDetail) => void;
  onSplit: (entry: EntryDetail) => void;
  onChanged?: () => void;
}

export function WorklogPopover({
  entryIds,
  date,
  issueLabel,
  anchor,
  onClose,
  onLog,
  onEdit,
  onDelete,
  onSplit,
  onChanged,
}: Props) {
  const { data: session } = useSession();
  const userName = session?.user?.name || session?.user?.email || "You";
  const initial = (userName || "U").trim().charAt(0).toUpperCase();
  const [entries, setEntries] = useState<EntryDetail[]>([]);
  const [issuesByProject, setIssuesByProject] = useState<Record<string, IssueOption[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  async function loadEntries() {
    setLoading(true);
    setLoadError(null);
    const rows = await Promise.all(
      entryIds.map((id) =>
        fetch(`/api/timesheets/${id}`)
          .then((r) => r.json())
          .then((j) =>
            j?.success
              ? { ok: true as const, entry: j.data as EntryDetail }
              : { ok: false as const, error: (j?.error as string) || "Failed to load" },
          )
          .catch(() => ({ ok: false as const, error: "Failed to load" })),
      ),
    );
    const list = rows
      .filter((r): r is { ok: true; entry: EntryDetail } => r.ok)
      .map((r) => r.entry);
    setEntries(list);
    // If nothing loaded, surface why (e.g. a 403 on another user's entries)
    // instead of spinning on "Loading…" forever.
    if (list.length === 0) {
      setLoadError(rows.find((r) => !r.ok)?.error ?? "Couldn't load these entries.");
    }
    setLoading(false);
    // Preload issues for each project so the inline picker is populated.
    const projectIds = Array.from(
      new Set(list.map((e) => e.projectId ?? e.issue?.projectId).filter(Boolean) as string[]),
    );
    for (const pid of projectIds) {
      if (issuesByProject[pid]) continue;
      void fetch(
        `/api/issues?projectId=${encodeURIComponent(pid)}&excludeType=EPIC&limit=200`,
      )
        .then((r) => r.json())
        .then((j) => {
          if (!j?.success) return;
          setIssuesByProject((prev) => ({
            ...prev,
            [pid]: (j.data ?? []).map((i: IssueOption) => ({
              id: i.id,
              key: i.key,
              title: i.title,
              type: i.type,
            })),
          }));
        })
        .catch(() => undefined);
    }
  }

  useEffect(() => {
    let alive = true;
    void loadEntries().then(() => {
      if (!alive) return;
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryIds.join(",")]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  async function changeIssue(entry: EntryDetail, newIssueId: string) {
    if (newIssueId === entry.issue?.id) return;
    const res = await fetch(`/api/timesheets/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId: newIssueId }),
    }).then((r) => r.json());
    if (res?.success) {
      await loadEntries();
      onChanged?.();
    }
  }

  const dateShort = date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });

  const colsClass =
    "grid grid-cols-[80px_160px_minmax(220px,1.2fr)_minmax(160px,1fr)_70px_70px] gap-4 px-6";

  // Position the popover just below the clicked cell, clamped to the viewport.
  const POP_W = 880;
  const GAP = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let top = 80;
  let left = Math.max(16, (vw - POP_W) / 2);
  let placeAbove = false;
  if (anchor) {
    const desiredLeft = anchor.left + anchor.width / 2 - POP_W / 2;
    left = Math.min(Math.max(16, desiredLeft), vw - POP_W - 16);
    top = anchor.top + anchor.height + GAP;
    // Flip above if it would overflow the viewport bottom.
    if (top + 220 > vh) {
      placeAbove = true;
      top = Math.max(16, anchor.top - GAP - 220);
    }
  }
  const popWidth = Math.min(POP_W, vw - 32);

  return (
    <div className="fixed inset-0 z-[60] bg-transparent" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={ref}
        style={{ top, left, width: popWidth }}
        className="fixed bg-white border border-gray-200 rounded-md shadow-2xl"
      >
        {anchor && (
          <div
            className={`absolute ${placeAbove ? "bottom-[-6px]" : "top-[-6px]"} h-3 w-3 rotate-45 bg-white border-gray-200`}
            style={{
              left: Math.min(Math.max(16, anchor.left + anchor.width / 2 - left - 6), popWidth - 20),
              borderTopWidth: placeAbove ? 0 : 1,
              borderLeftWidth: placeAbove ? 0 : 1,
              borderRightWidth: placeAbove ? 1 : 0,
              borderBottomWidth: placeAbove ? 1 : 0,
            }}
          />
        )}
        <div className={`${colsClass} py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200`}>
          <div>Date</div>
          <div>User</div>
          <div>Work Item</div>
          <div>Description</div>
          <div className="text-right">Logged</div>
          <div className="text-right">Actions</div>
        </div>
        <div className="py-1">
          {loading ? (
            <div className="py-6 text-xs text-gray-400 text-center">Loading…</div>
          ) : loadError ? (
            <div className="py-6 text-xs text-red-600 text-center">{loadError}</div>
          ) : entries.length === 0 ? (
            <div className="py-6 text-xs text-gray-400 text-center">No time records.</div>
          ) : (
            entries.map((e) => {
              const pid = e.projectId ?? e.issue?.projectId ?? "";
              const issues = issuesByProject[pid] ?? [];
              // The entry already carries its own work item (key/title) from the
              // /api/timesheets/[id] response. Seed it into the picker options so
              // the selected value always resolves to a label — otherwise the
              // picker (which matches value against this list) shows the empty
              // "Pick a task or subtask" placeholder whenever the item isn't in
              // the capped/EPIC-filtered project fetch. type defaults to TASK
              // (just the icon); the real option overrides it once issues load.
              const issueOptions =
                e.issue && !issues.some((i) => i.id === e.issue!.id)
                  ? [{ id: e.issue.id, key: e.issue.key, title: e.issue.title, type: "TASK" }, ...issues]
                  : issues;
              const d = new Date(e.entryDate);
              const dateLabel = `${d.toLocaleDateString(undefined, { month: "short" })} ${d.getDate()}...`;
              return (
                <div
                  key={e.id}
                  className={`${colsClass} py-3 items-center text-sm`}
                >
                  <div className="text-gray-700 text-xs">{dateLabel}</div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-600 text-white text-[10px] font-semibold">
                      {initial}
                    </span>
                    <span className="text-gray-800 text-xs truncate">{userName}</span>
                  </div>
                  <div>
                    {e.issue || issueOptions.length > 0 ? (
                      <WorkItemPicker
                        issues={issueOptions}
                        value={e.issue?.id ?? ""}
                        onChange={(id) => void changeIssue(e, id)}
                      />
                    ) : (
                      <div className="text-gray-700 text-xs">—</div>
                    )}
                  </div>
                  <div className="text-gray-700 text-xs truncate">
                    {e.description || <span className="text-gray-300">—</span>}
                  </div>
                  <div className="text-right text-gray-900 text-sm">{formatHours(e.hours)}</div>
                  <div className="flex justify-end">
                    <ActionsMenu
                      onEdit={() => onEdit(e.id)}
                      onSplit={() => onSplit(e)}
                      onDelete={() => onDelete(e)}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onLog}
            className="inline-flex items-center gap-1 h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
          >
            Log Time
          </button>
          <button
            onClick={onClose}
            className="h-9 px-4 text-sm text-gray-700 rounded hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionsMenu({
  onEdit,
  onSplit,
  onDelete,
}: {
  onEdit: () => void;
  onSplit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-1 rounded hover:bg-gray-100 text-gray-500"
        aria-label="Actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            <Edit2 className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSplit();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            <Scissors className="h-3.5 w-3.5" />
            Split
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
