"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";

interface ComingSoonRowProps {
  icon: React.ElementType;
  label: string;
  description?: string;
  indent?: boolean;
  trailing?: React.ReactNode;
}

/**
 * Sidebar row that doesn't link anywhere — clicking it opens a small
 * "coming soon" popover anchored next to the row. Used for nav entries
 * whose destination route isn't built yet (Filters, Customers, …) so
 * users get a clear "not yet" instead of a 404.
 *
 * Renders the popover with `position: fixed` so it escapes the sidebar's
 * scroll/overflow container — same pattern as PlansPopover.
 */
export function ComingSoonRow({
  icon: Icon,
  label,
  description,
  indent,
  trailing,
}: ComingSoonRowProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-3 ${indent ? "pl-9" : ""} h-8 text-sm rounded w-full text-left text-gray-700 hover:bg-gray-100`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        {trailing}
      </button>
      {open && (
        <ComingSoonPopover
          anchorRef={anchorRef}
          label={label}
          description={description}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ComingSoonPopover({
  anchorRef,
  label,
  description,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  label: string;
  description?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

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
      className="fixed w-[260px] bg-white border border-gray-200 rounded-lg shadow-xl z-[100]"
      role="dialog"
      aria-label={`${label} — coming soon`}
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">{label}</span>
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
        <div className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium text-white rounded bg-gradient-to-r from-violet-600 to-blue-600">
          <Sparkles className="h-3.5 w-3.5" />
          Coming soon
        </div>
        <p className="mt-2.5 text-xs text-gray-600 leading-snug">
          {description ?? `${label} isn't available yet — it's on the QuikTrack roadmap.`}
        </p>
      </div>
    </div>
  );
}
