"use client";

import type { ReactNode } from "react";

export function InfoField({ label, value, bold }: { label: string; value: ReactNode; bold?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <div className={`text-sm mt-0.5 ${bold ? "font-bold text-gray-900" : "text-gray-700"}`}>{value ?? "—"}</div>
    </div>
  );
}

// Single finance cell — used to render the 6-pill breakdown row
// (Amount / Line Disc / Net / Tax / Freight / Other) directly under
// the PO line items table. The thin 1px divider between cells is
// painted by the parent's `gap-px` + `bg-gray-200` trick so every
// cell shares a clean gridline without extra markup.
export function StatCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
        {label}
      </div>
      <div className="text-base font-bold text-gray-900 tabular-nums mt-1">
        {value}
      </div>
      {sub != null && (
        <div className="text-[10px] text-gray-500 tabular-nums mt-0.5 leading-tight">
          {sub}
        </div>
      )}
    </div>
  );
}


