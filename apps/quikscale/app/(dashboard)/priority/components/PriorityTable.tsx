"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { PriorityRow } from "@/lib/types/priority";
import { ALL_WEEKS, weekDateLabel } from "@/lib/utils/fiscal";
import { PriorityModal } from "./PriorityModal";
import { PriorityLogModal } from "./PriorityLogModal";

// ── Status helpers ────────────────────────────────────────────────────────────

function statusBg(status: string | null | undefined): string {
  if (status === "not-applicable") return "bg-gray-400";
  if (status === "not-yet-started") return "bg-red-500";
  if (status === "behind-schedule") return "bg-amber-400";
  if (status === "on-track") return "bg-green-500";
  if (status === "completed") return "bg-blue-500";
  return "bg-gray-100";
}

const STATUS_PICKER_OPTIONS = [
  { value: "not-applicable", label: "Not Applicable", color: "bg-gray-400" },
  { value: "not-yet-started", label: "Not Yet Started", color: "bg-red-500" },
  { value: "behind-schedule", label: "Behind Schedule", color: "bg-amber-400" },
  { value: "on-track", label: "On Track", color: "bg-green-500" },
  { value: "completed", label: "Completed", color: "bg-blue-500" },
  { value: "", label: "Clear", color: "bg-white border border-gray-300" },
];

// ── Priority name tooltip ─────────────────────────────────────────────────────

function NameTooltip({ name, description, children }: { name: string; description?: string | null; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseEnter() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left });
    setShow(true);
  }

  return (
    <div ref={ref} onMouseEnter={handleMouseEnter} onMouseLeave={() => setShow(false)}>
      {children}
      {show && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-72 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl pointer-events-none">
          <div className="absolute bottom-full left-4 border-4 border-transparent border-b-gray-900" />
          <p className="font-semibold text-white leading-snug mb-1">{name}</p>
          {description && (
            <p className="text-gray-300 leading-relaxed line-clamp-5">{description}</p>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Week cell tooltip ─────────────────────────────────────────────────────────

function WeekTooltip({ weekNumber, status, note, children }: { weekNumber: number; status: string; note: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const label = STATUS_PICKER_OPTIONS.find(o => o.value === status)?.label ?? null;

  function handleMouseEnter() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 - 88 });
    setShow(true);
  }

  return (
    <div ref={ref} className="w-full h-full" onMouseEnter={handleMouseEnter} onMouseLeave={() => setShow(false)}>
      {children}
      {show && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-44 bg-gray-900 text-white text-xs rounded-lg p-2.5 shadow-xl pointer-events-none">
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
          <p className="font-semibold text-gray-200 mb-1">Week {weekNumber}</p>
          {label ? (
            <p className="text-gray-300">{label}</p>
          ) : (
            <p className="text-gray-500 italic">No status set</p>
          )}
          {note && (
            <div className="mt-1.5 border-t border-gray-700 pt-1.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{note}</p>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Status cell popover ───────────────────────────────────────────────────────

interface StatusPickerProps {
  priorityId: string;
  weekNumber: number;
  currentStatus: string;
  currentNote: string;
  onSave: (priorityId: string, weekNumber: number, status: string, notes: string) => void;
  onClose: () => void;
}

function StatusPicker({ priorityId, weekNumber, currentStatus, currentNote, onSave, onClose }: StatusPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [selectedStatus, setSelectedStatus] = useState(currentStatus);
  const [note, setNote] = useState(currentNote);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-52">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-100">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Week {weekNumber} Status</p>
      </div>
      {/* Status options */}
      <div className="py-1">
        {STATUS_PICKER_OPTIONS.map(opt => (
          <button key={opt.value}
            onClick={() => setSelectedStatus(opt.value)}
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 transition-colors ${selectedStatus === opt.value ? "bg-gray-50 font-semibold" : "hover:bg-gray-50"}`}>
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${opt.color}`} />
            {opt.label}
            {selectedStatus === opt.value && (
              <svg className="ml-auto h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </div>
      {/* Note */}
      <div className="px-3 pb-2 border-t border-gray-100 pt-2">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Note</p>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Add a note for this week…"
          rows={2}
          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
        />
      </div>
      {/* Actions */}
      <div className="flex gap-2 px-3 pb-3">
        <button onClick={onClose}
          className="flex-1 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button
          onClick={() => { onSave(priorityId, weekNumber, selectedStatus, note); onClose(); }}
          className="flex-1 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium">
          Save
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  priorities: PriorityRow[];
  onRefresh: () => void;
  year: number;
  quarter: string;
  defaultYear?: number;
  defaultQuarter?: string;
  onSelectionChange?: (ids: Set<string>) => void;
}

export function PriorityTable({ priorities, onRefresh, year, quarter, defaultYear, defaultQuarter, onSelectionChange }: Props) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editPriority, setEditPriority] = useState<PriorityRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openPicker, setOpenPicker] = useState<{ priorityId: string; weekNumber: number } | null>(null);

  // Optimistic weekly status updates (priorityId -> weekNumber -> status)
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, Record<number, string>>>({});
  // Optimistic notes (priorityId -> weekNumber -> notes)
  const [optimisticNotes, setOptimisticNotes] = useState<Record<string, Record<number, string>>>({});

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectionChange?.(next);
      return next;
    });
  }

  function toggleAll() {
    const next = selectedIds.size === priorities.length ? new Set<string>() : new Set(priorities.map(p => p.id));
    setSelectedIds(next);
    onSelectionChange?.(next);
  }

  async function handleWeeklyStatusSave(priorityId: string, weekNumber: number, status: string, notes: string) {
    // Optimistic update
    setOptimisticStatuses(prev => ({
      ...prev,
      [priorityId]: { ...prev[priorityId], [weekNumber]: status },
    }));
    setOptimisticNotes(prev => ({
      ...prev,
      [priorityId]: { ...prev[priorityId], [weekNumber]: notes },
    }));
    try {
      await fetch(`/api/priority/${priorityId}/weekly`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekNumber, status, notes }),
      });
      onRefresh();
    } catch {
      // revert
      setOptimisticStatuses(prev => {
        const copy = { ...prev };
        if (copy[priorityId]) {
          const inner = { ...copy[priorityId] };
          delete inner[weekNumber];
          copy[priorityId] = inner;
        }
        return copy;
      });
      setOptimisticNotes(prev => {
        const copy = { ...prev };
        if (copy[priorityId]) {
          const inner = { ...copy[priorityId] };
          delete inner[weekNumber];
          copy[priorityId] = inner;
        }
        return copy;
      });
    }
  }

  function getWeekStatus(priority: PriorityRow, weekNumber: number): string {
    const optimistic = optimisticStatuses[priority.id]?.[weekNumber];
    if (optimistic !== undefined) return optimistic;
    const ws = priority.weeklyStatuses.find(s => s.weekNumber === weekNumber);
    return ws?.status ?? "";
  }

  function getWeekNote(priority: PriorityRow, weekNumber: number): string {
    const optimistic = optimisticNotes[priority.id]?.[weekNumber];
    if (optimistic !== undefined) return optimistic;
    const ws = priority.weeklyStatuses.find(s => s.weekNumber === weekNumber);
    return ws?.notes ?? "";
  }

  function isInRange(priority: PriorityRow, weekNumber: number): boolean {
    const sw = priority.startWeek ?? 1;
    const ew = priority.endWeek ?? 13;
    return weekNumber >= sw && weekNumber <= ew;
  }

  // Column offsets for sticky positioning
  // checkbox(40) + log(40) + id(40) + team(120) + name(200) + owner(140) = 580
  const stickyOffsets = [0, 40, 80, 120, 240, 440];

  const STICKY_COLS = [
    { label: "", width: 40 },   // checkbox
    { label: "", width: 40 },   // log icon
    { label: "ID", width: 40 },
    { label: "Team", width: 120 },
    { label: "Priority Name", width: 200 },
    { label: "Owner", width: 140 },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse" style={{ minWidth: "max-content" }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {/* Sticky header cells */}
              {STICKY_COLS.map((col, i) => (
                <th key={i}
                  className="sticky top-0 z-30 bg-gray-50 border-b border-gray-200 border-r border-r-gray-200 text-left px-2 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap select-none"
                  style={{
                    left: stickyOffsets[i],
                    width: col.width,
                    minWidth: col.width,
                    boxShadow: i === STICKY_COLS.length - 1 ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                  }}>
                  {i === 0 ? (
                    <input type="checkbox"
                      checked={selectedIds.size === priorities.length && priorities.length > 0}
                      onChange={toggleAll}
                      className="rounded border-gray-300 text-blue-600 cursor-pointer" />
                  ) : col.label}
                </th>
              ))}

              {/* Week header cells */}
              {ALL_WEEKS.map(w => (
                <th key={w}
                  className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 border-r border-r-gray-100 text-center px-1 py-2 text-[10px] font-semibold text-gray-500 whitespace-nowrap select-none"
                  style={{ minWidth: 64 }}>
                  <div>W{w}</div>
                  <div className="text-[9px] font-normal text-gray-400">{weekDateLabel(year, quarter, w)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {priorities.length === 0 && (
              <tr>
                <td colSpan={6 + ALL_WEEKS.length} className="text-center py-12 text-xs text-gray-400">
                  No priorities found for this period
                </td>
              </tr>
            )}
            {priorities.map((priority, rowIdx) => {
              const ownerName = priority.owner_user
                ? `${priority.owner_user.firstName} ${priority.owner_user.lastName}`
                : "—";
              return (
                <tr key={priority.id}
                  className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                  {/* Checkbox */}
                  <td className="sticky left-0 z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit"
                    style={{ left: 0, width: 40, minWidth: 40 }}>
                    <input type="checkbox"
                      checked={selectedIds.has(priority.id)}
                      onChange={() => toggleSelect(priority.id)}
                      className="rounded border-gray-300 text-blue-600 cursor-pointer" />
                  </td>

                  {/* Log icon */}
                  <td className="sticky z-20 border-r border-gray-100 px-1 py-1.5 text-center bg-inherit"
                    style={{ left: 40, width: 40, minWidth: 40 }}>
                    <button onClick={() => setEditPriority(priority)}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
                      title="Open log">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  </td>

                  {/* ID */}
                  <td className="sticky z-20 border-r border-gray-100 px-1 py-1.5 text-center bg-inherit"
                    style={{ left: 80, width: 40, minWidth: 40 }}>
                    <button onClick={() => setEditPriority(priority)}
                      className="text-blue-500 hover:text-blue-700 font-medium text-xs transition-colors">
                      {rowIdx + 1}
                    </button>
                  </td>

                  {/* Team */}
                  <td className="sticky z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit"
                    style={{ left: 120, width: 120, minWidth: 120 }}>
                    <span className="text-xs text-gray-600 truncate block max-w-[108px]">
                      {priority.team?.name ?? <span className="text-gray-300">—</span>}
                    </span>
                  </td>

                  {/* Priority Name */}
                  <td className="sticky z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit"
                    style={{ left: 240, width: 200, minWidth: 200, boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>
                    <NameTooltip name={priority.name} description={priority.description}>
                      <span className="text-xs text-gray-800 font-medium truncate block max-w-[188px] cursor-default">
                        {priority.name}
                      </span>
                    </NameTooltip>
                  </td>

                  {/* Owner */}
                  <td className="sticky z-20 border-r border-gray-200 px-2 py-1.5 bg-inherit"
                    style={{ left: 440, width: 140, minWidth: 140, boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>
                    <span className="text-xs text-gray-600 truncate block max-w-[128px]">{ownerName}</span>
                  </td>

                  {/* Week cells */}
                  {ALL_WEEKS.map(w => {
                    const inRange = isInRange(priority, w);
                    const status = getWeekStatus(priority, w);
                    const note = getWeekNote(priority, w);
                    const isOpen = openPicker?.priorityId === priority.id && openPicker?.weekNumber === w;

                    if (!inRange) {
                      return (
                        <td key={w} className="border-r border-gray-100 px-0 py-0 bg-gray-50" style={{ minWidth: 64, height: 34 }}>
                          <div className="w-full h-full flex items-center justify-center" style={{ minHeight: 34 }}>
                            <svg className="h-3 w-3 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td key={w} className="relative border-r border-gray-100 px-0 py-0" style={{ minWidth: 64, height: 34 }}>
                        <WeekTooltip weekNumber={w} status={status} note={note}>
                          <button
                            onClick={() => setOpenPicker(isOpen ? null : { priorityId: priority.id, weekNumber: w })}
                            className={`w-full h-full flex items-center justify-center transition-opacity hover:opacity-80 ${statusBg(status)}`}
                            style={{ minHeight: 34 }}>
                            {status && (
                              <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                            )}
                          </button>
                        </WeekTooltip>
                        {isOpen && (
                          <StatusPicker
                            priorityId={priority.id}
                            weekNumber={w}
                            currentStatus={status}
                            currentNote={note}
                            onSave={handleWeeklyStatusSave}
                            onClose={() => setOpenPicker(null)}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add New Modal */}
      {showAddModal && (
        <PriorityModal
          defaultYear={defaultYear ?? year}
          defaultQuarter={defaultQuarter ?? quarter}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); onRefresh(); }}
        />
      )}

      {/* Edit Modal */}
      {editPriority && (
        <PriorityLogModal
          priority={editPriority}
          onClose={() => setEditPriority(null)}
          onSuccess={() => { setEditPriority(null); onRefresh(); }}
        />
      )}
    </div>
  );
}
