"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { productivityTone } from "@/lib/reports/productivity";
import type { ExecutiveReportData, TeamHeatmapRow } from "./types";

interface Props {
  data: ExecutiveReportData;
}

export function TeamHeatmap({ data }: Props) {
  const [selected, setSelected] = useState<{ rowId: string; weekIdx: number } | null>(null);
  const rows = data.teamHeatmap;

  const weeks = data.weeks.slice(-5); // mirror the image which shows 5 most-recent weeks
  const visibleWeeks = weeks.length > 0 ? weeks : data.weeks;
  const startIdx = data.weeks.length - visibleWeeks.length;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Department Productivity Heatmap</h3>
          <Info className="h-3.5 w-3.5 text-gray-400" />
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400">
          <Legend tone="high" label="Good (≥ 80%)" />
          <Legend tone="medium" label="Average (60% - 80%)" />
          <Legend tone="low" label="Needs Attention (< 60%)" />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No department activity in this period.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium pb-2 min-w-[110px]">
                  Department
                </th>
                {visibleWeeks.map((w, i) => (
                  <th
                    key={w.weekStart}
                    className="text-center text-[10px] font-medium text-gray-500 dark:text-gray-400 pb-2 px-1"
                  >
                    <div>W{i + 1}</div>
                    <div className="text-[9px] text-gray-400 dark:text-gray-500 font-normal mt-0.5">
                      {w.weekLabel}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row
                  key={row.teamId}
                  row={row}
                  weekStart={startIdx}
                  weekCount={visibleWeeks.length}
                  selected={selected}
                  onSelect={(weekIdx) => setSelected({ rowId: row.teamId, weekIdx })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <DrillIn data={data} selection={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function Row({
  row,
  weekStart,
  weekCount,
  selected,
  onSelect,
}: {
  row: TeamHeatmapRow;
  weekStart: number;
  weekCount: number;
  selected: { rowId: string; weekIdx: number } | null;
  onSelect: (weekIdx: number) => void;
}) {
  const cells = row.cells.slice(weekStart, weekStart + weekCount);
  return (
    <tr>
      <td className="text-sm text-gray-900 dark:text-gray-100 font-medium py-1.5 pr-2">{row.teamName}</td>
      {cells.map((cell, i) => {
        const weekIdx = weekStart + i;
        const isSel = selected?.rowId === row.teamId && selected.weekIdx === weekIdx;
        return (
          <td key={weekIdx} className="p-1">
            <button
              type="button"
              onClick={() => onSelect(weekIdx)}
              className={`w-full h-9 rounded-md text-xs font-semibold tabular-nums transition-all ${cellStyle(cell.productivity)} ${
                isSel ? "ring-2 ring-violet-400 ring-offset-1 dark:ring-offset-gray-900" : ""
              }`}
              title={`${cell.created} created · ${cell.closed} closed`}
            >
              {cell.productivity === null ? "—" : `${cell.productivity}%`}
            </button>
          </td>
        );
      })}
    </tr>
  );
}

function cellStyle(score: number | null): string {
  if (score === null) return "bg-gray-100 dark:bg-gray-800 text-gray-300";
  const tone = productivityTone(score);
  if (tone === "high") return "bg-emerald-500/85 text-white hover:bg-emerald-500";
  if (tone === "medium") return "bg-amber-400/85 text-white hover:bg-amber-400";
  return "bg-red-500/85 text-white hover:bg-red-500";
}

function Legend({ tone, label }: { tone: "high" | "medium" | "low"; label: string }) {
  const color = tone === "high" ? "bg-emerald-500" : tone === "medium" ? "bg-amber-400" : "bg-red-500";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function DrillIn({
  data,
  selection,
  onClose,
}: {
  data: ExecutiveReportData;
  selection: { rowId: string; weekIdx: number };
  onClose: () => void;
}) {
  const row = data.teamHeatmap.find((r) => r.teamId === selection.rowId);
  const cell = row?.cells[selection.weekIdx];
  if (!row || !cell) return null;
  const week = data.weeks[selection.weekIdx];
  return (
    <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">
          {row.teamName} · {week?.weekLabel}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          Close
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Productivity" value={cell.productivity === null ? "—" : `${cell.productivity}%`} />
        <Tile label="Created" value={String(cell.created)} />
        <Tile label="Closed" value={String(cell.closed)} />
        <Tile label="Open" value={String(Math.max(0, cell.created - cell.closed))} />
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-base font-semibold tabular-nums text-gray-900 dark:text-gray-100 mt-0.5">{value}</div>
    </div>
  );
}
