"use client";

import { useState } from "react";

export function WeekTooltip({ weekNumber, value, note, children }: {
  weekNumber: number;
  value?: number | null;
  note?: string | null;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const hasContent = value !== undefined && value !== null || !!note;
  if (!hasContent) return <>{children}</>;
  return (
    <div className="relative inline-flex justify-center w-full h-full"
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-52 bg-gray-900 text-white text-xs rounded-lg p-3 z-50 shadow-xl pointer-events-none">
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
          <p className="font-semibold text-gray-200 mb-1.5 text-[11px]">Week {weekNumber}</p>
          {value !== undefined && value !== null && (
            <p className="text-gray-300 text-[11px]">Value: <span className="text-white font-medium">{value}</span></p>
          )}
          {note && (
            <p className="text-gray-300 text-[11px] leading-relaxed whitespace-pre-wrap mt-1.5 pt-1.5 border-t border-gray-700">{note}</p>
          )}
        </div>
      )}
    </div>
  );
}
