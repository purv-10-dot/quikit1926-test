"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Filter as FilterIcon } from "lucide-react";

/**
 * Filter icon button + a portal-rendered dropdown panel.
 *
 * The panel is portalled to <body> with fixed positioning anchored to the
 * button, so it is never clipped by an ancestor's `overflow-hidden` (the list
 * cards clip their rounded corners, which would otherwise cut a tall popover
 * off when the table is short). Caller supplies the filter controls as
 * `children`; this component owns the open/close, click-away, badge, and the
 * "Filters / Clear all" header.
 */
export function FilterPopoverButton({
  activeCount,
  onClear,
  children,
  width = 288,
}: {
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  const place = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
  };

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    place();
    setOpen(true);
  };

  // Keep the panel anchored to the button while it's open.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={`relative p-2 rounded-lg border transition-colors ${
          open || activeCount > 0
            ? "text-accent-700 bg-accent-50 border-accent-200"
            : "text-slate-400 hover:text-accent-700 hover:bg-accent-50 border-transparent hover:border-accent-200"
        }`}
        title="Filters"
        aria-expanded={open}
      >
        <FilterIcon className="w-4 h-4" />
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white bg-accent-600">
            {activeCount}
          </span>
        )}
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <div
              className="fixed z-[61] rounded-xl border border-slate-200 bg-white shadow-lg p-4 space-y-3"
              style={{ top: pos.top, right: pos.right, width }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Filters
                </span>
                {activeCount > 0 && (
                  <button
                    type="button"
                    onClick={onClear}
                    className="text-[11px] font-semibold text-accent-600 hover:text-accent-700"
                  >
                    Clear all
                  </button>
                )}
              </div>
              {children}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}