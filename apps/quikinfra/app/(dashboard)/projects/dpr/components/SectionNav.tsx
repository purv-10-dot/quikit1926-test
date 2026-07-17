"use client";

import { CheckCircle2 } from "lucide-react";

/**
 * SectionNav — sticky pill row showing all DPR sections with their item
 * counts. Acts as a quick-jump table of contents so users can see at a
 * glance which sections have content and skip directly to the one they
 * want to fill in next.
 */
export function SectionNav({
  items,
}: {
  items: Array<{
    id: string;
    label: string;
    icon: React.ReactNode;
    count: number;
  }>;
}) {
  return (
    <div className="pl-6 pr-14 py-3 bg-slate-50/60 border-b border-slate-200">
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
          Sections
        </span>
        {items.map((s) => {
          const filled = s.count > 0;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                // Take over from the browser so we can guarantee both
                // (a) the target section expands — emit the custom event
                //     the Section component listens for; and
                // (b) it scrolls into view smoothly. The native anchor
                //     would scroll but wouldn't expand a collapsed
                //     section, leaving the user staring at just a
                //     header.
                e.preventDefault();
                window.dispatchEvent(
                  new CustomEvent("dpr:section-open", { detail: { id: s.id } }),
                );
                document
                  .getElementById(s.id)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={`group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold whitespace-nowrap transition-colors ${
                filled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300"
                  : "border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-700"
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-4 h-4 rounded-full ${
                  filled ? "text-emerald-600" : "text-slate-400 group-hover:text-orange-600"
                }`}
              >
                {filled ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.icon}
              </span>
              <span>{s.label}</span>
              {filled && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-emerald-600 text-white text-[9px] font-bold tabular-nums">
                  {s.count}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}