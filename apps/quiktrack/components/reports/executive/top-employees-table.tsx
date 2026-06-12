"use client";

import { Info, ArrowUp, ArrowDown } from "lucide-react";
import type { EmployeeRow, ExecutiveReportData } from "./types";

interface Props {
  data: ExecutiveReportData;
  onSelect?: (row: EmployeeRow) => void;
}

export function TopEmployeesTable({ data, onSelect }: Props) {
  const rows = data.employees;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Top Employees by Productivity</h3>
          <Info className="h-3.5 w-3.5 text-gray-400" />
        </div>
        <button type="button" className="text-xs text-violet-600 dark:text-violet-400 hover:underline">
          View All
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No employees with completed tasks in this period.
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="text-left py-2 font-medium">Employee</th>
                <th className="text-left py-2 font-medium">Department</th>
                <th className="text-left py-2 font-medium">Productivity</th>
                <th className="text-left py-2 font-medium">Tasks Completed</th>
                <th className="text-left py-2 font-medium">On-time Rate</th>
                <th className="text-left py-2 font-medium">Trend (WoW)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.userId}
                  className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer"
                  onClick={() => onSelect?.(row)}
                >
                  <td className="py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={row.name} src={row.avatar} />
                      <span className="text-gray-900 dark:text-gray-100 font-medium">{row.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-gray-600 dark:text-gray-400">{row.teamName ?? "—"}</td>
                  <td className="py-3">
                    <span className={productivityClass(row.productivity)}>{row.productivity}%</span>
                  </td>
                  <td className="py-3 text-gray-700 dark:text-gray-300 tabular-nums">{row.tasksClosed}</td>
                  <td className="py-3 text-gray-700 dark:text-gray-300 tabular-nums">{row.onTimeRate}%</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <TrendSpark values={row.trend} />
                      <TrendDelta values={row.trend} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function productivityClass(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums";
  if (score >= 60) return "text-amber-600 dark:text-amber-400 font-semibold tabular-nums";
  return "text-red-600 dark:text-red-400 font-semibold tabular-nums";
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-700"
      />
    );
  }
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 text-[11px] font-semibold inline-flex items-center justify-center">
      {initials}
    </span>
  );
}

function TrendSpark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-gray-300">—</span>;
  const w = 72;
  const h = 22;
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const step = w / (values.length - 1);
  const norm = (v: number) => h - ((v - min) / Math.max(1, max - min)) * h;
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${norm(v).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline points={points} fill="none" stroke="#10b981" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

function TrendDelta({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const last = values[values.length - 1] ?? 0;
  const first = values[0] ?? 0;
  const delta = last - first;
  const good = delta >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${
        good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
      }`}
    >
      {good ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(delta)}%
    </span>
  );
}
