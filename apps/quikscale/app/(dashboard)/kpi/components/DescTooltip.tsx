"use client";

import { useState } from "react";

export function DescTooltip({ description, lastNotes, lastNotesAt, children }: {
  description?: string | null; lastNotes?: string | null; lastNotesAt?: string | null; children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const text = lastNotes || description;
  if (!text) return <>{children}</>;
  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-gray-900 text-white text-xs rounded-lg p-2.5 z-50 shadow-lg pointer-events-none">
          <div className="absolute bottom-full left-4 border-4 border-transparent border-b-gray-900" />
          <p className="font-medium mb-1 text-gray-200">Last Note</p>
          <p className="text-gray-300 line-clamp-4">{text}</p>
          {lastNotesAt && (
            <p className="text-gray-500 mt-1.5 text-[10px]">
              {new Date(lastNotesAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
