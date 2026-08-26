// @vitest-environment jsdom

/**
 * Drag behaviour for the floating Contact Support FAB (`@quikit/ui/support`).
 *
 * Lives here rather than in packages/ui because packages/ui ships no test
 * runner. The hook is shared by every app's launcher — QuikTrack's included —
 * so these cases cover all of them.
 *
 * The load-bearing guarantees: the widget can never be parked outside the
 * viewport (drag or resize), and dropping it never toggles the panel.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  useDraggableFab,
  getAnchoredPanelStyle,
  FAB_SIZE_PX,
  SUPPORT_FAB_STORAGE_KEY,
} from "@quikit/ui/support";

/** jsdom's default viewport. Set explicitly so the expectations are readable. */
const VW = 1024;
const VH = 768;
/** Mirrors the hook's clamp margin. */
const MARGIN = 8;

function setViewport(w: number, h: number) {
  Object.defineProperty(window, "innerWidth", { value: w, writable: true, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: h, writable: true, configurable: true });
}

/** jsdom lays nothing out, so getBoundingClientRect must be faked for grab-offset math. */
function stubRect(el: HTMLElement, left: number, top: number) {
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      right: left + FAB_SIZE_PX,
      bottom: top + FAB_SIZE_PX,
      width: FAB_SIZE_PX,
      height: FAB_SIZE_PX,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

/** Minimal stand-in for the real launcher button. */
function Fab({ onToggle }: { onToggle?: () => void }) {
  const { position, isDragging, onPointerDown, didDrag } = useDraggableFab();
  return (
    <button
      data-testid="fab"
      data-dragging={isDragging}
      data-x={position?.x}
      data-y={position?.y}
      onPointerDown={onPointerDown}
      onClick={() => {
        if (didDrag()) return;
        onToggle?.();
      }}
    >
      support
    </button>
  );
}

function pos() {
  const el = screen.getByTestId("fab");
  return { x: Number(el.dataset.x), y: Number(el.dataset.y) };
}

/**
 * Press, move, release. Move/up go to `window` because that is where the hook
 * listens — the pointer routinely leaves the 56px button mid-drag.
 */
function drag(from: { x: number; y: number }, to: { x: number; y: number }) {
  const el = screen.getByTestId("fab");
  // Grab the FAB dead centre of wherever it currently sits.
  stubRect(el, from.x, from.y);
  const grabX = from.x + FAB_SIZE_PX / 2;
  const grabY = from.y + FAB_SIZE_PX / 2;

  fireEvent.pointerDown(el, { pointerId: 1, pointerType: "mouse", button: 0, clientX: grabX, clientY: grabY });
  act(() => {
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        clientX: to.x + FAB_SIZE_PX / 2,
        clientY: to.y + FAB_SIZE_PX / 2,
        cancelable: true,
      }),
    );
  });
  act(() => {
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
  });
}

beforeEach(() => {
  setViewport(VW, VH);
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("useDraggableFab", () => {
  it("rests in the bottom-right corner when nothing has been dragged", () => {
    render(<Fab />);
    // right-6 (sm and up) and bottom-24px, matching the pre-drag styling.
    expect(pos()).toEqual({ x: VW - FAB_SIZE_PX - 24, y: VH - FAB_SIZE_PX - 24 });
  });

  it("moves the FAB to where it is dropped", () => {
    render(<Fab />);
    const start = pos();
    drag(start, { x: 300, y: 200 });
    expect(pos()).toEqual({ x: 300, y: 200 });
  });

  it("clamps a drag past the top-left corner back inside the viewport", () => {
    render(<Fab />);
    drag(pos(), { x: -500, y: -500 });
    expect(pos()).toEqual({ x: MARGIN, y: MARGIN });
  });

  it("clamps a drag past the bottom-right corner back inside the viewport", () => {
    render(<Fab />);
    drag(pos(), { x: VW + 500, y: VH + 500 });
    expect(pos()).toEqual({
      x: VW - FAB_SIZE_PX - MARGIN,
      y: VH - FAB_SIZE_PX - MARGIN,
    });
  });

  it("pulls a dragged FAB back on-screen when the window shrinks", () => {
    render(<Fab />);
    drag(pos(), { x: 900, y: 700 });
    expect(pos()).toEqual({ x: 900, y: 700 });

    setViewport(600, 400);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(pos()).toEqual({ x: 600 - FAB_SIZE_PX - MARGIN, y: 400 - FAB_SIZE_PX - MARGIN });
  });

  it("keeps an undragged FAB tracking the corner on resize", () => {
    render(<Fab />);
    setViewport(600, 400);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    // Below the sm breakpoint the resting gutter is right-4 (16px).
    expect(pos()).toEqual({ x: 600 - FAB_SIZE_PX - 16, y: 400 - FAB_SIZE_PX - 24 });
  });

  it("still opens the panel on a plain click", () => {
    let toggles = 0;
    render(<Fab onToggle={() => (toggles += 1)} />);
    fireEvent.click(screen.getByTestId("fab"));
    expect(toggles).toBe(1);
  });

  it("does not toggle the panel on the click that ends a drag", () => {
    let toggles = 0;
    render(<Fab onToggle={() => (toggles += 1)} />);
    drag(pos(), { x: 300, y: 200 });
    fireEvent.click(screen.getByTestId("fab"));
    expect(toggles).toBe(0);
  });

  it("treats sub-threshold pointer jitter as a click, not a drag", () => {
    let toggles = 0;
    render(<Fab onToggle={() => (toggles += 1)} />);
    const start = pos();
    // 2px of wobble — under the 4px drag threshold.
    drag(start, { x: start.x + 2, y: start.y + 2 });
    fireEvent.click(screen.getByTestId("fab"));
    expect(pos()).toEqual(start);
    expect(toggles).toBe(1);
  });

  it("remembers the dropped position across a remount", () => {
    const { unmount } = render(<Fab />);
    drag(pos(), { x: 300, y: 200 });
    expect(JSON.parse(window.localStorage.getItem(SUPPORT_FAB_STORAGE_KEY)!)).toEqual({
      x: 300,
      y: 200,
    });

    unmount();
    render(<Fab />);
    expect(pos()).toEqual({ x: 300, y: 200 });
  });

  it("clamps a remembered position that no longer fits the viewport", () => {
    window.localStorage.setItem(SUPPORT_FAB_STORAGE_KEY, JSON.stringify({ x: 5000, y: 5000 }));
    render(<Fab />);
    expect(pos()).toEqual({ x: VW - FAB_SIZE_PX - MARGIN, y: VH - FAB_SIZE_PX - MARGIN });
  });

  it("falls back to the corner when the stored value is corrupt", () => {
    window.localStorage.setItem(SUPPORT_FAB_STORAGE_KEY, "not json");
    render(<Fab />);
    expect(pos()).toEqual({ x: VW - FAB_SIZE_PX - 24, y: VH - FAB_SIZE_PX - 24 });
  });
});

describe("getAnchoredPanelStyle", () => {
  it("returns null without an anchor, so the launcher keeps its corner styling", () => {
    expect(getAnchoredPanelStyle(null)).toBeNull();
  });

  it("right-aligns the panel with the FAB and opens upward from the bottom half", () => {
    const anchor = { x: VW - FAB_SIZE_PX - 24, y: VH - FAB_SIZE_PX - 24, size: FAB_SIZE_PX };
    const style = getAnchoredPanelStyle(anchor)!;
    // Panel right edge meets the FAB right edge: left = fabRight - 380.
    expect(style.left).toBe(anchor.x + FAB_SIZE_PX - 380);
    expect(style.bottom).toBe(VH - anchor.y + 16);
    expect(style.top).toBeUndefined();
    expect(style.maxHeight).toBeGreaterThan(0);
  });

  it("opens downward when the FAB is dragged to the top of the screen", () => {
    const style = getAnchoredPanelStyle({ x: 400, y: 20, size: FAB_SIZE_PX })!;
    expect(style.top).toBe(20 + FAB_SIZE_PX + 16);
    expect(style.bottom).toBeUndefined();
    expect(style.maxHeight).toBe(VH - (20 + FAB_SIZE_PX) - 16 - 16);
  });

  it("keeps the panel inside the left edge when the FAB is dragged there", () => {
    const style = getAnchoredPanelStyle({ x: MARGIN, y: 400, size: FAB_SIZE_PX })!;
    // Right-aligning would put it at a negative left; the gutter wins instead.
    expect(style.left).toBe(16);
  });

  it("never proposes a panel taller than the space it has", () => {
    // FAB parked dead centre — the taller side still fits within the viewport.
    const style = getAnchoredPanelStyle({ x: 400, y: VH / 2, size: FAB_SIZE_PX })!;
    expect(style.maxHeight).toBeLessThanOrEqual(VH);
    expect(style.maxHeight).toBeGreaterThan(0);
  });
});
