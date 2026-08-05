// @vitest-environment jsdom
/**
 * Regression guard for the "scrolls into blank space past the last row" bug
 * (hit hardest on Grouped Kanban's 138-row group, but the scroll model is
 * shared by every project tab).
 *
 * The tab body scrolls in the single container this layout owns. When that
 * container reached its end, the leftover wheel delta used to chain to the
 * outer shell container, which scrolled the project header + tab bar (and the
 * sidebar) out of view and left blank page background below the content.
 * Verified in Chromium: chaining moved the outer container by 400px; with
 * `overscroll-contain` the list still scrolls to its end and the outer
 * container stays at 0.
 */
import { describe, it, expect, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/spaces/p1/grouped-kanban",
  useRouter: () => ({ replace: push, push }),
}));
vi.mock("@/lib/hooks/useMyProjectPermissions", () => ({
  useMyProjectPermissions: () => ({ loading: false, has: () => true }),
}));
vi.mock("@/lib/hooks/useApiData", () => ({ useApiData: () => ({ data: null }) }));
vi.mock("@/app/(dashboard)/spaces/[id]/_components/project-header", () => ({
  ProjectHeader: () => <div data-testid="project-header">header</div>,
}));

import { render } from "@testing-library/react";
import SpaceLayout from "@/app/(dashboard)/spaces/[id]/layout";

function renderLayout() {
  return render(
    <SpaceLayout params={{ id: "p1" }}>
      <div data-testid="tab-body">tab body</div>
    </SpaceLayout>,
  );
}

describe("SpaceLayout scroll containment", () => {
  it("pins the column to the slot so a long tab can't grow the shell", () => {
    const { container } = renderLayout();
    const column = container.firstElementChild as HTMLElement;

    expect(column.className).toContain("h-full");
    expect(column.className).toContain("min-h-0");
    expect(column.className).toContain("overflow-hidden");
  });

  it("gives the tab body one scroller that does not chain outwards", () => {
    const { container, getByTestId } = renderLayout();
    const scrollers = Array.from(
      container.querySelectorAll<HTMLElement>(".overflow-y-auto"),
    );

    expect(scrollers).toHaveLength(1);
    const [scroller] = scrollers;
    // Flex-sized + min-h-0 → its height tracks the slot, its scrollHeight
    // tracks the content, so scrolling ends on the last row.
    expect(scroller.className).toContain("flex-1");
    expect(scroller.className).toContain("min-h-0");
    // The part that actually stops the wheel at the end of the list.
    expect(scroller.className).toContain("overscroll-contain");
    expect(scroller.contains(getByTestId("tab-body"))).toBe(true);
  });

  it("keeps the project header outside the scrolling area", () => {
    const { container, getByTestId } = renderLayout();
    const scroller = container.querySelector<HTMLElement>(".overflow-y-auto");

    expect(scroller?.contains(getByTestId("project-header"))).toBe(false);
  });
});
