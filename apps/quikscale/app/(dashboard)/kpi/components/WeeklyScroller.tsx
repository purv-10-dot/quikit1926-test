"use client";

/**
 * WeeklyScroller — custom horizontal scroll container for the Target Breakdown
 * (Weekly) table in KPIModal. Replaces the browser-default scrollbar with:
 *   1. Fade gradient edges (left/right) — hint that more content is off-screen
 *   2. Custom progress bar below — shows scroll position AND extent; draggable
 *
 * Hides native scrollbar (webkit + firefox). Exposes scroll via the custom bar
 * and via wheel/touch/keyboard (native scroll semantics preserved).
 */

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional extra class on the outer wrapper */
  className?: string;
}

export function WeeklyScroller({ children, className = "" }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 });
  const [dragging, setDragging] = useState(false);

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
    // Also watch table contents for size changes
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
  const scrollPct = canScroll ? metrics.scrollLeft / maxScroll : 0;
  const thumbWidthPct = canScroll ? Math.max(15, (metrics.clientWidth / metrics.scrollWidth) * 100) : 100;
  const thumbLeftPct = scrollPct * (100 - thumbWidthPct);

  const showLeftFade = canScroll && metrics.scrollLeft > 2;
  const showRightFade = canScroll && metrics.scrollLeft < maxScroll - 2;

  // Drag thumb to scroll
  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canScroll) return;
    e.preventDefault();
    setDragging(true);
    const track = trackRef.current;
    const scroll = scrollRef.current;
    if (!track || !scroll) return;

    const onMove = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      const thumbPxWidth = (thumbWidthPct / 100) * rect.width;
      const travelPx = rect.width - thumbPxWidth;
      const rawX = clientX - rect.left - thumbPxWidth / 2;
      const clamped = Math.max(0, Math.min(travelPx, rawX));
      const pct = travelPx > 0 ? clamped / travelPx : 0;
      scroll.scrollLeft = pct * maxScroll;
    };

    const onMouseMove = (ev: MouseEvent) => onMove(ev.clientX);
    const onTouchMove = (ev: TouchEvent) => ev.touches[0] && onMove(ev.touches[0].clientX);
    const onEnd = () => {
      setDragging(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onEnd);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onEnd);

    // Jump-to on initial click (if user clicked the track, not the thumb itself)
    if (e.nativeEvent instanceof MouseEvent) onMove(e.nativeEvent.clientX);
    else if (e.nativeEvent instanceof TouchEvent && e.nativeEvent.touches[0]) {
      onMove(e.nativeEvent.touches[0].clientX);
    }
  };

  return (
    <div className={className}>
      <div className="relative">
        {/* Scroll area — hide native scrollbar */}
        <div
          ref={scrollRef}
          className="border border-gray-200 rounded-lg overflow-x-auto weekly-scroll-hide"
        >
          {children}
        </div>

        {/* Left fade */}
        {showLeftFade && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 h-full w-8 rounded-l-lg"
            style={{ background: "linear-gradient(to right, rgba(255,255,255,0.95), rgba(255,255,255,0))" }}
          />
        )}
        {/* Right fade */}
        {showRightFade && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 h-full w-8 rounded-r-lg"
            style={{ background: "linear-gradient(to left, rgba(255,255,255,0.95), rgba(255,255,255,0))" }}
          />
        )}
      </div>

      {/* Custom progress bar */}
      {canScroll && (
        <div
          ref={trackRef}
          role="scrollbar"
          aria-controls="weekly-target-scroll"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(scrollPct * 100)}
          onMouseDown={startDrag}
          onTouchStart={startDrag}
          className="relative mt-1.5 h-1.5 rounded-full bg-gray-100 hover:bg-gray-150 cursor-pointer group"
        >
          <div
            className={`absolute top-0 h-full rounded-full transition-colors ${
              dragging ? "bg-accent-600" : "bg-accent-400 group-hover:bg-accent-500"
            }`}
            style={{ width: `${thumbWidthPct}%`, left: `${thumbLeftPct}%` }}
          />
        </div>
      )}

      {/* Hide native scrollbar styles */}
      <style jsx>{`
        .weekly-scroll-hide {
          scrollbar-width: none; /* Firefox */
          -ms-overflow-style: none; /* IE/Edge legacy */
        }
        .weekly-scroll-hide::-webkit-scrollbar {
          display: none; /* Chrome/Safari */
        }
      `}</style>
    </div>
  );
}
