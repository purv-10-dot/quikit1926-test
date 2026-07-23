"use client";

import { AlertTriangle, Info } from "lucide-react";
import type { ImportIssue } from "../lib/types";

export function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-xl font-bold text-gray-900 mt-0.5">{value}</div>
    </div>
  );
}

export function IssueList({
  title,
  issues,
  tone,
}: {
  title: string;
  issues: ImportIssue[];
  tone: "error" | "warning";
}) {
  const colors =
    tone === "error"
      ? "bg-red-50 border-red-200 text-red-700"
      : "bg-amber-50 border-amber-200 text-amber-700";
  const Icon = tone === "error" ? AlertTriangle : Info;
  return (
    <div className={`border rounded-lg ${colors}`}>
      <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider border-b border-current/10 flex items-center gap-2">
        <Icon className="w-3.5 h-3.5" /> {title}
      </div>
      <ul className="divide-y divide-current/10 max-h-48 overflow-y-auto">
        {issues.slice(0, 50).map((i, idx) => (
          <li key={idx} className="px-4 py-2 text-xs">
            <span className="text-[10px] opacity-60">[{i.code}]</span>{" "}
            {i.sheet && <span className="font-semibold">{i.sheet}</span>}
            {i.rowNumber && <span className="opacity-60"> · row {i.rowNumber}</span>}
            {i.boqNo && <span className="opacity-60"> · {i.boqNo}</span>}
            <div className="mt-0.5">{i.message}</div>
          </li>
        ))}
        {issues.length > 50 && (
          <li className="px-4 py-2 text-[10px] opacity-60 italic">
            …and {issues.length - 50} more
          </li>
        )}
      </ul>
    </div>
  );
}
