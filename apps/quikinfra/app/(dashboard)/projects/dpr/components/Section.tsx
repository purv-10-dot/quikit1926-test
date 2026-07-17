"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";

export function Section({
  id,
  icon,
  title,
  count,
  action,
  children,
  defaultOpen,
}: {
  id?: string;
  icon: React.ReactNode;
  title: string;
  /** When provided, shows a count chip in the header. > 0 also flips the
   *  icon to a green check so users can see at a glance which sections
   *  have content. */
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  /**
   * Initial open state. When omitted, sections start collapsed unless
   * they already have data (count > 0) — that way a fresh DPR opens
   * with every section closed (user clicks the one they want), but in
   * edit mode the populated sections auto-expand so the existing data
   * is visible without extra clicks.
   */
  defaultOpen?: boolean;
}) {
  const hasData = (count ?? 0) > 0;
  const [open, setOpen] = useState(defaultOpen ?? hasData);
  const showCount = typeof count === "number";

  // Auto-open the section whenever the SectionNav fires a request for
  // it. Clicking a SectionNav pill both scrolls AND emits this custom
  // event so the target section expands immediately — without this the
  // user lands on a collapsed header and has to click a second time.
  // (hashchange-based listening was tried first but doesn't fire when
  // the user re-clicks the same pill, so a custom event is more robust.)
  useEffect(() => {
    if (!id) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id === id) setOpen(true);
    };
    window.addEventListener("dpr:section-open", handler as EventListener);
    return () =>
      window.removeEventListener("dpr:section-open", handler as EventListener);
  }, [id]);

  return (
    <section
      id={id}
      className={`scroll-mt-24 rounded-xl border bg-white overflow-hidden transition-colors ${
        hasData
          ? "border-emerald-200/70 shadow-[0_1px_0_0_rgba(16,185,129,0.08)]"
          : "border-slate-200"
      }`}
    >
      <header
        className={`flex items-center gap-3 px-4 py-3 border-b ${
          hasData ? "bg-emerald-50/30 border-emerald-100" : "bg-slate-50/60 border-slate-100"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
        >
          <span
            className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ring-1 transition-colors shrink-0 ${
              hasData
                ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
                : "bg-orange-50 text-orange-600 ring-orange-100"
            }`}
          >
            {hasData ? <CheckCircle2 className="w-4 h-4" /> : icon}
          </span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              {title}
            </span>
            {showCount && count! > 0 && (
              <span
                className={`inline-flex items-center px-1.5 h-[18px] rounded-full text-[10px] font-bold tabular-nums ${
                  hasData
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {count}
              </span>
            )}
          </span>
          <ChevronDown
            className={`ml-auto w-4 h-4 text-slate-400 transition-transform shrink-0 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
        {action && (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {action}
          </div>
        )}
      </header>
      <div
        className={`overflow-hidden transition-[grid-template-rows] grid ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        {/* `min-h-0 min-w-0` is load-bearing — grid items default to
            `min-width: auto`, which lets wide children (e.g. the
            min-w-[1340px] Work Done table) push the grid wider than the
            section itself, breaking any inner `overflow-x-auto`. Pinning
            min-width to 0 lets the descendant scroll container do its job. */}
        <div className="min-h-0 min-w-0">
          <div className="p-4">{children}</div>
        </div>
      </div>
    </section>
  );
}