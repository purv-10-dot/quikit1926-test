"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * Cursor-following hover tooltip used across the Summary charts. The styled
 * card tracks the pointer and renders above it, so it works equally well on
 * narrow and full-width bars without landing far from the cursor.
 *
 * Keep `overflow-hidden` on the inner track only (a child of `children`),
 * never on this wrapper, or the card will clip.
 */
export function ChartTip({
  swatch,
  label,
  value,
  content,
  children,
  className = "",
}: {
  /** Optional color dot shown before the label (simple mode). */
  swatch?: string;
  /** Simple mode: a single label + value row. */
  label?: string;
  value?: string;
  /** Rich mode: arbitrary tooltip body (overrides label/value). */
  content?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  function move(e: React.MouseEvent) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  }

  return (
    <div
      ref={ref}
      className={`relative ${className}`}
      onMouseMove={move}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && (
        <span
          className="pointer-events-none absolute z-30 flex -translate-x-1/2 -translate-y-full flex-col gap-1 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: pos.x, top: pos.y - 10 }}
        >
          {content ?? (
            <span className="flex items-center gap-2">
              {swatch && (
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: swatch }} />
              )}
              <span className="font-medium text-gray-900">{label}</span>
              <span className="tabular-nums text-gray-500">{value}</span>
            </span>
          )}
        </span>
      )}
    </div>
  );
}
