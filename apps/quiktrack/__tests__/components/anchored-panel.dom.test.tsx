// @vitest-environment jsdom
/**
 * Dropdowns in the idea detail panel are fixed-positioned and used to pin to
 * the trigger's bottom edge unconditionally — one opened near the bottom of the
 * page was cut off, with its lower options unreachable. They must flip above
 * the trigger when there isn't room below, cap their height to the space that
 * exists, and never run off an edge.
 */
import { describe, it, expect } from "vitest";
import { useRef } from "react";
import { render } from "@testing-library/react";
import {
  anchorFromRect,
  useAnchoredPanel,
  type PanelAnchor,
} from "@/lib/hooks/useAnchoredPanel";

const VIEWPORT_H = 900;
const VIEWPORT_W = 1500;
const PANEL_H = 320;

function Panel({ anchor }: { anchor: PanelAnchor }) {
  const ref = useRef<HTMLDivElement>(null);
  const style = useAnchoredPanel(ref, anchor, { width: 256 });
  return <div ref={ref} data-testid="panel" style={style} />;
}

function place(anchor: PanelAnchor) {
  // jsdom has no layout: stand in a fixed panel height for the measurement.
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => PANEL_H,
  });
  window.innerHeight = VIEWPORT_H;
  window.innerWidth = VIEWPORT_W;
  const { getByTestId } = render(<Panel anchor={anchor} />);
  return getByTestId("panel").style;
}

describe("useAnchoredPanel", () => {
  it("opens downward when there is room below", () => {
    const style = place({ x: 100, y: 200, flipY: 176 });

    expect(style.top).toBe("200px");
    expect(style.left).toBe("100px");
  });

  it("flips above the trigger when the panel would be cut off", () => {
    // Trigger near the bottom: only 60px below, ~810px above.
    const style = place({ x: 100, y: 840, flipY: 812 });

    // Bottom edge of the flipped panel sits on the trigger's top edge.
    expect(Number.parseInt(style.top, 10)).toBe(812 - PANEL_H);
    expect(Number.parseInt(style.top, 10)).toBeGreaterThan(0);
  });

  it("caps the height to the available space so every option is reachable", () => {
    const style = place({ x: 100, y: 840, flipY: 812 });

    const top = Number.parseInt(style.top, 10);
    const maxHeight = Number.parseInt(style.maxHeight, 10);
    expect(style.overflowY).toBe("auto");
    expect(top + Math.min(PANEL_H, maxHeight)).toBeLessThanOrEqual(VIEWPORT_H);
  });

  it("clamps horizontally so the panel never runs off the right edge", () => {
    const style = place({ x: VIEWPORT_W - 40, y: 200, flipY: 176 });

    expect(Number.parseInt(style.left, 10)).toBe(VIEWPORT_W - 256 - 8);
  });

  it("captures both placements from a trigger rect", () => {
    const rect = { left: 12, top: 100, bottom: 130 } as DOMRect;
    expect(anchorFromRect(rect)).toEqual({ x: 12, y: 134, flipY: 96 });
  });
});
