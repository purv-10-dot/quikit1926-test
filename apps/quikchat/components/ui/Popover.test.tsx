import { describe, expect, it } from "vitest";
import { resolvePopover } from "./Popover";

const viewport = { width: 1000, height: 800 };
const panel = { width: 200, height: 120 };

describe("resolvePopover (viewport collision, Bug 3)", () => {
  it("keeps the preferred placement, positioning above the trigger", () => {
    const trigger = { top: 400, left: 300, width: 32, height: 32 };
    // placement "top": top = trigger.top - gap(6) - panel.height(120) = 274; left = trigger.left.
    expect(resolvePopover(trigger, panel, viewport, "top")).toEqual({
      placement: "top",
      top: 274,
      left: 300,
    });
  });

  it("flips top→bottom when the panel would overflow the top edge", () => {
    const trigger = { top: 10, left: 300, width: 32, height: 32 }; // 10 - 6 - 120 < 0
    const r = resolvePopover(trigger, panel, viewport, "top");
    expect(r.placement).toBe("bottom");
    // bottom: top = trigger.top + trigger.height + gap = 10 + 32 + 6 = 48.
    expect(r.top).toBe(48);
  });

  it("flips bottom→top when the panel would overflow the bottom edge", () => {
    const trigger = { top: 760, left: 300, width: 32, height: 32 }; // 760+32+6+120 > 800
    const r = resolvePopover(trigger, panel, viewport, "bottom");
    expect(r.placement).toBe("top");
    // top: top = 760 - 6 - 120 = 634.
    expect(r.top).toBe(634);
  });

  it("clamps left so a right-edge panel stays in the viewport", () => {
    const trigger = { top: 400, left: 950, width: 32, height: 32 }; // 950+200 > 1000-4
    const { left } = resolvePopover(trigger, panel, viewport, "top");
    expect(left).toBeLessThan(trigger.left);
    expect(left + panel.width).toBeLessThanOrEqual(viewport.width - 4);
  });

  it("never clamps the panel off the left edge", () => {
    const trigger = { top: 400, left: 2, width: 32, height: 32 };
    const wide = { width: 1200, height: 120 }; // wider than viewport
    const { left } = resolvePopover(trigger, wide, viewport, "top");
    expect(left).toBe(4); // clamped to the 4px margin
  });
});
