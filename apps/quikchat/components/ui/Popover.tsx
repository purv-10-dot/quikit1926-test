import * as React from "react";
import { createPortal } from "react-dom";

export interface PopoverProps {
  /** The clickable trigger. Rendered inline; the popover anchors to it. */
  trigger: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Preferred vertical placement; flips if it would overflow the viewport. */
  placement?: "top" | "bottom";
  label?: string;
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Pure viewport-collision resolver (unit-tested). Returns absolute viewport
 * coordinates for a `position: fixed` panel (it's portaled to document.body, so
 * it can't be positioned relative to the trigger's subtree). Flips top↔bottom
 * when the preferred side would overflow, left-aligns to the trigger, and clamps
 * horizontally within the viewport (4px margin).
 */
export function resolvePopover(
  trigger: Rect,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  placement: "top" | "bottom",
  gap = 6,
): { placement: "top" | "bottom"; top: number; left: number } {
  let pl = placement;
  if (pl === "top" && trigger.top - gap - panel.height < 0) {
    pl = "bottom";
  } else if (
    pl === "bottom" &&
    trigger.top + trigger.height + gap + panel.height > viewport.height
  ) {
    pl = "top";
  }
  const top = pl === "top" ? trigger.top - gap - panel.height : trigger.top + trigger.height + gap;
  const margin = 4;
  let left = trigger.left;
  const overflowRight = left + panel.width - (viewport.width - margin);
  if (overflowRight > 0) left -= overflowRight;
  if (left < margin) left = margin;
  return { placement: pl, top, left };
}

/**
 * Anchored popover: click-outside + Escape to close, focus moves into the panel
 * on open. The panel is portaled to `document.body` and `position: fixed` at
 * viewport coordinates from `resolvePopover`, so it escapes any ancestor
 * stacking context (e.g. the message toolbar / conversation header) that would
 * otherwise paint over it and intercept clicks. Re-measures on resize/scroll so
 * the fixed panel tracks the trigger as the list scrolls.
 */
export function Popover({
  trigger,
  children,
  open: controlledOpen,
  onOpenChange,
  placement = "top",
  label,
}: PopoverProps) {
  const [uncontrolled, setUncontrolled] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolled;
  const setOpen = (v: boolean) => {
    if (!isControlled) setUncontrolled(v);
    onOpenChange?.(v);
  };

  const wrapRef = React.useRef<HTMLSpanElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = React.useState<{
    placement: "top" | "bottom";
    top: number;
    left: number;
  }>({ placement, top: 0, left: 0 });

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      // The panel is portaled out of the wrapper, so exempt it explicitly —
      // otherwise a click inside the panel would count as "outside" and close it.
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Measure the laid-out panel and resolve its fixed viewport position. Shared
  // by the initial layout pass, the ResizeObserver (the emoji picker lazy-loads
  // its data, so the panel grows after first paint), and resize/scroll.
  const measure = React.useCallback(() => {
    if (!open) {
      setResolved({ placement, top: 0, left: 0 });
      return;
    }
    const wrap = wrapRef.current;
    const panel = panelRef.current;
    if (!wrap || !panel || typeof window === "undefined") return;
    const t = wrap.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    if (p.width === 0 && p.height === 0) return; // jsdom/SSR: keep preferred placement
    setResolved(
      resolvePopover(
        { top: t.top, left: t.left, width: t.width, height: t.height },
        { width: p.width, height: p.height },
        { width: window.innerWidth, height: window.innerHeight },
        placement,
      ),
    );
  }, [open, placement]);

  React.useLayoutEffect(() => {
    measure();
  }, [measure]);

  React.useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const onReflow = () => measure();
    window.addEventListener("resize", onReflow);
    // Capture so the fixed panel tracks the trigger when an inner scroller moves.
    window.addEventListener("scroll", onReflow, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onReflow) : null;
    if (ro && panelRef.current) ro.observe(panelRef.current);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
      ro?.disconnect();
    };
  }, [open, measure]);

  return (
    <span className="qc-popover" ref={wrapRef}>
      <span onClick={() => setOpen(!open)}>{trigger}</span>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className={`qc-popover__panel qc-popover__panel--${resolved.placement}`}
              role="dialog"
              aria-label={label}
              tabIndex={-1}
              style={{ top: resolved.top, left: resolved.left }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
