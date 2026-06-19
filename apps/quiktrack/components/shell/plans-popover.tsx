"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X, Sparkles, Lock } from "lucide-react";

/**
 * Promotional popover anchored to the Plans sidebar entry — pitches the
 * advanced planning tier. Renders with `position: fixed` so it escapes any
 * `overflow-hidden` parent (the dashboard layout clips its sidebar column,
 * which would otherwise hide this popover entirely).
 */
export function PlansPopover({
  onClose,
  onReadGuide,
  onTryItFree,
  anchorRef,
}: {
  onClose: () => void;
  onReadGuide?: () => void;
  onTryItFree?: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  // Position right-of-anchor, top-aligned. Recompute on mount + scroll/resize
  // so a scrolling sidebar drags the popover with it.
  useLayoutEffect(() => {
    function place() {
      const a = anchorRef.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      setPos({ left: r.right + 8, top: r.top });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef]);

  // Outside-click + Escape close.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, anchorRef]);

  return (
    <div
      ref={ref}
      style={{ left: pos.left, top: pos.top }}
      className="fixed w-[300px] bg-white border border-gray-200 rounded-lg shadow-xl z-[100]"
      role="dialog"
      aria-label="Plans"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">Plans</span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 text-gray-500"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-3">
        {/* Hero illustration — flat SVG-style mock of a Gantt chart with a
            lock icon, kept inline so the popover ships without an image asset. */}
        <div className="relative h-28 rounded-md bg-gradient-to-br from-sky-50 via-indigo-50 to-purple-50 border border-blue-100 overflow-hidden">
          <svg viewBox="0 0 240 100" className="absolute inset-0 w-full h-full">
            <rect x="20" y="22" width="80" height="9" rx="2" fill="#a78bfa" />
            <rect x="40" y="38" width="120" height="9" rx="2" fill="#60a5fa" />
            <rect x="60" y="54" width="60" height="9" rx="2" fill="#34d399" />
            <rect x="100" y="70" width="100" height="9" rx="2" fill="#fbbf24" />
            <line x1="130" y1="10" x2="130" y2="92" stroke="#ef4444" strokeWidth="1.5" />
          </svg>
          <div className="absolute right-3 bottom-3 h-9 w-9 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow">
            <Lock className="h-4 w-4 text-gray-700" />
          </div>
        </div>

        <h3 className="mt-3 text-[13px] font-semibold text-gray-900">
          Unlock advanced planning tools
        </h3>
        <p className="mt-1 text-xs text-gray-600 leading-snug">
          Boost agility with capacity planning, dependency mapping, and more. Try
          QuikTrack Premium&apos;s high-level cross-team planning tools.
        </p>

        <div className="mt-3 flex items-center justify-between">
          {/* <button
            type="button"
            onClick={onReadGuide}
            className="text-xs text-blue-600 hover:underline"
          >
            Read the guide
          </button> */}
          <button
            type="button"
            onClick={onTryItFree}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-white rounded bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700"
          >
            <Sparkles className="h-3.5 w-3.5" />
          Comming soon
          </button>
        </div>
      </div>
    </div>
  );
}
