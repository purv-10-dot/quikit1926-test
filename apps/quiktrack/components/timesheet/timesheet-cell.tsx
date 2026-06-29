"use client";

import { useState } from "react";
import { formatHours, isToday, isWeekend, parseDurationToHours } from "@/lib/utils/timesheetPeriod";

interface CellData { hours: number; entryIds: string[] }
interface Props {
  cell: CellData | undefined;
  editable: boolean;
  date: Date;
  onChanged: () => Promise<void> | void;
  onOpenLog?: (anchor?: { top: number; left: number; width: number; height: number }) => void;
}

function formatCell(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "";
  return formatHours(h);
}

export function TimesheetCell({ cell, editable, date, onChanged, onOpenLog }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const weekend = isWeekend(date);
  const today = isToday(date);

  async function commit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed) {
      if (cell && cell.entryIds.length > 0) {
        await Promise.all(cell.entryIds.map((id) =>
          fetch(`/api/timesheets/${id}`, { method: "DELETE" }).then((r) => r.json())));
        await onChanged();
      }
      return;
    }
    const hours = parseDurationToHours(trimmed);
    if (hours === null || hours <= 0) return;
    if (cell && cell.entryIds.length === 1) {
      await fetch(`/api/timesheets/${cell.entryIds[0]}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      }).then((r) => r.json());
      await onChanged();
      return;
    }
    onOpenLog?.();
  }

  function rectFrom(e: React.MouseEvent<HTMLElement>) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }

  if (!editable) {
    return (
      <td
        onClick={(e) => onOpenLog?.(rectFrom(e))}
        className={`qt-ts-cell ${cell ? "qt-ts-cell--filled" : ""} px-1.5 py-1.5 text-center text-gray-700 border-l border-gray-100 ${
          weekend ? "bg-gray-50/60" : ""
        } ${today ? "bg-rose-50/40" : ""} ${onOpenLog ? "cursor-pointer hover:bg-blue-50" : ""}`}
      >
        {cell ? <span className="qt-ts-tile">{formatCell(cell.hours)}</span> : ""}
      </td>
    );
  }

  return (
    <td
      onClick={(e) => {
        if (editing) return;
        // Empty cell on an editable row → jump straight to the log modal anchored to this cell.
        if (!cell || cell.entryIds.length === 0) {
          onOpenLog?.(rectFrom(e));
          return;
        }
        // Filled cell with entries → open popover anchored here.
        if (cell.entryIds.length >= 1 && onOpenLog) {
          onOpenLog(rectFrom(e));
          return;
        }
        setDraft(cell ? formatCell(cell.hours) : "");
        setEditing(true);
      }}
      className={`qt-ts-cell ${cell && cell.hours > 0 ? "qt-ts-cell--filled" : "qt-ts-cell--empty"} px-1.5 py-1.5 text-center cursor-text hover:bg-blue-50 border-l border-gray-100 ${
        weekend ? "bg-gray-50/60" : ""
      } ${today ? "bg-rose-50/40" : ""}`}
    >
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") { setDraft(""); setEditing(false); }
          }}
          placeholder="0"
          className="w-full max-w-[44px] mx-auto h-6 px-1 text-[11px] text-center border border-blue-500 rounded focus:outline-none"
        />
      ) : cell ? (
        <span className="qt-ts-tile text-gray-900">{formatCell(cell.hours)}</span>
      ) : (
        <span className="qt-ts-plus text-gray-300" aria-hidden>+</span>
      )}
    </td>
  );
}
