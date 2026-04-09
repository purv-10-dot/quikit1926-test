"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { WWWItem } from "@/lib/types/www";
import { WWWPanel } from "./WWWPanel";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "not-applicable", label: "Not Applicable", color: "bg-gray-400" },
  { value: "not-yet-started", label: "Not Yet Started", color: "bg-red-500" },
  { value: "behind-schedule", label: "Behind Schedule", color: "bg-amber-400" },
  { value: "on-track", label: "On Track", color: "bg-green-500" },
  { value: "completed", label: "Completed", color: "bg-blue-500" },
];

function statusBadgeColor(status: string): string {
  const opt = STATUS_OPTIONS.find(o => o.value === status);
  return opt ? `${opt.color} text-white` : "bg-gray-100 text-gray-400";
}

function statusLabel(status: string): string {
  const opt = STATUS_OPTIONS.find(o => o.value === status);
  return opt?.label ?? status;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return "—";
  }
}

function toDateInputValue(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

// ── Shared text tooltip ───────────────────────────────────────────────────────

function TextTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseEnter() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left });
    setShow(true);
  }

  if (!text) return <>{children}</>;

  return (
    <div ref={ref} onMouseEnter={handleMouseEnter} onMouseLeave={() => setShow(false)}>
      {children}
      {show && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-80 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl pointer-events-none"
        >
          <div className="absolute bottom-full left-4 border-4 border-transparent border-b-gray-900" />
          <p className="leading-relaxed whitespace-pre-wrap">{text}</p>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── What tooltip ──────────────────────────────────────────────────────────────

function WhatTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return <TextTooltip text={text}>{children}</TextTooltip>;
}

// ── Status Picker popover ─────────────────────────────────────────────────────

interface StatusPickerProps {
  itemId: string;
  currentStatus: string;
  onSave: (id: string, status: string) => void;
  onClose: () => void;
}

function StatusPicker({ itemId, currentStatus, onSave, onClose }: StatusPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-52"
    >
      <div className="px-3 pt-3 pb-2 border-b border-gray-100">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Set Status</p>
      </div>
      <div className="py-1">
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => { onSave(itemId, opt.value); onClose(); }}
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 transition-colors ${currentStatus === opt.value ? "bg-gray-50 font-semibold" : "hover:bg-gray-50"}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${opt.color}`} />
            {opt.label}
            {currentStatus === opt.value && (
              <svg className="ml-auto h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
        <div className="border-t border-gray-100 mt-1">
          <button
            onClick={() => { onSave(itemId, ""); onClose(); }}
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-500 transition-colors ${currentStatus === "" ? "bg-gray-50 font-semibold" : "hover:bg-gray-50"}`}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-white border border-gray-300" />
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Revised Date Picker popover ───────────────────────────────────────────────

interface DatePickerProps {
  itemId: string;
  currentDate: string; // ISO string or ""
  existingDates: string[];
  onSave: (id: string, date: string, allDates: string[]) => void;
  onClose: () => void;
}

function RevisedDatePicker({ itemId, currentDate, existingDates, onSave, onClose }: DatePickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(toDateInputValue(currentDate));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  function handleSave() {
    if (!value) return;
    const existing = existingDates ?? [];
    const last = existing[existing.length - 1];
    const allDates = last !== value ? [...existing, value] : existing;
    onSave(itemId, value, allDates);
    onClose();
  }

  function handleClear() {
    onSave(itemId, "", []);
    onClose();
  }

  return (
    <div
      ref={ref}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-56 p-3 space-y-2"
    >
      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Revised Date</p>
      <input
        type="date"
        value={value}
        onChange={e => setValue(e.target.value)}
        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
        autoFocus
      />
      <div className="flex gap-2">
        <button
          onClick={handleClear}
          className="flex-1 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Clear
        </button>
        <button
          onClick={handleSave}
          disabled={!value}
          className="flex-1 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors font-medium"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  items: WWWItem[];
  onRefresh: () => void;
  onSelectionChange?: (ids: Set<string>) => void;
}

// Sticky column offsets: checkbox(40), log(40), id(50), who(120), when(110)
// total: 360px
const stickyOffsets = [0, 40, 80, 130, 250];

const STICKY_COLS = [
  { label: "", width: 40 },    // checkbox
  { label: "", width: 40 },    // log icon
  { label: "ID", width: 50 },
  { label: "Who", width: 120 },
  { label: "When", width: 110 },
];

export function WWWTable({ items, onRefresh, onSelectionChange }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editItem, setEditItem] = useState<WWWItem | null>(null);
  const [openStatusPicker, setOpenStatusPicker] = useState<string | null>(null);
  const [openDatePicker, setOpenDatePicker] = useState<string | null>(null);

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
    const next = selectedIds.size === items.length ? new Set<string>() : new Set(items.map(i => i.id));
    setSelectedIds(next);
    onSelectionChange?.(next);
  }

  async function handleStatusSave(id: string, status: string) {
    try {
      await fetch(`/api/www/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      onRefresh();
    } catch {
      // ignore
    }
  }

  async function handleRevisedDateSave(id: string, _date: string, allDates: string[]) {
    try {
      await fetch(`/api/www/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisedDates: allDates }),
      });
      onRefresh();
    } catch {
      // ignore
    }
  }

  const thBase = "sticky top-0 z-20 bg-gray-50 border-b border-gray-200 border-r border-r-gray-100 text-left px-2 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap";

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <table className="border-collapse w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {STICKY_COLS.map((col, i) => (
                <th
                  key={i}
                  className="sticky top-0 z-30 bg-gray-50 border-b border-gray-200 border-r border-r-gray-200 text-left px-2 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap select-none"
                  style={{
                    left: stickyOffsets[i],
                    width: col.width,
                    minWidth: col.width,
                    boxShadow: i === STICKY_COLS.length - 1 ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                  }}
                >
                  {i === 0 ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.size === items.length && items.length > 0}
                      onChange={toggleAll}
                      className="rounded border-gray-300 text-blue-600 cursor-pointer"
                    />
                  ) : col.label}
                </th>
              ))}

              <th className={thBase} style={{ minWidth: 300 }}>What</th>
              <th className={thBase} style={{ minWidth: 120 }}>Revised Date</th>
              <th className={thBase} style={{ minWidth: 140 }}>Status</th>
              <th className={thBase} style={{ minWidth: 300, width: "100%" }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-12 text-xs text-gray-400">
                  No WWW items found
                </td>
              </tr>
            )}
            {items.map((item, rowIdx) => {
              const rowBg = rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50";
              const whoName = item.who_user
                ? `${item.who_user.firstName} ${item.who_user.lastName}`
                : "—";
              const lastRevisedDate = item.revisedDates?.length
                ? item.revisedDates[item.revisedDates.length - 1]
                : null;
              const isStatusPickerOpen = openStatusPicker === item.id;
              const isDatePickerOpen = openDatePicker === item.id;

              return (
                <tr
                  key={item.id}
                  className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${rowBg}`}
                >
                  {/* Checkbox */}
                  <td className="sticky left-0 z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit" style={{ left: 0, width: 40, minWidth: 40 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="rounded border-gray-300 text-blue-600 cursor-pointer"
                    />
                  </td>

                  {/* Log icon */}
                  <td className="sticky z-20 border-r border-gray-100 px-1 py-1.5 text-center bg-inherit" style={{ left: 40, width: 40, minWidth: 40 }}>
                    <button
                      onClick={() => setEditItem(item)}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
                      title="Open log"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  </td>

                  {/* ID */}
                  <td className="sticky z-20 border-r border-gray-100 px-1 py-1.5 text-center bg-inherit" style={{ left: 80, width: 50, minWidth: 50 }}>
                    <button
                      onClick={() => setEditItem(item)}
                      className="text-blue-500 hover:text-blue-700 font-medium text-xs transition-colors"
                    >
                      {rowIdx + 1}
                    </button>
                  </td>

                  {/* Who */}
                  <td className="sticky z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit" style={{ left: 130, width: 120, minWidth: 120 }}>
                    <span className="text-xs text-gray-800 font-medium truncate block max-w-[108px]">
                      {whoName}
                    </span>
                  </td>

                  {/* When */}
                  <td className="sticky z-20 border-r border-gray-200 px-2 py-1.5 bg-inherit" style={{ left: 250, width: 110, minWidth: 110, boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>
                    <div className="flex items-center gap-1">
                      <svg className="h-3 w-3 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className={`text-xs ${item.when ? "text-blue-600" : "text-gray-400"}`}>
                        {formatDate(item.when)}
                      </span>
                    </div>
                  </td>

                  {/* What */}
                  <td className="border-r border-gray-100 px-2 py-1.5" style={{ width: 300, minWidth: 300 }}>
                    <WhatTooltip text={item.what}>
                      <p className="text-xs text-gray-800 line-clamp-2 max-w-[288px] cursor-default">
                        {item.what}
                      </p>
                    </WhatTooltip>
                  </td>

                  {/* Revised Date — inline editable */}
                  <td className="relative border-r border-gray-100 px-2 py-1.5" style={{ width: 120, minWidth: 120 }}>
                    <button
                      onClick={() => { setOpenStatusPicker(null); setOpenDatePicker(isDatePickerOpen ? null : item.id); }}
                      className="flex items-center gap-1 group"
                    >
                      {lastRevisedDate ? (
                        <>
                          <svg className="h-3 w-3 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-xs text-blue-600 group-hover:underline">{formatDate(lastRevisedDate)}</span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-300 group-hover:text-gray-500">—</span>
                      )}
                    </button>
                    {isDatePickerOpen && (
                      <RevisedDatePicker
                        itemId={item.id}
                        currentDate={lastRevisedDate ?? ""}
                        existingDates={item.revisedDates ?? []}
                        onSave={handleRevisedDateSave}
                        onClose={() => setOpenDatePicker(null)}
                      />
                    )}
                  </td>

                  {/* Status */}
                  <td className={`relative border-r border-gray-100 ${statusBadgeColor(item.status)}`} style={{ width: 140, minWidth: 140 }}>
                    <button
                      onClick={() => { setOpenDatePicker(null); setOpenStatusPicker(isStatusPickerOpen ? null : item.id); }}
                      className="w-full h-full flex items-center justify-center px-2 py-3 text-[10px] font-semibold whitespace-nowrap"
                    >
                      {statusLabel(item.status)}
                    </button>
                    {isStatusPickerOpen && (
                      <StatusPicker
                        itemId={item.id}
                        currentStatus={item.status}
                        onSave={handleStatusSave}
                        onClose={() => setOpenStatusPicker(null)}
                      />
                    )}
                  </td>

                  {/* Notes */}
                  <td className="border-r border-gray-100 px-2 py-1.5" style={{ minWidth: 300, width: "100%" }}>
                    <TextTooltip text={item.notes ?? ""}>
                      <span className="text-xs text-gray-600 truncate block cursor-default">
                        {item.notes || <span className="text-gray-300">—</span>}
                      </span>
                    </TextTooltip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editItem && (
        <WWWPanel
          mode="edit"
          item={editItem}
          onClose={() => setEditItem(null)}
          onSuccess={() => { setEditItem(null); onRefresh(); }}
        />
      )}
    </div>
  );
}
