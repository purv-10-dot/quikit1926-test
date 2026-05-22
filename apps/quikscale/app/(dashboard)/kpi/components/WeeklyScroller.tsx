"use client";

/**
 * WeeklyScroller — horizontal scroll container for the Target Breakdown
 * (Weekly) table in KPIModal / LogModal.
 *
 * Uses the native browser horizontal scrollbar (reliable across themes,
 * tenants and modal mount states). The global `@quikit/ui/styles` rule
 * hides every scrollbar app-wide, so this component re-enables one
 * locally via `.weekly-scroll-show`. Adds fade gradients at the
 * left/right edges to hint that more content is off-screen.
 */

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional extra class on the outer wrapper */
  className?: string;
}

export function WeeklyScroller({ children, className = "" }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 });

  const recalc = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setMetrics({ scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    const firstChild = el.firstElementChild;
    if (firstChild) ro.observe(firstChild);
    el.addEventListener("scroll", recalc, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", recalc);
    };
  }, [recalc]);

  const maxScroll = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  const canScroll = maxScroll > 1;
  const showLeftFade = canScroll && metrics.scrollLeft > 2;
  const showRightFade = canScroll && metrics.scrollLeft < maxScroll - 2;

  return (
    <div className={className}>
      <div className="relative">
        <div
          ref={scrollRef}
          className="weekly-scroll-show border border-gray-200 rounded-lg overflow-x-auto"
        >
          {children}
        </div>
        {showLeftFade && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 h-full w-8 rounded-l-lg"
            style={{ background: "linear-gradient(to right, rgba(255,255,255,0.95), rgba(255,255,255,0))" }}
          />
        )}
        {showRightFade && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 h-full w-8 rounded-r-lg"
            style={{ background: "linear-gradient(to left, rgba(255,255,255,0.95), rgba(255,255,255,0))" }}
          />
        )}
      </div>

      {/* Local override for the global `*::-webkit-scrollbar { display: none }`
          rule in @quikit/ui/styles — re-enables a native scrollbar on just this
          element so the user can see (and use) horizontal scroll on the
          Target Breakdown table. `global` skips styled-jsx class scoping
          (which mangles `::-webkit-scrollbar` selectors) and `!important`
          beats the universal-selector rule defined in the shared package. */}
      <style jsx global>{`
        .weekly-scroll-show {
          scrollbar-width: thin !important;
          scrollbar-color: #9ca3af #f3f4f6 !important;
        }
        .weekly-scroll-show::-webkit-scrollbar {
          display: block !important;
          height: 8px !important;
          width: 8px !important;
        }
        .weekly-scroll-show::-webkit-scrollbar-track {
          background: #f3f4f6 !important;
          border-radius: 4px !important;
        }
        .weekly-scroll-show::-webkit-scrollbar-thumb {
          background: #9ca3af !important;
          border-radius: 4px !important;
        }
        .weekly-scroll-show::-webkit-scrollbar-thumb:hover {
          background: #6b7280 !important;
        }
      `}</style>
    </div>
  );
}
