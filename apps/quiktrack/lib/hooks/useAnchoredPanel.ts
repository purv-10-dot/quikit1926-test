"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

/**
 * Where a fixed-position dropdown wants to sit, captured from its trigger at
 * click time: `y` is the preferred (downwards) edge, `flipY` the upwards one.
 */
export interface PanelAnchor {
  x: number;
  y: number;
  flipY: number;
}

/** Capture both placements from a trigger's rect. */
export function anchorFromRect(rect: DOMRect, gap = 4): PanelAnchor {
  return { x: rect.left, y: rect.bottom + gap, flipY: rect.top - gap };
}

/**
 * Keeps an anchored dropdown inside the viewport.
 *
 * Panels here are `position: fixed` and used to be pinned to the trigger's
 * bottom edge unconditionally, so one opened near the bottom of the idea panel
 * was cut off and its lower options unreachable. This measures the rendered
 * panel and then:
 *   • flips it above the trigger when it doesn't fit below and there's more
 *     room above,
 *   • caps its height to the space actually available (the panel scrolls),
 *   • clamps it horizontally so it never runs off either edge.
 *
 * Returns the style to spread onto the panel. It is hidden for the single
 * measuring frame so it never paints at the wrong spot.
 */
export function useAnchoredPanel(
  ref: RefObject<HTMLElement | null>,
  anchor: PanelAnchor | null,
  { width, margin = 8, minHeight = 140 }: { width?: number; margin?: number; minHeight?: number } = {},
): CSSProperties | undefined {
  const [placed, setPlaced] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!anchor || !el) {
      setPlaced(null);
      return;
    }

    const spaceBelow = window.innerHeight - anchor.y - margin;
    const spaceAbove = anchor.flipY - margin;
    // `scrollHeight` — the height the panel wants, even once maxHeight caps it,
    // so a re-measure can't latch onto the capped value and flip-flop.
    const wanted = Math.max(el.scrollHeight, el.offsetHeight);
    const goUp = wanted > spaceBelow && spaceAbove > spaceBelow;

    const maxHeight = Math.max(minHeight, goUp ? spaceAbove : spaceBelow);

    const panelWidth = width ?? el.offsetWidth;
    const left = Math.max(
      margin,
      Math.min(anchor.x, window.innerWidth - panelWidth - margin),
    );

    setPlaced({
      position: "fixed",
      left,
      // Pin the edge that touches the trigger: `top` when opening downwards,
      // `bottom` when flipped. Anchoring the flipped panel by its bottom means
      // later growth (a filtered list getting longer) expands upwards into the
      // free space instead of back out through the bottom of the window.
      ...(goUp
        ? { bottom: Math.max(margin, window.innerHeight - anchor.flipY) }
        : { top: anchor.y }),
      width,
      maxHeight,
      overflowY: "auto",
    });
  }, [anchor, ref, width, margin, minHeight]);

  if (!anchor) return undefined;
  return (
    placed ?? {
      position: "fixed",
      left: anchor.x,
      top: anchor.y,
      width,
      visibility: "hidden",
    }
  );
}
