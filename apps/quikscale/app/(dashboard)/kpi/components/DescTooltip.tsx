"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";

export function DescTooltip({ description, lastNotes, lastNotesAt, children }: {
  description?: string | null; lastNotes?: string | null; lastNotesAt?: string | null; children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const text = lastNotes || description;
  if (!text) return <>{children}</>;

  function handleEnter() {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left });
    }
  }

  return (
    <div ref={ref} className="relative" onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
      {children}
      {pos && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-64 bg-gray-900 text-white text-xs rounded-lg p-2.5 shadow-lg pointer-events-none"
        >
          <div className="absolute bottom-full left-4 border-4 border-transparent border-b-gray-900" />
          <p className="font-medium mb-1 text-gray-200">Last Note</p>
          <p className="text-gray-300 line-clamp-4">{text}</p>
          {lastNotesAt && (
            <p className="text-gray-500 mt-1.5 text-[10px]">
              {new Date(lastNotesAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
