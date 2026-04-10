"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";

export function NameTooltip({ name, children }: { name: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function handleEnter() {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left });
    }
  }

  return (
    <div ref={ref} className="inline-block w-full" onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
      {children}
      {pos && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="max-w-xs bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none"
        >
          <div className="absolute bottom-full left-4 border-4 border-transparent border-b-gray-900" />
          <p className="text-white leading-snug">{name}</p>
        </div>,
        document.body
      )}
    </div>
  );
}
