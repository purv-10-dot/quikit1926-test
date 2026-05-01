"use client";

/**
 * HorizontalScroller — generic horizontal-overflow wrapper that:
 *   1. Hides native scrollbars (both axes; vertical scroll still works via
 *      wheel/trackpad/keyboard — main tables are paginated so vertical
 *      overflow is rare in practice).
 *   2. Shows fade gradient on the left/right edges when content overflows.
 *   3. Renders a custom progress bar below the scroll area — draggable,
 *      click-to-jump, aria-scrollbar compliant.
 *
 * Drop-in replacement for any `<div className="overflow-auto">` wrapper that
 * contains a wide table. Works with sticky headers and sticky columns — the
 * scroller only wraps the overflow container, so sticky positioning is
 * relative to this element (same behavior as a raw overflow div).
 *
 * Use via:
 *   <HorizontalScroller className="flex-1">
 *     <table>…</table>
 *   </HorizontalScroller>
 */

import { useEffect, useRef, useState, useCallback, type ReactNode, type CSSProperties } from "react";

interface Props {
  children: ReactNode;
  /** Class on the outer wrapper (layout — e.g. flex-1, h-full, etc.) */
  className?: string;
  /** Class on the inner scroll container (e.g. border, rounded-lg, background) */
  innerClassName?: string;
  /** Inline style on the inner scroll container (e.g. maxHeight) */
  innerStyle?: CSSProperties;
  /**
   * Thumb accent color class. Default = accent-themed.
   * Pass e.g. "bg-gray-500" for neutral contexts.
   */
  thumbClassName?: string;
  /** Hide the custom progress bar (keep only the fade edges). Default false. */
  hideBar?: boolean;
  /**
   * Hide fade edges (keep only the bar). Default false.
   * Useful when table has its own sticky column with a shadow.
   */
  hideFades?: boolean;
}

export function HorizontalScroller({
  children,
  className = "",
  innerClassName = "",
  innerStyle,
  thumbClassName,
  hideBar = false,
  hideFades = false,
}: Props) {
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
  const thumbWidthPct = canScroll ? Math.max(10, (metrics.clientWidth / metrics.scrollWidth) * 100) : 100;
  const thumbLeftPct = scrollPct * (100 - thumbWidthPct);

  const showLeftFade = !hideFades && canScroll && metrics.scrollLeft > 2;
  const showRightFade = !hideFades && canScroll && metrics.scrollLeft < maxScroll - 2;

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

    if (e.nativeEvent instanceof MouseEvent) onMove(e.nativeEvent.clientX);
    else if (e.nativeEvent instanceof TouchEvent && e.nativeEvent.touches[0]) {
      onMove(e.nativeEvent.touches[0].clientX);
    }
  };

  const thumbColor = dragging
    ? (thumbClassName ?? "bg-accent-600")
    : (thumbClassName ?? "bg-accent-400 group-hover:bg-accent-500");

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          className={`h-full overflow-auto horizontal-scroller-hide ${innerClassName}`}
          style={innerStyle}
        >
          {children}
        </div>

        {showLeftFade && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 h-full w-8"
            style={{ background: "linear-gradient(to right, rgba(255,255,255,0.95), rgba(255,255,255,0))" }}
          />
        )}
        {showRightFade && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 h-full w-8"
            style={{ background: "linear-gradient(to left, rgba(255,255,255,0.95), rgba(255,255,255,0))" }}
          />
        )}
      </div>

      {!hideBar && canScroll && (
        <div
          ref={trackRef}
          role="scrollbar"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(scrollPct * 100)}
          onMouseDown={startDrag}
          onTouchStart={startDrag}
          className="relative mt-1.5 h-1.5 rounded-full bg-gray-100 hover:bg-gray-150 cursor-pointer group flex-shrink-0"
        >
          <div
            className={`absolute top-0 h-full rounded-full transition-colors ${thumbColor}`}
            style={{ width: `${thumbWidthPct}%`, left: `${thumbLeftPct}%` }}
          />
        </div>
      )}

      <style jsx>{`
        .horizontal-scroller-hide {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .horizontal-scroller-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
