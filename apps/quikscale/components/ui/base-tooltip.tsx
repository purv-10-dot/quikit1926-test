"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Low-level portal-based tooltip used by domain-specific tooltip wrappers
 * (NameTooltip, WeekTooltip, TextTooltip, NoteTooltip, etc.).
 *
 * Handles the shared plumbing: hover state, getBoundingClientRect positioning,
 * createPortal to document.body, and the dark rounded-lg container.
 *
 * Domain-specific wrappers keep full control over:
 *   - `width` (w-44, w-64, w-72, w-80)
 *   - `arrowPosition` ("left" = fixed left-4, "center" = centered)
 *   - `content` (any ReactNode — header + description, week + status, etc.)
 *   - `offsetLeft` — pixel offset from element's left edge (0 = align to left)
 *
 * This replaces ~35 lines of repeated portal + hover logic per tooltip variant.
 */

export interface BaseTooltipProps {
  /** Tooltip body content. When falsy, renders only children (no tooltip). */
  content: React.ReactNode;
  /** Tailwind width class (e.g. "w-72", "w-44"). Default "w-64". */
  width?: string;
  /** Arrow alignment. Default "left". */
  arrowPosition?: "left" | "center";
  /**
   * How to compute the left position from the trigger rect.
   * Default: align to element's left edge.
   * Pass a function for custom positioning (e.g. center on element).
   */
  getLeft?: (rect: DOMRect) => number;
  /** Extra className applied to the outer tooltip div. */
  className?: string;
  /** Extra className applied to the wrapper div around children. */
  wrapperClassName?: string;
  children: React.ReactNode;
}

export function BaseTooltip({
  content,
  width = "w-64",
  arrowPosition = "left",
  getLeft,
  className = "",
  wrapperClassName = "",
  children,
}: BaseTooltipProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);

  if (!content) return <>{children}</>;

  function handleMouseEnter() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: rect.bottom + 6,
        left: getLeft ? getLeft(rect) : rect.left,
      });
    }
    setShow(true);
  }

  const arrowClass =
    arrowPosition === "center"
      ? "left-1/2 -translate-x-1/2"
      : "left-4";

  return (
    <div
      ref={ref}
      className={wrapperClassName}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
            className={`${width} bg-gray-900 text-white text-xs rounded-lg shadow-xl pointer-events-none ${className}`}
          >
            <div
              className={`absolute bottom-full ${arrowClass} border-4 border-transparent border-b-gray-900`}
            />
            {content}
          </div>,
          document.body,
        )}
    </div>
  );
}
