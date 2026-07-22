"use client";

import type { ReactNode } from "react";

export function OverviewStat({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start min-w-0">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </div>
        <div className="mt-0.5 text-sm text-gray-900 truncate">{children}</div>
      </div>
    </div>
  );
}
